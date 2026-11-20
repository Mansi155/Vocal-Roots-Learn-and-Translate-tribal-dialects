const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['learner', 'reviewer'], default: 'learner' },
  xp: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  lastActive: { type: String, default: '' } // YYYY-MM-DD
}, { timestamps: true });

module.exports = model('User', UserSchema);
