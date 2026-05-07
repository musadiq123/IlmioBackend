const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const {
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  registerFcmToken,
} = require('../controllers/notificationController');

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: In-app and push notifications
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get current user's notifications (paginated)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated notifications
 */
router.get('/', auth, getNotifications);

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Get count of unread notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unreadCount: { type: integer }
 */
router.get('/unread-count', auth, getUnreadCount);

/**
 * @swagger
 * /api/notifications/read-all:
 *   patch:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All marked read
 */
router.patch('/read-all', auth, markAllRead);

/**
 * @swagger
 * /api/notifications/fcm-token:
 *   post:
 *     summary: Register or update FCM device token for push notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, example: "fcm-device-token-here" }
 *     responses:
 *       200:
 *         description: Token registered
 */
router.post('/fcm-token', auth, registerFcmToken);

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   patch:
 *     summary: Mark a single notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Notification marked read
 *       404:
 *         description: Not found
 */
router.patch('/:id/read', auth, markRead);

module.exports = router;
