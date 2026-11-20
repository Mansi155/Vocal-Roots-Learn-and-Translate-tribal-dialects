const { Schema, model } = require('mongoose');

// One row per dialect, so a dialect is listed even before it has any words.
const DialectSchema = new Schema({
  id: { type: String, required: true, unique: true },   // slug, matches Word.dialect
  name: { type: String, required: true, trim: true },
  family: { type: String, default: 'Unknown' },
  regions: { type: [String], default: [] },
  script: { type: String, default: '' },
  note: { type: String, default: '' }
}, { timestamps: true, collection: 'dialects' });

module.exports = model('Dialect', DialectSchema);
