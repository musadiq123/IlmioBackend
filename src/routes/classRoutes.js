const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const {
  createClass,
  getMyClasses,
  joinClass,
  getClassStatus,
  startClass,
  endClass,
  toggleRecording,
  getJoinedClasses,
} = require('../controllers/classController');

/**
 * @swagger
 * tags:
 *   name: Classes
 *   description: Class management
 */

/**
 * @swagger
 * /api/classes:
 *   post:
 *     summary: Create a new class (teacher only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, subject]
 *             properties:
 *               name:             { type: string, example: English Speaking A1 }
 *               subject:          { type: string, example: English }
 *               description:      { type: string, example: Beginner level class }
 *               recordingEnabled: { type: boolean, example: true }
 *     responses:
 *       201:
 *         description: Class created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Class'
 *       401:
 *         description: Unauthorized
 */
router.post('/', auth, createClass);

/**
 * @swagger
 * /api/classes/mine:
 *   get:
 *     summary: Get all classes created by the logged-in teacher
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of teacher classes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Class'
 */
router.get('/mine', auth, getMyClasses);

/**
 * @swagger
 * /api/classes/joined:
 *   get:
 *     summary: Get all classes the logged-in student has joined
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of joined classes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Class'
 */
router.get('/joined', auth, getJoinedClasses);

/**
 * @swagger
 * /api/classes/join:
 *   post:
 *     summary: Student joins a class using class code
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classCode]
 *             properties:
 *               classCode: { type: string, example: ESB-4829 }
 *     responses:
 *       200:
 *         description: Joined class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Class'
 *       404:
 *         description: Class not found
 */
router.post('/join', auth, joinClass);

/**
 * @swagger
 * /api/classes/{id}/status:
 *   get:
 *     summary: Get current status of a class (for waiting room polling)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Class MongoDB ID
 *     responses:
 *       200:
 *         description: Class status and participants
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:       { type: string, enum: [scheduled, live, ended] }
 *                 participants: { type: array, items: { type: object } }
 *       404:
 *         description: Class not found
 */
router.get('/:id/status', auth, getClassStatus);

/**
 * @swagger
 * /api/classes/{id}/start:
 *   post:
 *     summary: Start a class (teacher only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Class started
 *       403:
 *         description: Only teacher can start class
 *       404:
 *         description: Class not found
 */
router.post('/:id/start', auth, startClass);

/**
 * @swagger
 * /api/classes/{id}/end:
 *   post:
 *     summary: End a class (teacher only)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Class ended
 *       404:
 *         description: Class not found
 */
router.post('/:id/end', auth, endClass);

/**
 * @swagger
 * /api/classes/{id}/recording:
 *   post:
 *     summary: Toggle recording on/off for a class
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enable]
 *             properties:
 *               enable: { type: boolean, example: true }
 *     responses:
 *       200:
 *         description: Recording toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordingEnabled: { type: boolean }
 *       404:
 *         description: Class not found
 */
router.post('/:id/recording', auth, toggleRecording);

module.exports = router;