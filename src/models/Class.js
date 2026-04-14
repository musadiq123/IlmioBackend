const mongoose = require('mongoose');

const classSchema = new mongoose.Schema({
  name:              { type: String, required: true },
  subject:           { type: String, required: true },
  description:       { type: String },
  classId:           { type: String, unique: true }, // e.g. ESB-4829
  teacher:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  students:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status:            { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  recordingEnabled:  { type: Boolean, default: true },
  recordings:        [{ url: String, duration: String, date: Date }],
  materials:         [{ name: String, url: String, type: String, uploadedAt: Date }],
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);