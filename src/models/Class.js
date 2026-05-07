const mongoose = require('mongoose');

// Subdocument: a rescheduled occurrence (original date → new date)
const rescheduleSchema = new mongoose.Schema({
  originalDate: { type: Date, required: true },
  newDate:      { type: Date, required: true },
  reason:       { type: String },
}, { _id: false });

const classSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  subject:           { type: String, required: true },
  description:       { type: String },
  classId:           { type: String, unique: true },
  teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  studentIds:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  groupName:         { type: String },
  status:            { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  recordingEnabled:  { type: Boolean, default: true },
  scheduledAt:       { type: Date, required: true },
  startTime:         { type: String },
  endTime:           { type: String },
  duration:          { type: String },

  // ── Recurrence ───────────────────────────────────────────────────────────
  // repeatDaily kept for backwards-compatibility; recurrenceType supersedes it
  repeatDaily:         { type: Boolean, default: false },
  recurrenceType:      { type: String, enum: ['none', 'daily', 'weekly', 'monthly', 'custom'], default: 'none' },
  // For 'weekly': array of day-of-week numbers (0=Sun … 6=Sat)
  recurrenceDays:      [{ type: Number, min: 0, max: 6 }],
  // For 'custom': interval in days (e.g. every 3 days)
  recurrenceInterval:  { type: Number, min: 1, default: 1 },
  recurrenceEndDate:   { type: Date },
  // Dates (UTC midnight) that should be skipped entirely
  recurrenceExceptions: [{ type: Date }],
  // Specific occurrences moved to a different date/time
  recurrenceReschedules: [rescheduleSchema],
  // ─────────────────────────────────────────────────────────────────────────

  recordings:        [{ url: String, duration: String, date: Date }],
  materials:         [{ name: String, url: String, type: String, uploadedAt: Date }],
}, { timestamps: true });

classSchema.index({ teacher: 1, scheduledAt: -1 });
classSchema.index({ status: 1 });

module.exports = mongoose.model('Class', classSchema);