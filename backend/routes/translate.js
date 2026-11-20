const router = require('express').Router();
const axios = require('axios');
const { trusted } = require('mongoose');
const Word = require('../models/Word');
const Dialect = require('../models/Dialect');
const { tokenize, matchPhrases } = require('../utils/phrases');

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

// Typo help: ask the ML service first, fall back to edit distance if it is offline.
async function suggest(token, dialect, pool) {
  try {
    const { data } = await axios.get(`${process.env.ML_URL || 'http://127.0.0.1:8001'}/suggest`, {
      params: { token, dialect, k: 3 }, timeout: 1500
    });
    return data.suggestions;
  } catch {
    return pool
      .map((w) => ({ roman: w.romanLower, concept: w.concept, score: 1 - lev(token, w.romanLower) / Math.max(token.length, w.romanLower.length) }))
      .filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score).slice(0, 3);
  }
}

const isDialect = (x) => x !== 'english' && x !== 'hindi';

router.post('/', async (req, res, next) => {
  try {
    const from = String(req.body.from || 'english');
    const to = String(req.body.to || 'hindi');
    const tokens = tokenize(String(req.body.text || '').slice(0, 500));
    if (!tokens.length) return res.status(400).json({ error: 'Type a word or short phrase to translate' });
    if (from === to) return res.status(400).json({ error: 'Choose two different languages' });
    for (const lang of [from, to]) {
      if (isDialect(lang) && !(await Dialect.exists({ id: lang }))) return res.status(400).json({ error: 'Choose a language from the list' });
    }

    // concept -> Hindi for every concept in the dictionary (also gives the English word list)
    const concepts = await Word.aggregate([{ $group: { _id: '$concept', hindi: { $first: '$hindi' } } }]);
    const hindiOf = new Map(concepts.map((c) => [c._id, c.hindi]));

    // source lookup table: phrase -> concept
    let pool = [];
    const table = new Map();
    if (from === 'english') concepts.forEach((c) => table.set(c._id, c._id));
    else if (from === 'hindi') concepts.forEach((c) => table.set(c.hindi.toLowerCase(), c._id));
    else {
      pool = await Word.find({ dialect: from }).select('concept romanLower').lean();
      pool.forEach((w) => table.set(w.romanLower, w.concept));
    }

    const matched = matchPhrases(tokens, table);
    let targets = new Map();
    if (isDialect(to)) {
      const wanted = [...new Set(matched.map((m) => m.concept).filter(Boolean))];
      const docs = await Word.find({ dialect: to, concept: trusted({ $in: wanted }) });
      targets = new Map(docs.map((w) => [w.concept, w]));
    }

    const out = [];
    let lookups = 0;
    for (const { phrase, concept } of matched) {
      let hit = null;
      if (concept) {
        if (to === 'english') hit = { target: concept };
        else if (to === 'hindi') hit = { target: hindiOf.get(concept) };
        else if (targets.has(concept)) {
          const w = targets.get(concept);
          hit = { target: w.roman, native: w.native, audioUrl: w.audioUrl, verified: w.verified };
        }
      }
      if (hit) out.push({ source: phrase, found: true, concept, ...hit });
      else if (concept) out.push({ source: phrase, found: false, concept, missing: true, suggestions: [] });
      else out.push({
        source: phrase, found: false, missing: false,
        suggestions: isDialect(from) && lookups++ < 5 ? await suggest(phrase, from, pool) : []
      });
    }
    res.json({ tokens: out, coverage: out.filter((t) => t.found).length / out.length });
  } catch (e) { next(e); }
});

module.exports = router;
