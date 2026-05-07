const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  classId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  joinedAt:   { type: Date, required: true },
  leftAt:     { type: Date },
  durationMinutes: { type: Number, default: 0 },
  // Engagement signals sourced from LiveKit events
  chatMessages:    { type: Number, default: 0 },
  handRaises:      { type: Number, default: 0 },
  screenShareSec:  { type: Number, default: 0 },
  sessionDate:     { type: Date, required: true }, // midnight UTC of the class occurrence
}, { timestamps: true });

attendanceSchema.index({ classId: 1, sessionDate: 1 });
attendanceSchema.index({ studentId: 1, sessionDate: -1 });
attendanceSchema.index({ classId: 1, studentId: 1, sessionDate: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
