const { Schema, model } = require('mongoose');

// One row = one meaning ("concept") in one dialect.
const WordSchema = new Schema({
  dialect: { type: String, required: true, index: true },        // slug, e.g. "hill-demo"
  dialectLabel: { type: String, required: true, trim: true },
  concept: { type: String, required: true, lowercase: true, trim: true }, // English meaning, shared across dialects
  hindi: { type: String, required: true, trim: true },
  roman: { type: String, required: true, trim: true },           // Latin transliteration
  romanLower: { type: String, index: true },
  native: { type: String, default: '', trim: true },             // native script if one exists
  category: { type: String, default: 'general', lowercase: true, trim: true, index: true },
  audioUrl: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  source: { type: String, default: 'community' },
  contributor: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, collection: 'words' });

WordSchema.index({ dialect: 1, concept: 1 }, { unique: true });
WordSchema.index({ dialect: 1, romanLower: 1 });
WordSchema.pre('validate', function (next) {
  if (this.roman) this.romanLower = this.roman.toLowerCase();
  next();
});

module.exports = model('Word', WordSchema);
