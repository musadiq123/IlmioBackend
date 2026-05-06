const Class = require('../models/Class');

// Generate unique Class ID like ESB-4829
const generateClassId = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const code = Array.from({ length: 3 }, () =>
    letters[Math.floor(Math.random() * letters.length)]).join('');
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${code}-${num}`;
};

// Create class (teacher only)
exports.createClass = async (req, res) => {
  try {
    const {
      name,
      subject,
      description,
      recordingEnabled,
      scheduledAt,
      startTime,
      endTime,
      duration,
      repeatDaily,
      groupName,
      studentIds,
    } = req.body;

    // Validate required fields
    if (!name || !subject || !scheduledAt) {
      return res.status(400).json({
        message: 'Missing required fields: name, subject, scheduledAt',
      });
    }

    let classId = generateClassId();

    // Make sure classId is unique
    while (await Class.findOne({ classId })) {
      classId = generateClassId();
    }

    const newClass = await Class.create({
      name,
      subject,
      description,
      recordingEnabled: recordingEnabled !== false,
      scheduledAt: new Date(scheduledAt),
      startTime,
      endTime,
      duration,
      repeatDaily: repeatDaily || false,
      groupName,
      studentIds: studentIds || [],
      classId,
      teacher: req.user._id,
    });

    res.status(201).json(newClass);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get teacher's classes
exports.getMyClasses = async (req, res) => {
  try {
    const classes = await Class.find({ teacher: req.user._id })
      .populate('students', 'name email');
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Student joins class (invite-only access)
exports.joinClass = async (req, res) => {
  try {
    // Verify requester is a student
    if (req.user.role !== 'student') {
      return res.status(403).json({
        message: 'Only students can join classes',
      });
    }

    const { classCode } = req.body;
    const cls = await Class.findOne({ classId: classCode })
      .populate('teacher', 'name')
      .populate('studentIds', 'name email');

    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Check class status - must be scheduled or live
    if (!['scheduled', 'live'].includes(cls.status)) {
      return res.status(403).json({
        message: 'Cannot join class with this status',
      });
    }

    // Validate student is invited
    const isInvited = cls.studentIds.some(
      (sid) => sid._id.toString() === req.user._id.toString()
    );

    // TODO: Check group membership when groupName is used
    // const belongsToGroup = await checkGroupMembership(req.user._id, cls.groupName);
    // const hasAccess = isInvited || (cls.groupName && belongsToGroup);

    if (!isInvited && cls.groupName) {
      // If groupName is set but student not in studentIds, they need group membership
      return res.status(403).json({
        message: 'Student not invited to this class',
      });
    }

    if (!isInvited && !cls.groupName) {
      return res.status(403).json({
        message: 'Student not invited to this class',
      });
    }

    // Add student if not already in students array
    if (!cls.students.includes(req.user._id)) {
      cls.students.push(req.user._id);
      await cls.save();
    }

    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get class status (for waiting room polling)
exports.getClassStatus = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id)
      .populate('students', 'name');
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    res.json({
      status: cls.status,
      participants: cls.students,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Start class (teacher only)
exports.startClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only teacher can start class' });
    }

    cls.status = 'live';
    await cls.save();
    res.json({ message: 'Class started', status: cls.status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// End class (teacher only)
exports.endClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    cls.status = 'ended';
    await cls.save();
    res.json({ message: 'Class ended' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Toggle recording
exports.toggleRecording = async (req, res) => {
  try {
    const { enable } = req.body;
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    cls.recordingEnabled = enable;
    await cls.save();
    res.json({ recordingEnabled: cls.recordingEnabled });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get student's joined/invited classes
exports.getJoinedClasses = async (req, res) => {
  try {
    const classes = await Class.find({
      $or: [{ students: req.user._id }, { studentIds: req.user._id }],
    })
      .populate('teacher', 'name')
      .sort({ scheduledAt: -1 });
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all live classes (for teacher dashboard)
exports.getLiveClasses = async (req, res) => {
  try {
    const liveClasses = await Class.find({ status: 'live' })
      .populate('teacher', 'name subject')
      .populate('students', 'name')
      .select(
        'name subject teacher status scheduledAt startTime endTime duration students studentIds groupName'
      );
    res.json(liveClasses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get count of live classes
exports.getLiveClassesCount = async (req, res) => {
  try {
    const count = await Class.countDocuments({ status: 'live' });
    res.json({ liveClassesCount: count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all teacher's classes (created by this teacher)
exports.getTeacherClasses = async (req, res) => {
  try {
    const classes = await Class.find({ teacher: req.user._id })
      .populate('students', 'name email')
      .populate('studentIds', 'name email')
      .sort({ scheduledAt: -1 });
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Teacher joins a live class
exports.joinLiveClass = async (req, res) => {
  try {
    // Verify requester is a teacher
    if (req.user.role !== 'teacher') {
      return res.status(403).json({
        message: 'Only teachers can access this endpoint',
      });
    }

    const { classCode } = req.body;
    const cls = await Class.findOne({ classId: classCode })
      .populate('teacher', 'name')
      .populate('students', 'name')
      .populate('studentIds', 'name');

    if (!cls) {
      return res.status(404).json({ message: 'Class not found' });
    }

    // Any teacher can join a live class
    if (cls.status !== 'live') {
      return res.status(403).json({
        message: 'Class is not live',
      });
    }

    res.json(cls);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};