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
    const { name, subject, description, recordingEnabled } = req.body;
    let classId = generateClassId();

    // Make sure classId is unique
    while (await Class.findOne({ classId })) {
      classId = generateClassId();
    }

    const newClass = await Class.create({
      name,
      subject,
      description,
      recordingEnabled,
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

// Student joins class
exports.joinClass = async (req, res) => {
  try {
    const { classCode } = req.body;
    const cls = await Class.findOne({ classId: classCode })
      .populate('teacher', 'name');

    if (!cls) return res.status(404).json({ message: 'Class not found' });

    // Add student if not already joined
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

// Get student's joined classes
exports.getJoinedClasses = async (req, res) => {
  try {
    const classes = await Class.find({ students: req.user._id })
      .populate('teacher', 'name');
    res.json(classes);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};