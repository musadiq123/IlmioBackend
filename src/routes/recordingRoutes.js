const express = require('express');
const router = express.Router();
const auth   = require('../middleware/authMiddleware');
const {
  requestUpload,
  completeUpload,
  startLivekitRecording,
  stopLivekitRecording,
  livekitWebhook,
  listByClass,
  getPlaybackUrl,
  archiveRecording,
  deleteRecording,
  updateChapters,
  requestTranscript,
  saveTranscript,
  saveSummary,
  incrementView,
} = require('../controllers/recordingController');

/**
 * @swagger
 * tags:
 *   name: Recordings
 *   description: Session recording management and playback
 */

/**
 * @swagger
 * /api/recordings/request-upload:
 *   post:
 *     summary: Request a signed Firebase Storage upload URL (teacher only)
 *     description: >
 *       Returns signed upload parameters. The client uses these to upload
 *       the video file directly to Firebase Storage (never goes through your server).
 *       After upload succeeds call POST /api/recordings/:id/complete.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [classId]
 *             properties:
 *               classId:
 *                 type: string
 *                 example: 64c1f4b2e9f0a12345678abc
 *     responses:
 *       201:
 *         description: Signed upload parameters returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 recordingId: { type: string }
 *                 sessionId:   { type: string }
 *                 uploadParams:
 *                   type: object
 *                   properties:
 *                     url:           { type: string }
 *                     public_id:     { type: string }
 *                     api_key:       { type: string }
 *                     timestamp:     { type: integer }
 *                     signature:     { type: string }
 *                     resource_type: { type: string, example: video }
 *       400:
 *         description: classId missing
 *       403:
 *         description: Not the class teacher
 *       404:
 *         description: Class not found
 */
router.post('/request-upload', auth, requestUpload);

/**
 * @swagger
 * /api/recordings/{id}/complete:
 *   post:
 *     summary: Mark recording upload as complete with Firebase metadata
 *     description: Call this after Firebase Storage upload completes. If a temp file exists on server, uploads it to Firebase. Otherwise saves the provided playback URL and marks status as ready.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Recording ID returned from request-upload
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [playbackUrl]
 *             properties:
 *               playbackUrl:  { type: string, example: "https://firebasestorage.googleapis.com/..." }
 *               durationSec:  { type: number, example: 3600 }
 *               sizeBytes:    { type: number, example: 524288000 }
 *               mimeType:     { type: string, example: video/mp4 }
 *     responses:
 *       200:
 *         description: Recording marked as ready
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Recording'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Recording not found
 *       409:
 *         description: Recording not in uploading state
 */
router.post('/:id/complete', auth, completeUpload);

// LiveKit egress start aliases
router.post('/livekit/start', auth, startLivekitRecording);
router.post('/start-livekit', auth, startLivekitRecording);
router.post('/egress/start', auth, startLivekitRecording);

// LiveKit egress stop aliases
router.post('/livekit/stop', auth, stopLivekitRecording);
router.post('/stop-livekit', auth, stopLivekitRecording);
router.post('/egress/stop', auth, stopLivekitRecording);

// LiveKit webhook finalization (raw body required for signature validation)
router.post(
  '/livekit/webhook',
  express.raw({ type: ['application/webhook+json', 'application/json'] }),
  livekitWebhook
);

/**
 * @swagger
 * /api/recordings/class/{classId}:
 *   get:
 *     summary: List all recordings for a class
 *     description: Returns recordings for the class. Accessible by teacher and enrolled students.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: classId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of recordings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Recording'
 *       403:
 *         description: Not enrolled in this class
 *       404:
 *         description: Class not found
 */
router.get('/class/:classId', auth, listByClass);

/**
 * @swagger
 * /api/recordings/{id}/play:
 *   get:
 *     summary: Get a time-limited signed playback URL (10 min expiry)
 *     description: Returns a signed URL for streaming the video. Only accessible to teacher and enrolled students.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Signed playback URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 playbackUrl: { type: string }
 *                 fallbackUrl: { type: string }
 *                 expiresAt:   { type: string, format: date-time }
 *       403:
 *         description: Access denied
 *       404:
 *         description: Recording not found
 *       409:
 *         description: Recording not ready
 */
router.get('/:id/play', auth, getPlaybackUrl);

/**
 * @swagger
 * /api/recordings/{id}/archive:
 *   patch:
 *     summary: Archive a recording (teacher only)
 *     description: Marks the recording as archived. Useful for moving old recordings to cheaper storage tier.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recording archived
 *       403:
 *         description: Only teacher can archive
 *       404:
 *         description: Recording not found
 */
router.patch('/:id/archive', auth, archiveRecording);

/**
 * @swagger
 * /api/recordings/{id}:
 *   delete:
 *     summary: Delete a recording (teacher only)
 *     description: Soft-deletes the recording in DB and removes the video from Firebase Storage.
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Recording deleted
 *       403:
 *         description: Only teacher can delete
 *       404:
 *         description: Recording not found
 */
router.delete('/:id', auth, deleteRecording);

// ── Enhanced recording routes ──────────────────────────────────────────────

/**
 * @swagger
 * /api/recordings/{id}/chapters:
 *   patch:
 *     summary: Add or replace video chapters (teacher only)
 *     tags: [Recordings]
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
 *             required: [chapters]
 *             properties:
 *               chapters:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     title:       { type: string }
 *                     startSec:    { type: number }
 *                     description: { type: string }
 *     responses:
 *       200:
 *         description: Chapters updated
 */
router.patch('/:id/chapters', auth, updateChapters);

/**
 * @swagger
 * /api/recordings/{id}/transcript/request:
 *   post:
 *     summary: Request AI transcript generation for a recording
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               language: { type: string, default: en }
 *               provider:  { type: string, default: whisper }
 *     responses:
 *       200:
 *         description: Transcript job queued
 */
router.post('/:id/transcript/request', auth, requestTranscript);

/**
 * @swagger
 * /api/recordings/{id}/transcript:
 *   patch:
 *     summary: Save completed transcript (AI worker callback)
 *     tags: [Recordings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Transcript saved
 */
router.patch('/:id/transcript', saveTranscript);

/**
 * @swagger
 * /api/recordings/{id}/summary:
 *   patch:
 *     summary: Save AI-generated summary and key points
 *     tags: [Recordings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Summary saved
 */
router.patch('/:id/summary', saveSummary);

/**
 * @swagger
 * /api/recordings/{id}/view:
 *   post:
 *     summary: Increment view count for a recording
 *     tags: [Recordings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: View count updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 viewCount: { type: integer }
 */
router.post('/:id/view', auth, incrementView);

module.exports = router;
