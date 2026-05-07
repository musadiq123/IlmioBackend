const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const {
  getMyProgress,
  getMyClassProgress,
  updateNotes,
  submitAssignment,
  submitQuiz,
  getClassProgress,
  createAssignment,
  gradeStudent,
  gradeAssignment,
} = require('../controllers/progressController');

/**
 * @swagger
 * tags:
 *   name: Progress
 *   description: Student progress, assignments, and LMS features
 */

// ── Student routes ────────────────────────────────────────────────────────────

/** @swagger
 * /api/progress/me:
 *   get:
 *     summary: Get current student's progress across all classes
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of progress records
 */
router.get('/me', auth, getMyProgress);

/** @swagger
 * /api/progress/me/{classId}:
 *   get:
 *     summary: Get student's progress for a specific class
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Progress record
 */
router.get('/me/:classId', auth, getMyClassProgress);

/** @swagger
 * /api/progress/me/{classId}/notes:
 *   patch:
 *     summary: Update student's private notes for a class
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/me/:classId/notes', auth, updateNotes);

/** @swagger
 * /api/progress/me/{classId}/assignments/{assignmentId}/submit:
 *   post:
 *     summary: Submit an assignment
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.post('/me/:classId/assignments/:assignmentId/submit', auth, submitAssignment);

/** @swagger
 * /api/progress/me/{classId}/quiz:
 *   post:
 *     summary: Submit quiz answers (auto-graded)
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.post('/me/:classId/quiz', auth, submitQuiz);

// ── Teacher routes ────────────────────────────────────────────────────────────

/** @swagger
 * /api/progress/class/{classId}:
 *   get:
 *     summary: Get all students' progress for a class (teacher only)
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.get('/class/:classId', auth, getClassProgress);

/** @swagger
 * /api/progress/class/{classId}/assignments:
 *   post:
 *     summary: Create an assignment for all enrolled students (teacher only)
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.post('/class/:classId/assignments', auth, createAssignment);

/** @swagger
 * /api/progress/class/{classId}/students/{studentId}/grade:
 *   patch:
 *     summary: Set overall grade and comment for a student (teacher only)
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/class/:classId/students/:studentId/grade', auth, gradeStudent);

/** @swagger
 * /api/progress/class/{classId}/students/{studentId}/assignments/{assignmentId}/grade:
 *   patch:
 *     summary: Grade a specific assignment submission (teacher only)
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/class/:classId/students/:studentId/assignments/:assignmentId/grade', auth, gradeAssignment);

module.exports = router;
