// STARTER DATA. Twenty real dialects with a few starter words each.
// Every word is UNVERIFIED (verified: false) and must be checked by fluent speakers.
// Kurukh, Ao Naga, Lepcha, Jaunsari, Kui, Koya, Sora, Angami Naga and Nyishi are listed but have no words yet. Add them in seed/vocabulary.json
// or through the Contribute form.
// Safe to run on every start: it only inserts what is missing and never overwrites community words.
const mongoose = require('mongoose');
const Dialect = require('../models/Dialect');
const Word = require('../models/Word');
const Progress = require('../models/Progress');
const dialects = require('./dialects.json');
const vocab = require('./vocabulary.json');

const CATEGORY = {
  hello: 'greetings', thanks: 'greetings',
  water: 'nature', fire: 'nature', sun: 'nature', moon: 'nature', sky: 'nature', river: 'nature',
  mountain: 'nature', rain: 'nature', land: 'nature', flower: 'nature',
  mother: 'family', father: 'family', person: 'family',
  house: 'daily life', village: 'daily life', country: 'daily life'
};

async function removeWords(filter) {
  const ids = (await Word.find(filter).select('_id').lean()).map((w) => w._id);
  if (!ids.length) return 0;
  await Word.deleteMany({ _id: mongoose.trusted({ $in: ids }) });
  await Progress.deleteMany({ word: mongoose.trusted({ $in: ids }) });
  return ids.length;
}

async function seed({ reset = false } = {}) {
  await Dialect.bulkWrite(dialects.map((d) => ({ updateOne: { filter: { id: d.id }, update: { $set: d }, upsert: true } })));

  // The old two-dialect demo words are obsolete. --reset also refreshes the starter words.
  const removed = await removeWords({ source: mongoose.trusted({ $in: reset ? ['demo', 'starter'] : ['demo'] }) });
  if (removed) console.log(`Removed ${removed} old seeded words`);

  const names = Object.fromEntries(dialects.map((d) => [d.id, d.name]));
  const ops = [];
  for (const [dialect, entries] of Object.entries(vocab.entries)) {
    for (const [concept, roman] of Object.entries(entries)) {
      ops.push({ updateOne: {
        filter: { dialect, concept },
        update: { $setOnInsert: {
          dialect, dialectLabel: names[dialect], concept, hindi: vocab.concepts[concept], roman,
          romanLower: roman.toLowerCase(), native: '', category: CATEGORY[concept] || 'general',
          audioUrl: '', verified: false, source: 'starter'
        } },
        upsert: true
      } });
    }
  }
  const res = await Word.bulkWrite(ops);
  console.log(`Dialects: ${dialects.length}. Starter words added: ${res.upsertedCount}, already present: ${ops.length - res.upsertedCount}`);
}

module.exports = { seed, seedIfEmpty: seed };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vocalroots')
    .then(() => seed({ reset: process.argv.includes('--reset') }))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
