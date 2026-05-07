const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  classId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  type: {
    type: String,
    enum: ['class_reminder', 'class_started', 'class_cancelled', 'class_rescheduled', 'new_material'],
    required: true,
  },
  title:    { type: String, required: true },
  body:     { type: String, required: true },
  data:     { type: mongoose.Schema.Types.Mixed },
  read:     { type: Boolean, default: false },
  sentAt:   { type: Date },
  fcmMessageId: { type: String },
}, { timestamps: true });

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ classId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
