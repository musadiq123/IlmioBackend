const router = require('express').Router();
const auth   = require('../middleware/authMiddleware');
const { getToken } = require('../controllers/livekitController');

/**
 * @swagger
 * tags:
 *   name: LiveKit
 *   description: LiveKit room token generation
 */

/**
 * @swagger
 * /api/livekit/token:
 *   post:
 *     summary: Generate a LiveKit access token for joining a room
 *     tags: [LiveKit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roomName]
 *             properties:
 *               roomName:
 *                 type: string
 *                 example: class-ESB-4829
 *               participantName:
 *                 type: string
 *                 example: Alice
 *     responses:
 *       200:
 *         description: JWT token for LiveKit room
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: roomName missing
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server credential error
 */
router.post('/token', auth, getToken);

module.exports = router;
