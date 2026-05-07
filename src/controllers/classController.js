const Class = require('../models/Class');
const { notifyClass } = require('../utils/notificationService');
const { parsePagination, paginationMeta } = require('../utils/pagination');

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

    const {
      recurrenceType,
      recurrenceDays,
      recurrenceInterval,
      recurrenceEndDate,
    } = req.body;

    // Derive repeatDaily from recurrenceType for backwards-compat
    const resolvedRepeatDaily = repeatDaily || recurrenceType === 'daily';

    // Validate weekly recurrence has at least one day
    if (recurrenceType === 'weekly' && (!recurrenceDays || recurrenceDays.length === 0)) {
      return res.status(400).json({ message: 'recurrenceDays is required for weekly recurrence' });
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
      repeatDaily: resolvedRepeatDaily,
      recurrenceType: recurrenceType || 'none',
      recurrenceDays: recurrenceDays || [],
      recurrenceInterval: recurrenceInterval || 1,
      recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : undefined,
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
      .populate('students', 'name email')
      .populate('studentIds', 'name email');
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

    notifyClass(
      cls, 'class_started',
      `${cls.name} is now live!`,
      `Your class "${cls.name}" has started. Join now.`,
      { classId: cls._id.toString() }
    ).catch(() => {});

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

// Get student's joined/invited classes (paginated)
exports.getJoinedClasses = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { $or: [{ students: req.user._id }, { studentIds: req.user._id }] };

    const [classes, total] = await Promise.all([
      Class.find(filter)
        .populate('teacher', 'name')
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(limit),
      Class.countDocuments(filter),
    ]);

    res.json({ data: classes, pagination: paginationMeta(page, limit, total) });
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

// Get all teacher's classes (paginated, filterable by status)
exports.getTeacherClasses = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { teacher: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [classes, total] = await Promise.all([
      Class.find(filter)
        .populate('students', 'name email')
        .populate('studentIds', 'name email')
        .sort({ scheduledAt: -1 })
        .skip(skip)
        .limit(limit),
      Class.countDocuments(filter),
    ]);

    res.json({ data: classes, pagination: paginationMeta(page, limit, total) });
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

// ── Recurrence helpers ────────────────────────────────────────────────────────

/**
 * Generate upcoming occurrence dates for a class between `from` and `to`.
 * Respects exceptions and reschedule overrides.
 */
const generateOccurrences = (cls, from, to) => {
  if (cls.recurrenceType === 'none') {
    const d = cls.scheduledAt;
    if (d >= from && d <= to) return [{ date: d, rescheduled: false }];
    return [];
  }

  const exceptions = new Set(
    (cls.recurrenceExceptions || []).map((d) => d.toISOString().slice(0, 10))
  );
  const rescheduleMap = {};
  (cls.recurrenceReschedules || []).forEach((r) => {
    rescheduleMap[r.originalDate.toISOString().slice(0, 10)] = r.newDate;
  });

  const occurrences = [];
  const end = cls.recurrenceEndDate ? new Date(Math.min(to, cls.recurrenceEndDate)) : to;
  const cursor = new Date(cls.scheduledAt);

  // Advance cursor to `from` window
  while (cursor < from) {
    advanceCursor(cursor, cls);
  }

  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 10);
    if (!exceptions.has(key)) {
      const actualDate = rescheduleMap[key] ? new Date(rescheduleMap[key]) : new Date(cursor);
      occurrences.push({ date: actualDate, originalDate: new Date(cursor), rescheduled: !!rescheduleMap[key] });
    }
    advanceCursor(cursor, cls);
  }

  return occurrences;
};

const advanceCursor = (cursor, cls) => {
  if (cls.recurrenceType === 'daily') {
    cursor.setDate(cursor.getDate() + 1);
  } else if (cls.recurrenceType === 'weekly') {
    // Move to next matching day-of-week
    do {
      cursor.setDate(cursor.getDate() + 1);
    } while (!cls.recurrenceDays.includes(cursor.getDay()));
  } else if (cls.recurrenceType === 'monthly') {
    cursor.setMonth(cursor.getMonth() + 1);
  } else if (cls.recurrenceType === 'custom') {
    cursor.setDate(cursor.getDate() + (cls.recurrenceInterval || 1));
  } else {
    cursor.setFullYear(cursor.getFullYear() + 100); // stop iteration
  }
};

// GET /api/classes/:id/occurrences?from=ISO&to=ISO
exports.getOccurrences = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to   = req.query.to   ? new Date(req.query.to)   : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const occurrences = generateOccurrences(cls, from, to);
    res.json({ classId: cls._id, recurrenceType: cls.recurrenceType, occurrences });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/classes/:id/exceptions  { date: "YYYY-MM-DD", reason?: string }
exports.addException = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can modify recurrence' });
    }

    const { date } = req.body;
    if (!date) return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });

    const exceptionDate = new Date(date);
    const alreadyExists = cls.recurrenceExceptions.some(
      (d) => d.toISOString().slice(0, 10) === exceptionDate.toISOString().slice(0, 10)
    );
    if (!alreadyExists) {
      cls.recurrenceExceptions.push(exceptionDate);
      await cls.save();
    }

    res.json({ message: 'Exception added', exceptions: cls.recurrenceExceptions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/classes/:id/exceptions  { date: "YYYY-MM-DD" }
exports.removeException = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can modify recurrence' });
    }

    const { date } = req.body;
    if (!date) return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });

    cls.recurrenceExceptions = cls.recurrenceExceptions.filter(
      (d) => d.toISOString().slice(0, 10) !== date
    );
    await cls.save();

    res.json({ message: 'Exception removed', exceptions: cls.recurrenceExceptions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/classes/:id/reschedule  { originalDate: "YYYY-MM-DD", newDate: ISO, reason?: string }
exports.rescheduleInstance = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can reschedule' });
    }

    const { originalDate, newDate, reason } = req.body;
    if (!originalDate || !newDate) {
      return res.status(400).json({ message: 'originalDate and newDate are required' });
    }

    const origKey = new Date(originalDate).toISOString().slice(0, 10);

    // Remove existing reschedule for same original date (upsert)
    cls.recurrenceReschedules = cls.recurrenceReschedules.filter(
      (r) => r.originalDate.toISOString().slice(0, 10) !== origKey
    );
    cls.recurrenceReschedules.push({
      originalDate: new Date(originalDate),
      newDate: new Date(newDate),
      reason: reason || '',
    });
    await cls.save();

    res.json({ message: 'Instance rescheduled', reschedules: cls.recurrenceReschedules });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};