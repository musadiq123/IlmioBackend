const mongoose = require('mongoose');

const recordingSchema = new mongoose.Schema({
  classId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class',   required: true },
  teacherId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  sessionId:   { type: String, required: true },          // unique session identifier
  storageKey:  { type: String },                          // Cloudinary public_id
  playbackUrl: { type: String },                          // Cloudinary secure_url
  durationSec: { type: Number, default: 0 },
  sizeBytes:   { type: Number, default: 0 },
  mimeType:    { type: String, default: 'video/mp4' },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'ready', 'archived', 'deleted'],
    default: 'uploading',
  },
  archivedAt: { type: Date },
  deletedAt:  { type: Date },
}, { timestamps: true });

recordingSchema.index({ classId: 1 });
recordingSchema.index({ teacherId: 1 });
recordingSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('Recording', recordingSchema);
