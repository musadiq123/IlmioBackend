const Attendance = require('../models/Attendance');
const Class      = require('../models/Class');

// Derive UTC-midnight date for grouping sessions
const sessionDateOf = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// POST /api/attendance/:classId/join
exports.recordJoin = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can record attendance' });
    }

    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // Allow recording for both 'live' and 'scheduled' — the LiveKit connection
    // itself proves the student joined. 'ended' classes cannot have new joins.
    if (cls.status === 'ended') {
      return res.status(400).json({ message: 'Class has already ended' });
    }

    const sessionDate = sessionDateOf(new Date());

    // Upsert: if student re-joins the same session, update joinedAt only if no record yet
    const record = await Attendance.findOneAndUpdate(
      { classId: cls._id, studentId: req.user._id, sessionDate },
      { $setOnInsert: { joinedAt: new Date(), sessionDate } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: 'Attendance join recorded', attendance: record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/attendance/:classId/leave
exports.recordLeave = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can record attendance' });
    }

    const sessionDate = sessionDateOf(new Date());
    const now = new Date();

    const record = await Attendance.findOne({
      classId: req.params.classId,
      studentId: req.user._id,
      sessionDate,
    });

    if (!record) return res.status(404).json({ message: 'No active attendance record found' });
    if (record.leftAt)  return res.status(400).json({ message: 'Leave already recorded' });

    record.leftAt = now;
    record.durationMinutes = Math.round((now - record.joinedAt) / 60000);
    await record.save();

    res.json({ message: 'Attendance leave recorded', attendance: record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/attendance/:classId/engagement  — called by LiveKit webhook or client
exports.updateEngagement = async (req, res) => {
  try {
    const { studentId, chatMessages, handRaises, screenShareSec } = req.body;
    const sessionDate = sessionDateOf(new Date());

    const update = {};
    if (chatMessages   != null) update.chatMessages   = chatMessages;
    if (handRaises     != null) update.handRaises     = handRaises;
    if (screenShareSec != null) update.screenShareSec = screenShareSec;

    const record = await Attendance.findOneAndUpdate(
      { classId: req.params.classId, studentId, sessionDate },
      { $set: update },
      { new: true }
    );

    if (!record) return res.status(404).json({ message: 'Attendance record not found' });
    res.json({ message: 'Engagement updated', attendance: record });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/:classId  — teacher sees full attendance for a session
exports.getClassAttendance = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can view attendance' });
    }

    // Optional: filter by a specific session date
    const filter = { classId: cls._id };
    if (req.query.date) filter.sessionDate = sessionDateOf(new Date(req.query.date));

    const records = await Attendance.find(filter)
      .populate('studentId', 'name email')
      .sort({ sessionDate: -1, joinedAt: 1 });

    // Summary per session date
    const byDate = {};
    records.forEach((r) => {
      const key = r.sessionDate.toISOString().slice(0, 10);
      if (!byDate[key]) byDate[key] = { sessionDate: r.sessionDate, students: [], totalAttended: 0 };
      byDate[key].students.push(r);
      byDate[key].totalAttended += 1;
    });

    res.json({ classId: cls._id, sessions: Object.values(byDate) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/attendance/me  — student sees their own attendance history
exports.getMyAttendance = async (req, res) => {
  try {
    const records = await Attendance.find({ studentId: req.user._id })
      .populate('classId', 'name subject classId')
      .sort({ sessionDate: -1 });

    // Flatten populated classId so the client gets plain fields
    const serialized = records.map(r => {
      const obj = r.toObject();
      const cls = obj.classId;
      if (cls && typeof cls === 'object') {
        obj.classMongoId = cls._id;
        obj.className    = cls.name;
        obj.classCode    = cls.classId;
        obj.classId      = cls._id; // keep as ObjectId string for reference
      }
      return obj;
    });

    res.json(serialized);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
