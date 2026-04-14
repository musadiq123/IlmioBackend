const { randomUUID } = require('crypto');
const cloudinary     = require('cloudinary').v2;
const Recording      = require('../models/Recording');
const Class          = require('../models/Class');

const getMissingCloudinaryEnvVars = () => {
  const required = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  return required.filter((name) => !process.env[name]);
};

// Configure Cloudinary from env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── POST /api/recordings/request-upload ─────────────────────────────────────
// Teacher requests a signed upload URL to upload video directly to Cloudinary
exports.requestUpload = async (req, res) => {
  try {
    const missingVars = getMissingCloudinaryEnvVars();
    if (missingVars.length > 0) {
      return res.status(500).json({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: `Cloudinary is not configured on the server. Missing env vars: ${missingVars.join(', ')}`,
      });
    }

    const { classId } = req.body;
    if (!classId) return res.status(400).json({ message: 'classId is required' });

    const cls = await Class.findById(classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    if (cls.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the class teacher can upload recordings' });
    }

    const sessionId   = randomUUID();
    const storageKey  = `recordings/${classId}/${sessionId}`;
    const timestamp   = Math.round(Date.now() / 1000);

    // Build Cloudinary signed-upload parameters
    const paramsToSign = {
      timestamp,
      public_id:    storageKey,
      resource_type: 'video',
      folder:       'recordings',
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    // Pre-create recording row so we can track uploading state
    const recording = await Recording.create({
      classId,
      teacherId: req.user._id,
      sessionId,
      storageKey,
      status: 'uploading',
    });

    res.status(201).json({
      recordingId: recording._id,
      sessionId,
      uploadParams: {
        url:          `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/video/upload`,
        public_id:    storageKey,
        api_key:      process.env.CLOUDINARY_API_KEY,
        timestamp,
        signature,
        resource_type: 'video',
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/recordings/:id/complete ───────────────────────────────────────
// Called by client after Cloudinary upload succeeds; stores metadata
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

    recording.playbackUrl = playbackUrl;
    recording.durationSec = durationSec   || 0;
    recording.sizeBytes   = sizeBytes     || 0;
    recording.mimeType    = mimeType      || 'video/mp4';
    recording.status      = 'ready';
    await recording.save();

    res.json(recording);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/recordings/class/:classId ──────────────────────────────────────
// List all non-deleted recordings for a class (teacher + enrolled students)
exports.listByClass = async (req, res) => {
  try {
    const cls = await Class.findById(req.params.classId);
    if (!cls) return res.status(404).json({ message: 'Class not found' });

    const isTeacher  = cls.teacher.toString()     === req.user._id.toString();
    const isStudent  = cls.students.some(s => s.toString() === req.user._id.toString());

    if (!isTeacher && !isStudent) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const recordings = await Recording.find({
      classId: req.params.classId,
      status:  { $nin: ['deleted'] },
    }).select('-__v').sort({ createdAt: -1 });

    res.json(recordings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── GET /api/recordings/:id/play ────────────────────────────────────────────
// Returns a time-limited signed playback URL (10 min expiry)
exports.getPlaybackUrl = async (req, res) => {
  try {
    const missingVars = getMissingCloudinaryEnvVars();
    if (missingVars.length > 0) {
      return res.status(500).json({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: `Cloudinary playback is not configured on the server. Missing env vars: ${missingVars.join(', ')}`,
      });
    }

    const recording = await Recording.findById(req.params.id);
    if (!recording || recording.status === 'deleted') {
      return res.status(404).json({ message: 'Recording not found' });
    }
    if (!['ready', 'archived'].includes(recording.status)) {
      return res.status(409).json({ message: 'Recording is not ready for playback' });
    }

    const cls = await Class.findById(recording.classId);
  if (!cls) return res.status(404).json({ message: 'Class not found for this recording' });

    const isTeacher = cls.teacher.toString()  === req.user._id.toString();
    const isStudent = cls.students.some(s => s.toString() === req.user._id.toString());
    if (!isTeacher && !isStudent) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const expiresAt     = Math.round(Date.now() / 1000) + 60 * 10; // 10 minutes
    const signedPlayUrl = cloudinary.url(recording.storageKey, {
      resource_type: 'video',
      sign_url:      true,
      expires_at:    expiresAt,
      type:          'authenticated',
    });

    res.json({
      playbackUrl: signedPlayUrl,
      fallbackUrl: recording.playbackUrl,
      expiresAt:   new Date(expiresAt * 1000).toISOString(),
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
// Soft-delete: marks as deleted and removes from Cloudinary
exports.deleteRecording = async (req, res) => {
  try {
    const missingVars = getMissingCloudinaryEnvVars();
    if (missingVars.length > 0) {
      return res.status(500).json({
        code: 'CLOUDINARY_NOT_CONFIGURED',
        message: `Cloudinary is not configured on the server. Missing env vars: ${missingVars.join(', ')}`,
      });
    }

    const recording = await Recording.findById(req.params.id);
    if (!recording) return res.status(404).json({ message: 'Recording not found' });

    if (recording.teacherId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only teacher can delete recordings' });
    }
    if (recording.status === 'deleted') {
      return res.status(409).json({ message: 'Recording already deleted' });
    }

    // Remove from Cloudinary
    if (recording.storageKey) {
      await cloudinary.uploader.destroy(recording.storageKey, { resource_type: 'video' });
    }

    recording.status    = 'deleted';
    recording.deletedAt = new Date();
    await recording.save();

    res.json({ message: 'Recording deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
