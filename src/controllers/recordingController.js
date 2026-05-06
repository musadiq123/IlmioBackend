const { randomUUID } = require('crypto');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const Recording      = require('../models/Recording');
const Class          = require('../models/Class');
const {
  getEgressClient,
  getStorageConfig,
  createFilePath,
  buildEncodedFileOutput,
  egressStatusToRecordingStatus,
  parseBigIntLike,
  getPrimaryFileResult,
  inferFormat,
  convertStorageLocationToPublicUrl,
  getPlaybackUrl,
  createWebhookReceiver,
  deleteS3Object,
} = require('../utils/livekitRecordingService');

const isObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''));

const normalizeRecordingDoc = (recording) => {
  if (!recording) return null;

  const duration = Number(recording.durationSeconds || recording.durationSec || 0);
  const playback = recording.playbackUrl || recording.secureUrl || recording.url || recording.playUrl || '';

  return {
    id: recording._id,
    recordingId: recording._id,
    classId: recording.classId,
    classCode: recording.classCode,
    className: recording.className,
    date: recording.recordedAt || recording.createdAt,
    recordedAt: recording.recordedAt || recording.createdAt,
    duration,
    durationSeconds: duration,
    format: recording.format,
    egressId: recording.egressId,
    status: recording.status,
    playbackUrl: playback,
    url: recording.url || playback,
    secureUrl: recording.secureUrl || playback,
    playUrl: recording.playUrl || playback,
    outputUrl: recording.outputUrl,
    createdAt: recording.createdAt,
    updatedAt: recording.updatedAt,
  };
};

const findClassByIdOrCode = async (classIdOrCode) => {
  const lookup = String(classIdOrCode || '').trim();
  if (!lookup) return null;

  if (isObjectId(lookup)) {
    const byObjectId = await Class.findById(lookup);
    if (byObjectId) return byObjectId;
  }

  return Class.findOne({ classId: lookup });
};

const ensureTeacherOwnership = (req, cls) => {
  const userId = String(req.user._id);
  const isOwner = String(cls.teacher) === userId;
  const isTeacherRole = req.user.role === 'teacher';
  const isAdmin = req.user.role === 'admin';

  if ((isTeacherRole && isOwner) || isAdmin) return true;

  return false;
};

const mapAndAssignEgressData = (recording, egressInfo, storageConfig) => {
  const mappedStatus = egressStatusToRecordingStatus(egressInfo.status);
  const fileResult = getPrimaryFileResult(egressInfo);

  recording.status = mappedStatus;
  recording.errorMessage = egressInfo.error || recording.errorMessage;

  if (fileResult) {
    const location = String(fileResult.location || '').trim();
    const filename = String(fileResult.filename || '').trim();
    const durationSeconds = parseBigIntLike(fileResult.duration);
    const sizeBytes = parseBigIntLike(fileResult.size);

    const publicUrl = convertStorageLocationToPublicUrl(location, recording.provider, storageConfig);

    recording.outputUrl = location || recording.outputUrl;
    recording.filePath = filename || recording.filePath;
    recording.durationSec = durationSeconds;
    recording.durationSeconds = durationSeconds;
    recording.sizeBytes = sizeBytes;
    recording.format = inferFormat(filename || recording.filePath, recording.format || 'mp4');
    recording.playbackUrl = publicUrl || recording.playbackUrl;
    recording.url = publicUrl || recording.url;
    recording.secureUrl = publicUrl || recording.secureUrl;
    recording.playUrl = publicUrl || recording.playUrl;
  }

  if (mappedStatus === 'completed') {
    recording.finalizedAt = new Date();
    if (!recording.recordedAt) recording.recordedAt = new Date();
  }

  if (mappedStatus === 'failed') {
    recording.finalizedAt = new Date();
  }
};

const getMissingFirebaseEnvVars = () => {
  const required = [
    'FIREBASE_STORAGE_BUCKET',
  ];

  return required.filter((name) => !process.env[name]);
};

// ─── POST /api/recordings/request-upload ─────────────────────────────────────
// Teacher requests a signed upload URL to upload video directly to Firebase Storage
exports.requestUpload = async (req, res) => {
  try {
    const missingVars = getMissingFirebaseEnvVars();
    if (missingVars.length > 0) {
      return res.status(500).json({
        code: 'FIREBASE_NOT_CONFIGURED',
        message: `Firebase is not configured on the server. Missing env vars: ${missingVars.join(', ')}`,
      });
    }

    // Validate Firebase Admin SDK is initialized
    try {
      const bucket = admin.storage().bucket();
      if (!bucket) {
        return res.status(500).json({
          code: 'FIREBASE_NOT_INITIALIZED',
          message: 'Firebase Admin SDK not properly initialized. Check FIREBASE_STORAGE_BUCKET and service account.',
          detail: process.env.NODE_ENV === 'development' ? `Bucket: ${process.env.FIREBASE_STORAGE_BUCKET}` : undefined,
        });
      }
    } catch (bucketErr) {
      console.error('[requestUpload] Firebase bucket error:', bucketErr.message);
      return res.status(500).json({
        code: 'FIREBASE_INIT_ERROR',
        message: 'Firebase initialization failed. Check your service account JSON is valid.',
        detail: process.env.NODE_ENV === 'development' ? bucketErr.message : undefined,
      });
    }

    const { classId } = req.body;
    if (!classId) return res.status(400).json({ message: 'classId is required' });

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (!cls.classId || !cls.name) {
      console.error('[requestUpload] Invalid class data:', { classId, cls });
      return res.status(500).json({
        message: 'Class data is incomplete or corrupted',
        code: 'INVALID_CLASS_DATA',
      });
    }

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can upload recordings' });
    }

    const sessionId   = randomUUID();
    const storageKey  = `recordings/${classId}/${sessionId}.mp4`;

    // Generate Firebase Storage signed upload URL
    const bucket = admin.storage().bucket();
    const file = bucket.file(storageKey);
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: 'video/mp4',
    });

    // Pre-create recording row so we can track uploading state
    const recording = await Recording.create({
      classId,
      classCode: cls.classId,
      className: cls.name,
      teacherId: req.user._id,
      sessionId,
      storageKey,
      status: 'uploading',
      recordedAt: new Date(),
    });

    res.status(201).json({
      recordingId: recording._id,
      sessionId,
      uploadParams: {
        url: signedUrl,
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
        },
      },
    });
  } catch (err) {
    console.error('[requestUpload] ERROR:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      message: 'Failed to request upload',
      code: err.code || 'UNKNOWN_ERROR',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─── POST /api/recordings/:id/complete ───────────────────────────────────────
// Called by client after upload succeeds; uploads temp file to Firebase if exists, otherwise stores provided URL
exports.completeUpload = async (req, res) => {
  try {
    const { playbackUrl, durationSec, sizeBytes, mimeType } = req.body;

    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ message: 'Recording not found' });

    if (recording.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (recording.status !== 'uploading') {
      return res.status(409).json({ message: `Cannot complete a recording in '${recording.status}' status` });
    }

    let finalPlaybackUrl = playbackUrl;
    let finalSizeBytes = sizeBytes || 0;
    let finalDurationSec = durationSec || 0;

    // Check if temp file exists and upload to Firebase
    const tempFilePath = path.join('/tmp/recordings', `${recording._id}.mp4`);
    if (fs.existsSync(tempFilePath)) {
      try {
        const bucket = admin.storage().bucket();
        const fileName = `recordings/${recording.classId}/${recording.sessionId}.mp4`;
        const file = bucket.file(fileName);

        // Upload file to Firebase Storage
        await bucket.upload(tempFilePath, {
          destination: fileName,
          metadata: {
            contentType: 'video/mp4',
          },
        });

        // Get signed URL for playback
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        });

        finalPlaybackUrl = signedUrl;

        // Get file metadata
        const [metadata] = await file.getMetadata();
        finalSizeBytes = parseInt(metadata.size) || finalSizeBytes;

        // Clean up temp file
        fs.unlinkSync(tempFilePath);
      } catch (uploadErr) {
        console.error('Firebase upload error:', uploadErr);
        return res.status(500).json({ message: 'Failed to upload recording to Firebase' });
      }
    }

    recording.playbackUrl = finalPlaybackUrl;
    recording.url = finalPlaybackUrl;
    recording.secureUrl = finalPlaybackUrl;
    recording.playUrl = finalPlaybackUrl;
    recording.durationSec = finalDurationSec;
    recording.durationSeconds = finalDurationSec;
    recording.sizeBytes = finalSizeBytes;
    recording.mimeType = mimeType || 'video/mp4';
    recording.status = 'ready';
    recording.recordedAt = recording.recordedAt || new Date();
    recording.finalizedAt = new Date();
    await recording.save();

    res.json(recording);
  } catch (err) {
    console.error('[completeUpload] ERROR:', {
      message: err.message,
      stack: err.stack,
      recordingId: req.params.id,
      timestamp: new Date().toISOString(),
    });

    res.status(500).json({
      message: 'Failed to complete upload',
      code: err.code || 'UNKNOWN_ERROR',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

// ─── POST /api/recordings/livekit/start ─────────────────────────────────────
exports.startLivekitRecording = async (req, res) => {
  try {
    const {
      classId,
      roomName,
      layout,
      fileNamePrefix,
      includeAudio = true,
      includeVideo = true,
      includeScreenShare = true,
    } = req.body;

    if (!classId) {
      return res.status(400).json({ message: 'classId is required' });
    }

    const cls = await findClassByIdOrCode(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (!ensureTeacherOwnership(req, cls)) {
      return res.status(403).json({ message: 'Only class teacher/admin can start recording' });
    }

    if (!cls.recordingEnabled) {
      return res.status(409).json({ message: 'Recording is disabled for this class' });
    }

    const storageConfig = getStorageConfig();
    const filePath = createFilePath({
      classCode: cls.classId,
      classObjectId: cls._id.toString(),
      fileNamePrefix,
    });

    const output = buildEncodedFileOutput({ filePath, storageConfig });
    const { client } = getEgressClient();

    const livekitRoomName = String(roomName || '').trim() || `class-${cls.classId || cls._id}`;
    const egressInfo = await client.startRoomCompositeEgress(
      livekitRoomName,
      { file: output },
      {
        layout: String(layout || process.env.LIVEKIT_RECORDING_LAYOUT || 'speaker-dark').trim(),
        audioOnly: !Boolean(includeAudio) && Boolean(includeVideo),
        videoOnly: !Boolean(includeVideo) && Boolean(includeAudio),
      }
    );

    const recording = await Recording.create({
      classId: cls._id,
      classCode: cls.classId,
      className: cls.name,
      teacherId: req.user._id,
      sessionId: randomUUID(),
      roomName: livekitRoomName,
      egressId: egressInfo.egressId,
      provider: storageConfig.provider,
      filePath,
      format: 'mp4',
      includeAudio: Boolean(includeAudio),
      includeVideo: Boolean(includeVideo),
      includeScreenShare: Boolean(includeScreenShare),
      status: egressStatusToRecordingStatus(egressInfo.status),
      recordedAt: new Date(),
    });

    console.log('[recording] livekit start', {
      recordingId: recording._id.toString(),
      egressId: egressInfo.egressId,
      classId: cls._id.toString(),
      roomName: livekitRoomName,
      layout: layout || process.env.LIVEKIT_RECORDING_LAYOUT || 'speaker-dark',
      includeAudio: Boolean(includeAudio),
      includeVideo: Boolean(includeVideo),
      includeScreenShare: Boolean(includeScreenShare),
    });

    return res.status(201).json({
      recordingId: recording._id,
      egressId: egressInfo.egressId,
      status: recording.status,
    });
  } catch (err) {
    const statusCode = err.code === 'LIVEKIT_NOT_CONFIGURED' || err.code === 'RECORDING_STORAGE_NOT_CONFIGURED'
      ? 500
      : 500;

    return res.status(statusCode).json({
      code: err.code || 'LIVEKIT_START_FAILED',
      message: err.message,
    });
  }
};

// ─── POST /api/recordings/livekit/stop ──────────────────────────────────────
exports.stopLivekitRecording = async (req, res) => {
  try {
    const { classId, recordingId, egressId, duration, format } = req.body;
    if (!classId) {
      return res.status(400).json({ message: 'classId is required' });
    }

    const cls = await findClassByIdOrCode(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (!ensureTeacherOwnership(req, cls)) {
      return res.status(403).json({ message: 'Only class teacher/admin can stop recording' });
    }

    let recording = null;
    if (recordingId) {
      recording = await Recording.findById(recordingId);
    } else if (egressId) {
      recording = await Recording.findOne({ egressId });
    } else {
      recording = await Recording.findOne({
        classId: cls._id,
        status: { $in: ['starting', 'recording', 'processing'] },
      }).sort({ createdAt: -1 });
    }

    if (!recording) {
      return res.status(404).json({ message: 'Recording not found' });
    }

    if (String(recording.classId) !== String(cls._id)) {
      return res.status(403).json({ message: 'Recording does not belong to this class' });
    }

    const targetEgressId = String(egressId || recording.egressId || '').trim();
    if (!targetEgressId) {
      return res.status(400).json({ message: 'egressId is required (directly or through recording)' });
    }

    const { client } = getEgressClient();

    try {
      await client.stopEgress(targetEgressId);
    } catch (stopErr) {
      const msg = String(stopErr.message || '').toLowerCase();
      const ignorable = msg.includes('not found') || msg.includes('already') || msg.includes('ended');
      if (!ignorable) throw stopErr;
    }

    recording.egressId = targetEgressId;
    recording.status = 'processing';
    if (duration !== undefined && duration !== null) {
      const castDuration = Number(duration);
      if (Number.isFinite(castDuration) && castDuration >= 0) {
        recording.durationSec = castDuration;
        recording.durationSeconds = castDuration;
      }
    }
    if (format) recording.format = String(format).trim().toLowerCase();
    await recording.save();

    console.log('[recording] livekit stop', {
      recordingId: recording._id.toString(),
      egressId: targetEgressId,
      classId: cls._id.toString(),
      status: recording.status,
    });

    return res.json({
      recordingId: recording._id,
      egressId: targetEgressId,
      status: recording.status,
    });
  } catch (err) {
    return res.status(500).json({
      code: err.code || 'LIVEKIT_STOP_FAILED',
      message: err.message,
    });
  }
};

// ─── POST /api/recordings/livekit/webhook ───────────────────────────────────
exports.livekitWebhook = async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

    if (!rawBody) {
      return res.status(400).json({ message: 'Webhook body is empty' });
    }

    const receiver = createWebhookReceiver();
    const skipAuth = String(process.env.LIVEKIT_WEBHOOK_SKIP_AUTH || 'false').toLowerCase() === 'true';
    const authHeader = req.get('Authorization') || req.get('Authorize') || '';

    const event = await receiver.receive(rawBody, authHeader, skipAuth);
    if (!String(event.event || '').startsWith('egress_') || !event.egressInfo) {
      return res.status(200).json({ ok: true, ignored: true });
    }

    const egressInfo = event.egressInfo;
    const recording = await Recording.findOne({ egressId: egressInfo.egressId });
    if (!recording) {
      return res.status(200).json({ ok: true, ignored: true, reason: 'recording_not_found' });
    }

    const eventId = String(event.id || '').trim();
    if (eventId && Array.isArray(recording.webhookEventIds) && recording.webhookEventIds.includes(eventId)) {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    let storageConfig = { provider: recording.provider };
    try {
      storageConfig = getStorageConfig();
    } catch (configErr) {
      storageConfig = { provider: recording.provider };
    }
    mapAndAssignEgressData(recording, egressInfo, storageConfig);

    if (eventId) {
      recording.webhookEventIds = recording.webhookEventIds || [];
      recording.webhookEventIds.push(eventId);
      recording.lastWebhookEventId = eventId;
    }

    await recording.save();

    console.log('[recording] livekit webhook finalized', {
      recordingId: recording._id.toString(),
      egressId: recording.egressId,
      event: event.event,
      status: recording.status,
      outputUrl: recording.outputUrl,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({
      code: err.code || 'LIVEKIT_WEBHOOK_FAILED',
      message: err.message,
    });
  }
};

// ─── GET /api/recordings/class/:classId ──────────────────────────────────────
// List all non-deleted recordings for a class (teacher + enrolled students)
exports.listByClass = async (req, res) => {
  try {
    const cls = await findClassByIdOrCode(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    const isTeacher  = cls.teacher.toString()     === req.user._id.toString();
    const isStudent  = cls.students.some(s => s.toString() === req.user._id.toString());

    if (!isTeacher && !isStudent) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const recordings = await Recording.find({
      classId: cls._id,
      status: req.query.includeArchived === 'true'
        ? { $nin: ['deleted'] }
        : { $nin: ['archived', 'deleted'] },
    }).select('-__v').sort({ createdAt: -1 });

    res.json(recordings.map(normalizeRecordingDoc));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/recordings/:id/play ────────────────────────────────────────────
// Returns a time-limited signed playback URL (10 min expiry)
exports.getPlaybackUrl = async (req, res) => {
  try {
    const recordingId = req.params.id || req.params.recordingId;
    const recording = await Recording.findById(recordingId);
    if (!recording || recording.status === 'deleted') {
      return res.status(404).json({ message: 'Recording not found' });
    }
    if (!['ready', 'completed', 'archived'].includes(recording.status)) {
      return res.status(409).json({ message: 'Recording is not ready for playback' });
    }

    const cls = await Class.findById(recording.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found for this recording' });

    const isTeacher = cls.teacher.toString()  === req.user._id.toString();
    const isStudent = cls.students.some(s => s.toString() === req.user._id.toString());
    if (!isTeacher && !isStudent) {
      return res.status(403).json({ message: 'Access denied' });
    }

    let playback = await getPlaybackUrl(recording);

    // For Firebase Storage, generate a new signed URL if needed
    if (!playback.url && recording.storageKey) {
      try {
        const bucket = admin.storage().bucket();
        const file = bucket.file(recording.storageKey);
        const [signedUrl] = await file.getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + 10 * 60 * 1000, // 10 minutes
        });
        playback = {
          url: signedUrl,
          signed: true,
        };
      } catch (err) {
        console.error('Firebase signed URL generation error:', err);
      }
    }

    if (!playback.url) {
      return res.status(409).json({ message: 'Playback URL is not available yet' });
    }

    recording.signedUrl = playback.signed ? playback.url : recording.signedUrl;
    await recording.save();

    res.json({
      playbackUrl: playback.url,
      url: playback.url,
      signedUrl: playback.signed ? playback.url : undefined,
      secureUrl: playback.url,
      playUrl: playback.url,
      fallbackUrl: recording.playbackUrl,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/recordings/:id/archive ───────────────────────────────────────
// Teacher marks a recording as archived (cheaper storage tier)
exports.archiveRecording = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ message: 'Recording not found' });

    if (recording.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only teacher can archive recordings' });
    }
    if (recording.status === 'deleted') {
      return res.status(409).json({ message: 'Recording already deleted' });
    }

    recording.status     = 'archived';
    recording.archivedAt = new Date();
    await recording.save();

    res.json({ message: 'Recording archived', recording });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── DELETE /api/recordings/:id ──────────────────────────────────────────────
// Soft-delete: marks as deleted and removes from Firebase Storage
exports.deleteRecording = async (req, res) => {
  try {
    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ message: 'Recording not found' });

    if (recording.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only teacher can delete recordings' });
    }
    if (recording.status === 'deleted') {
      return res.status(409).json({ message: 'Recording already deleted' });
    }

    // Remove from Firebase Storage
    if (recording.storageKey) {
      try {
        const bucket = admin.storage().bucket();
        await bucket.file(recording.storageKey).delete();
      } catch (deleteErr) {
        console.error('Firebase delete error:', deleteErr);
        // Continue with soft delete even if file deletion fails
      }
    }

    // Also handle S3 if it's a LiveKit recording
    if (recording.provider === 's3' && (recording.outputUrl || recording.playbackUrl || recording.url)) {
      const storageConfig = getStorageConfig();
      await deleteS3Object({
        location: recording.outputUrl || recording.playbackUrl || recording.url,
        storageConfig,
      });
    }

    recording.status    = 'deleted';
    recording.deletedAt = new Date();
    await recording.save();

    res.json({ message: 'Recording deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
