const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String },
  dueDate:     { type: Date },
  maxScore:    { type: Number, default: 100 },
  submittedAt: { type: Date },
  fileUrl:     { type: String },
  score:       { type: Number },
  feedback:    { type: String },
  status:      { type: String, enum: ['pending', 'submitted', 'graded'], default: 'pending' },
}, { _id: true });

const quizResultSchema = new mongoose.Schema({
  quizId:    { type: String, required: true },
  title:     { type: String },
  score:     { type: Number },
  maxScore:  { type: Number },
  takenAt:   { type: Date },
  answers:   [{ question: String, selected: String, correct: Boolean }],
}, { _id: false });

const progressSchema = new mongoose.Schema({
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  classId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },

  // Overall completion 0-100 (%)
  completionRate: { type: Number, default: 0, min: 0, max: 100 },

  // Sessions attended / total scheduled
  sessionsAttended: { type: Number, default: 0 },
  totalSessions:    { type: Number, default: 0 },

  // Student's private notes for this class
  notes: { type: String, default: '' },

  assignments: [assignmentSchema],
  quizResults: [quizResultSchema],

  // Teacher-set grade / comment
  grade:   { type: String },
  comment: { type: String },

  lastActivity: { type: Date },
}, { timestamps: true });

progressSchema.index({ studentId: 1, classId: 1 }, { unique: true });
progressSchema.index({ classId: 1 });

module.exports = mongoose.model('Progress', progressSchema);
