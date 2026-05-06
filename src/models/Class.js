const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  subject:           { type: String, required: true },
  description:       { type: String },
  classId:           { type: String, unique: true }, // e.g. ESB-4829
  teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  studentIds:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Invited students only
  groupName:         { type: String }, // Optional group for access control
  status:            { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  recordingEnabled:  { type: Boolean, default: true },
  scheduledAt:       { type: Date, required: true }, // Class schedule date/time
  startTime:         { type: String }, // Optional: HH:mm format
  endTime:           { type: String }, // Optional: HH:mm format
  duration:          { type: String }, // Optional: e.g., "1 hour", "45 minutes"
  repeatDaily:       { type: Boolean, default: false }, // Whether class repeats daily
  recordings:        [{ url: String, duration: String, date: Date }],
  materials:         [{ name: String, url: String, type: String, uploadedAt: Date }],
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);