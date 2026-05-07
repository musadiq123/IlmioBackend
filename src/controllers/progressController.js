const Progress  = require('../models/Progress');
const Class     = require('../models/Class');
const Attendance = require('../models/Attendance');

// Helper: get-or-create progress record
const getOrCreate = async (studentId, classId) =>
  Progress.findOneAndUpdate(
    { studentId, classId },
    { $setOnInsert: { studentId, classId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

// Recalculate completionRate from sessions + assignment scores
const recalcCompletion = async (progress) => {
  const sessionScore = progress.totalSessions > 0
    ? (progress.sessionsAttended / progress.totalSessions) * 60  // 60% weight
    : 0;

  const graded = progress.assignments.filter((a) => a.status === 'graded');
  const assignScore = graded.length > 0
    ? (graded.reduce((sum, a) => sum + (a.score / a.maxScore), 0) / graded.length) * 40  // 40% weight
    : 0;

  progress.completionRate = Math.round(sessionScore + assignScore);
  progress.lastActivity = new Date();
  await progress.save();
};

// ── Student endpoints ─────────────────────────────────────────────────────────

// GET /api/progress/me  — student's progress across all classes
exports.getMyProgress = async (req, res) => {
  try {
    const records = await Progress.find({ studentId: req.user._id })
      .populate('classId', 'name subject classId teacher')
      .sort({ lastActivity: -1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/progress/me/:classId  — student's progress for one class
exports.getMyClassProgress = async (req, res) => {
  try {
    const progress = await getOrCreate(req.user._id, req.params.classId);
    await progress.populate('classId', 'name subject classId');
    res.json(progress);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/progress/me/:classId/notes  — student updates notes
exports.updateNotes = async (req, res) => {
  try {
    const { notes } = req.body;
    const progress = await getOrCreate(req.user._id, req.params.classId);
    progress.notes = notes || '';
    progress.lastActivity = new Date();
    await progress.save();
    res.json({ message: 'Notes updated', notes: progress.notes });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/progress/me/:classId/assignments/:assignmentId/submit
exports.submitAssignment = async (req, res) => {
  try {
    const { fileUrl } = req.body;
    const progress = await Progress.findOne({ studentId: req.user._id, classId: req.params.classId });
    if (!progress) return res.status(404).json({ message: 'Progress record not found' });

    const assignment = progress.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });
    if (assignment.status !== 'pending') {
      return res.status(400).json({ message: 'Assignment already submitted' });
    }

    assignment.fileUrl     = fileUrl;
    assignment.submittedAt = new Date();
    assignment.status      = 'submitted';
    progress.lastActivity  = new Date();
    await progress.save();

    res.json({ message: 'Assignment submitted', assignment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/progress/me/:classId/quiz  — submit quiz answers (auto-grade)
exports.submitQuiz = async (req, res) => {
  try {
    const { quizId, title, answers } = req.body;
    // answers: [{ question, selected, correctAnswer }]
    if (!quizId || !answers) return res.status(400).json({ message: 'quizId and answers required' });

    const graded = answers.map((a) => ({
      question: a.question,
      selected: a.selected,
      correct:  a.selected === a.correctAnswer,
    }));
    const score    = graded.filter((a) => a.correct).length;
    const maxScore = graded.length;

    const progress = await getOrCreate(req.user._id, req.params.classId);

    // Remove any previous attempt for same quizId
    progress.quizResults = progress.quizResults.filter((q) => q.quizId !== quizId);
    progress.quizResults.push({ quizId, title, score, maxScore, takenAt: new Date(), answers: graded });
    progress.lastActivity = new Date();
    await recalcCompletion(progress);

    res.json({ score, maxScore, percentage: Math.round((score / maxScore) * 100) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── Teacher endpoints ─────────────────────────────────────────────────────────

// GET /api/progress/class/:classId  — teacher views all students' progress
exports.getClassProgress = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can view progress' });
    }

    const records = await Progress.find({ classId: cls._id })
      .populate('studentId', 'name email')
      .sort({ completionRate: -1 });

    res.json({ classId: cls._id, students: records });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/progress/class/:classId/assignments  — teacher creates assignment for all enrolled students
exports.createAssignment = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can add assignments' });
    }

    const { title, description, dueDate, maxScore } = req.body;
    if (!title) return res.status(400).json({ message: 'title is required' });

    const assignment = { title, description, dueDate, maxScore: maxScore || 100, status: 'pending' };

    // Add assignment to every enrolled student's progress record
    const studentIds = [...new Set([...cls.studentIds.map(String), ...cls.students.map(String)])];
    await Promise.all(
      studentIds.map(async (sid) => {
        const p = await getOrCreate(sid, cls._id);
        p.assignments.push(assignment);
        await p.save();
      })
    );

    res.status(201).json({ message: 'Assignment created for all students', assignment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/progress/class/:classId/students/:studentId/grade  — teacher grades student
exports.gradeStudent = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can grade students' });
    }

    const { grade, comment } = req.body;
    const progress = await Progress.findOneAndUpdate(
      { classId: cls._id, studentId: req.params.studentId },
      { grade, comment, lastActivity: new Date() },
      { new: true }
    );
    if (!progress) return res.status(404).json({ message: 'Progress record not found' });
    res.json({ message: 'Student graded', grade: progress.grade, comment: progress.comment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/progress/class/:classId/students/:studentId/assignments/:assignmentId/grade
exports.gradeAssignment = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can grade assignments' });
    }

    const { score, feedback } = req.body;
    const progress = await Progress.findOne({ classId: cls._id, studentId: req.params.studentId });
    if (!progress) return res.status(404).json({ message: 'Progress record not found' });

    const assignment = progress.assignments.id(req.params.assignmentId);
    if (!assignment) return res.status(404).json({ message: 'Assignment not found' });

    assignment.score    = score;
    assignment.feedback = feedback;
    assignment.status   = 'graded';
    await recalcCompletion(progress);

    res.json({ message: 'Assignment graded', assignment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
