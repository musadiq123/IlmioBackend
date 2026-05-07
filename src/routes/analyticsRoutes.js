const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const { cacheResponse } = require('../middleware/cacheMiddleware');
const {
  getTeacherAnalytics,
  getClassAnalytics,
  getAdminAnalytics,
  getStudentAnalytics,
} = require('../controllers/analyticsController');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Platform analytics and reporting
 */

/**
 * @swagger
 * /api/analytics/teacher:
 *   get:
 *     summary: Teacher's dashboard — class, attendance, and recording stats
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Teacher analytics overview
 */
router.get('/teacher', auth, cacheResponse(120), getTeacherAnalytics);

/**
 * @swagger
 * /api/analytics/teacher/class/{classId}:
 *   get:
 *     summary: Detailed analytics for a single class (teacher only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Per-class analytics
 */
router.get('/teacher/class/:classId', auth, getClassAnalytics);

/**
 * @swagger
 * /api/analytics/student:
 *   get:
 *     summary: Student's learning overview
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Student analytics
 */
router.get('/student', auth, cacheResponse(120), getStudentAnalytics);

/**
 * @swagger
 * /api/analytics/admin:
 *   get:
 *     summary: Platform-wide analytics (admin only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin overview
 */
router.get('/admin', auth, cacheResponse(300), getAdminAnalytics);

module.exports = router;
