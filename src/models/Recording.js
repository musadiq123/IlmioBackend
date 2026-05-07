const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
  classId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  classCode:   { type: String },
  className:   { type: String },
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sessionId:   { type: String, required: true },
  roomName:    { type: String },
  egressId:    { type: String },
  provider:    { type: String },
  storageKey:  { type: String },
  filePath:    { type: String },
  outputUrl:   { type: String },
  playbackUrl: { type: String },
  url:         { type: String },
  secureUrl:   { type: String },
  playUrl:     { type: String },
  signedUrl:   { type: String },
  format:      { type: String, default: 'mp4' },
  durationSec: { type: Number, default: 0 },
  durationSeconds: { type: Number, default: 0 },
  sizeBytes:   { type: Number, default: 0 },
  mimeType:    { type: String, default: 'video/mp4' },
  recordedAt:  { type: Date },
  finalizedAt: { type: Date },
  includeAudio: { type: Boolean, default: true },
  includeVideo: { type: Boolean, default: true },
  includeScreenShare: { type: Boolean, default: true },
  webhookEventIds: [{ type: String }],
  lastWebhookEventId: { type: String },
  errorMessage: { type: String },
  status: {
    type: String,
    enum: [
      'uploading',
      'starting',
      'recording',
      'processing',
      'completed',
      'ready',
      'failed',
      'archived',
      'deleted',
    ],
    default: 'uploading',
  },
  archivedAt: { type: Date },
  deletedAt:  { type: Date },

  // ── Enhanced content ──────────────────────────────────────────────────────
  // Video chapters (timestamps + titles for in-player navigation)
  chapters: [{
    title:      { type: String, required: true },
    startSec:   { type: Number, required: true },  // seconds from start
    description: { type: String },
  }],

  // AI-generated transcript (full text + time-coded segments)
  transcript: {
    fullText:   { type: String },
    language:   { type: String, default: 'en' },
    provider:   { type: String },               // e.g. 'whisper', 'google'
    segments:   [{
      startSec:  { type: Number },
      endSec:    { type: Number },
      speaker:   { type: String },
      text:      { type: String },
    }],
    generatedAt: { type: Date },
    status:      { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  },

  // AI-generated key points / summary
  summary: {
    keyPoints:   [{ type: String }],
    text:        { type: String },
    generatedAt: { type: Date },
    status:      { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  },

  viewCount: { type: Number, default: 0 },
  // ─────────────────────────────────────────────────────────────────────────
}, { timestamps: true });

recordingSchema.index({ classId: 1 });
recordingSchema.index({ classCode: 1 });
recordingSchema.index({ teacherId: 1 });
recordingSchema.index({ egressId: 1 }, { sparse: true });
recordingSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Recording', recordingSchema);
