const { Schema, model } = require('mongoose');

// One spaced-repetition card per (user, word). Read by the Python ML service too.
const ProgressSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  word: { type: Schema.Types.ObjectId, ref: 'Word', required: true },
  ease: { type: Number, default: 2.5 },
  interval: { type: Number, default: 0 },   // days
  reps: { type: Number, default: 0 },
  lapses: { type: Number, default: 0 },
  due: { type: Date, default: Date.now, index: true },
  lastReviewed: { type: Date }
}, { timestamps: true, collection: 'progress' });

ProgressSchema.index({ user: 1, word: 1 }, { unique: true });

module.exports = model('Progress', ProgressSchema);
