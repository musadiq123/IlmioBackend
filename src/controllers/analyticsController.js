const Class      = require('../models/Class');
const User       = require('../models/User');
const Attendance = require('../models/Attendance');
const Progress   = require('../models/Progress');
const Recording  = require('../models/Recording');

// GET /api/analytics/teacher  — teacher's own dashboard metrics
exports.getTeacherAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: 'Teacher access only' });
    }

    const teacherId = req.user._id;

    const [
      totalClasses,
      liveClasses,
      endedClasses,
      classes,
      recordings,
    ] = await Promise.all([
      Class.countDocuments({ teacher: teacherId }),
      Class.countDocuments({ teacher: teacherId, status: 'live' }),
      Class.countDocuments({ teacher: teacherId, status: 'ended' }),
      Class.find({ teacher: teacherId }).select('_id name subject students studentIds'),
      Recording.find({ teacherId, status: { $in: ['ready', 'completed'] } })
        .select('viewCount durationSeconds createdAt'),
    ]);

    const classIds = classes.map((c) => c._id);
    const totalStudents = new Set(
      classes.flatMap((c) => [
        ...c.students.map(String),
        ...c.studentIds.map(String),
      ])
    ).size;

    // Attendance stats across all teacher's classes
    const [attendanceStats] = await Attendance.aggregate([
      { $match: { classId: { $in: classIds } } },
      {
        $group: {
          _id: null,
          totalRecords:    { $sum: 1 },
          avgDuration:     { $avg: '$durationMinutes' },
          totalChatMsgs:   { $sum: '$chatMessages' },
          totalHandRaises: { $sum: '$handRaises' },
        },
      },
    ]);

    // Per-class attendance rate
    const classAttendance = await Attendance.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: '$classId', attended: { $sum: 1 } } },
    ]);
    const attendanceMap = {};
    classAttendance.forEach((a) => { attendanceMap[a._id.toString()] = a.attended; });

    const classBreakdown = classes.map((c) => ({
      classId:   c._id,
      name:      c.name,
      subject:   c.subject,
      enrolled:  c.studentIds.length,
      attended:  attendanceMap[c._id.toString()] || 0,
    }));

    // Recording metrics
    const totalViews    = recordings.reduce((s, r) => s + (r.viewCount || 0), 0);
    const totalRecHours = recordings.reduce((s, r) => s + (r.durationSeconds || 0), 0) / 3600;

    // Progress: average completion across all students in teacher's classes
    const [progressStats] = await Progress.aggregate([
      { $match: { classId: { $in: classIds } } },
      { $group: { _id: null, avgCompletion: { $avg: '$completionRate' } } },
    ]);

    res.json({
      overview: {
        totalClasses,
        liveClasses,
        endedClasses,
        totalStudents,
        totalRecordings: recordings.length,
        totalRecordingHours: Math.round(totalRecHours * 10) / 10,
        totalRecordingViews: totalViews,
        avgAttendanceDurationMin: Math.round((attendanceStats?.avgDuration || 0) * 10) / 10,
        avgStudentCompletion: Math.round(progressStats?.avgCompletion || 0),
      },
      engagement: {
        totalChatMessages: attendanceStats?.totalChatMsgs || 0,
        totalHandRaises:   attendanceStats?.totalHandRaises || 0,
      },
      classBreakdown,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/analytics/teacher/class/:classId  — detailed stats for one class
exports.getClassAnalytics = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId)
      .populate('students', 'name email')
      .populate('studentIds', 'name email');

    if (!cls) return res.status(404).json({ message: 'Class not found' });
    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can view analytics' });
    }

    // Attendance per student
    const attendanceRecords = await Attendance.find({ classId: cls._id })
      .populate('studentId', 'name email');

    const studentStats = {};
    attendanceRecords.forEach((r) => {
      const sid = r.studentId._id.toString();
      if (!studentStats[sid]) {
        studentStats[sid] = {
          student: { id: r.studentId._id, name: r.studentId.name, email: r.studentId.email },
          sessions: 0,
          totalMinutes: 0,
          chatMessages: 0,
          handRaises: 0,
        };
      }
      studentStats[sid].sessions      += 1;
      studentStats[sid].totalMinutes  += r.durationMinutes || 0;
      studentStats[sid].chatMessages  += r.chatMessages || 0;
      studentStats[sid].handRaises    += r.handRaises || 0;
    });

    // Attendance over time (by session date)
    const sessionTrend = await Attendance.aggregate([
      { $match: { classId: cls._id } },
      { $group: { _id: '$sessionDate', count: { $sum: 1 }, avgDuration: { $avg: '$durationMinutes' } } },
      { $sort: { _id: 1 } },
    ]);

    // Recording stats for this class
    const recordings = await Recording.find({ classId: cls._id, status: { $in: ['ready', 'completed'] } })
      .select('viewCount durationSeconds createdAt chapters transcript');

    const progressRecords = await Progress.find({ classId: cls._id })
      .populate('studentId', 'name email')
      .select('studentId completionRate sessionsAttended grade assignments quizResults');

    res.json({
      class: { id: cls._id, name: cls.name, subject: cls.subject, classId: cls.classId },
      enrolled: cls.studentIds.length,
      sessionTrend,
      studentStats: Object.values(studentStats),
      recordings: recordings.map((r) => ({
        id: r._id,
        durationSeconds: r.durationSeconds,
        viewCount: r.viewCount,
        chapters: r.chapters?.length || 0,
        hasTranscript: r.transcript?.status === 'completed',
        createdAt: r.createdAt,
      })),
      progress: progressRecords,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/analytics/admin  — platform-wide overview (admin role only)
exports.getAdminAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only' });
    }

    const [
      totalUsers,
      totalTeachers,
      totalStudents,
      totalClasses,
      liveClasses,
      endedClasses,
      totalRecordings,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'teacher' }),
      User.countDocuments({ role: 'student' }),
      Class.countDocuments(),
      Class.countDocuments({ status: 'live' }),
      Class.countDocuments({ status: 'ended' }),
      Recording.countDocuments({ status: { $in: ['ready', 'completed'] } }),
    ]);

    // New users over last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    // Active classes (scheduled + live)
    const activeClasses = await Class.countDocuments({ status: { $in: ['scheduled', 'live'] } });

    // Top 5 most-viewed recordings
    const topRecordings = await Recording.find({ status: { $in: ['ready', 'completed'] } })
      .sort({ viewCount: -1 })
      .limit(5)
      .select('className viewCount durationSeconds createdAt');

    // Class creation trend (by month, last 6 months)
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const classTrend = await Class.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    res.json({
      users: { total: totalUsers, teachers: totalTeachers, students: totalStudents, newLast30Days: newUsers },
      classes: { total: totalClasses, live: liveClasses, ended: endedClasses, active: activeClasses },
      recordings: { total: totalRecordings },
      topRecordings,
      classTrend,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/analytics/student  — student's own learning overview
exports.getStudentAnalytics = async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ message: 'Student access only' });
    }

    const studentId = req.user._id;

    const [attendance, progress, classes] = await Promise.all([
      Attendance.find({ studentId }).populate('classId', 'name subject'),
      Progress.find({ studentId }).populate('classId', 'name subject'),
      Class.find({
        $or: [{ students: studentId }, { studentIds: studentId }],
      }).select('name subject status'),
    ]);

    const totalMinutes  = attendance.reduce((s, a) => s + (a.durationMinutes || 0), 0);
    const avgCompletion = progress.length > 0
      ? Math.round(progress.reduce((s, p) => s + p.completionRate, 0) / progress.length)
      : 0;

    res.json({
      classes:       { total: classes.length, live: classes.filter((c) => c.status === 'live').length },
      attendance:    { sessions: attendance.length, totalMinutes, avgMinutesPerSession: attendance.length ? Math.round(totalMinutes / attendance.length) : 0 },
      progress:      { avgCompletion, records: progress.length },
      recentActivity: attendance.slice(0, 5),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
