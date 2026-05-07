const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const {
  recordJoin,
  recordLeave,
  updateEngagement,
  getClassAttendance,
  getMyAttendance,
} = require('../controllers/attendanceController');

/**
 * @swagger
 * tags:
 *   name: Attendance
 *   description: Class attendance and engagement tracking
 */

/**
 * @swagger
 * /api/attendance/me:
 *   get:
 *     summary: Get the current student's attendance history
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of attendance records
 */
router.get('/me', auth, getMyAttendance);

/**
 * @swagger
 * /api/attendance/{classId}:
 *   get:
 *     summary: Get attendance report for a class (teacher only)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: date
 *         schema: { type: string, format: date }
 *         description: Filter by session date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Attendance grouped by session date
 */
router.get('/:classId', auth, getClassAttendance);

/**
 * @swagger
 * /api/attendance/{classId}/join:
 *   post:
 *     summary: Record student joining a live class
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Join recorded
 */
router.post('/:classId/join', auth, recordJoin);

/**
 * @swagger
 * /api/attendance/{classId}/leave:
 *   post:
 *     summary: Record student leaving a live class
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Leave recorded
 */
router.post('/:classId/leave', auth, recordLeave);

/**
 * @swagger
 * /api/attendance/{classId}/engagement:
 *   post:
 *     summary: Update engagement metrics for a student in a session
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId]
 *             properties:
 *               studentId:     { type: string }
 *               chatMessages:  { type: integer }
 *               handRaises:    { type: integer }
 *               screenShareSec: { type: integer }
 *     responses:
 *       200:
 *         description: Engagement updated
 */
router.post('/:classId/engagement', auth, updateEngagement);

module.exports = router;
