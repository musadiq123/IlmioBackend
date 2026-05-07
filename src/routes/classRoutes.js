const router      = require('express').Router();
const auth        = require('../middleware/authMiddleware');
const requireRole = require('../middleware/requireRole');
const { cacheResponse } = require('../middleware/cacheMiddleware');
const {
  createClass,
  getMyClasses,
  joinClass,
  getClassStatus,
  startClass,
  endClass,
  toggleRecording,
  getJoinedClasses,
  getLiveClasses,
  getLiveClassesCount,
  getTeacherClasses,
  joinLiveClass,
  getOccurrences,
  addException,
  removeException,
  rescheduleInstance,
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
 *             required: [name, subject, scheduledAt]
 *             properties:
 *               name:             { type: string, example: English Speaking A1 }
 *               subject:          { type: string, example: English }
 *               description:      { type: string, example: Beginner level class }
 *               recordingEnabled: { type: boolean, example: true }
 *               scheduledAt:      { type: string, format: date-time, example: "2026-05-15T10:00:00Z" }
 *               startTime:        { type: string, example: "10:00" }
 *               endTime:          { type: string, example: "11:00" }
 *               duration:         { type: string, example: "1 hour" }
 *               repeatDaily:      { type: boolean, example: false }
 *               groupName:        { type: string, example: "Advanced Learners" }
 *               studentIds:       { type: array, items: { type: string }, example: ["60d5ec49c1234567890abcde"] }
 *     responses:
 *       201:
 *         description: Class created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Class'
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post('/', auth, requireRole('teacher'), createClass);

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
 *     summary: Student joins a class (invite-only - student must be in studentIds)
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
 *       403:
 *         description: Student not invited to this class
 *       404:
 *         description: Class not found
 */
router.post('/join', auth, joinClass);

/**
 * @swagger
 * /api/classes/live/list:
 *   get:
 *     summary: Get all live classes (for teacher dashboard)
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of live classes
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Class'
 */
router.get('/live/list', auth, cacheResponse(15), getLiveClasses);

/**
 * @swagger
 * /api/classes/live/count:
 *   get:
 *     summary: Get total count of live classes
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Live classes count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liveClassesCount: { type: integer, example: 5 }
 */
router.get('/live/count', auth, cacheResponse(30), getLiveClassesCount);

/**
 * @swagger
 * /api/classes/live/join:
 *   post:
 *     summary: Teacher joins a live class
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
 *         description: Joined live class successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Class'
 *       403:
 *         description: Only teachers can access, or class is not live
 *       404:
 *         description: Class not found
 */
router.post('/live/join', auth, joinLiveClass);

/**
 * @swagger
 * /api/classes/teacher/all:
 *   get:
 *     summary: Get all classes created by the logged-in teacher (with full details)
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
router.get('/teacher/all', auth, requireRole('teacher'), getTeacherClasses);

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
router.post('/:id/start', auth, requireRole('teacher'), startClass);

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
router.post('/:id/end', auth, requireRole('teacher'), endClass);

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

/**
 * @swagger
 * /api/classes/{id}/occurrences:
 *   get:
 *     summary: Get upcoming occurrences of a recurring class
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *         description: Start of range (default now)
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *         description: End of range (default now+30 days)
 *     responses:
 *       200:
 *         description: List of occurrence dates with reschedule info
 */
router.get('/:id/occurrences', auth, getOccurrences);

/**
 * @swagger
 * /api/classes/{id}/exceptions:
 *   post:
 *     summary: Skip (cancel) a specific occurrence of a recurring class
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date]
 *             properties:
 *               date: { type: string, example: "2026-05-20" }
 *     responses:
 *       200:
 *         description: Exception added
 *   delete:
 *     summary: Restore a previously cancelled occurrence
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date]
 *             properties:
 *               date: { type: string, example: "2026-05-20" }
 *     responses:
 *       200:
 *         description: Exception removed
 */
router.post('/:id/exceptions', auth, addException);
router.delete('/:id/exceptions', auth, removeException);

/**
 * @swagger
 * /api/classes/{id}/reschedule:
 *   post:
 *     summary: Move a specific occurrence to a new date/time
 *     tags: [Classes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [originalDate, newDate]
 *             properties:
 *               originalDate: { type: string, example: "2026-05-20" }
 *               newDate:      { type: string, format: date-time, example: "2026-05-22T10:00:00Z" }
 *               reason:       { type: string, example: "Public holiday" }
 *     responses:
 *       200:
 *         description: Occurrence rescheduled
 */
router.post('/:id/reschedule', auth, rescheduleInstance);

module.exports = router;