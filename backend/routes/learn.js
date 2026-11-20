const router = require('express').Router();
const { trusted } = require('mongoose');
const Word = require('../models/Word');
const Progress = require('../models/Progress');
const User = require('../models/User');
const auth = require('../middleware/auth');

// SM-2 spaced repetition. quality: 0-5
function sm2(card, q) {
  if (q < 3) { card.reps = 0; card.interval = 1; card.lapses += 1; }
  else {
    card.reps += 1;
    card.interval = card.reps === 1 ? 1 : card.reps === 2 ? 3 : Math.round(card.interval * card.ease);
  }
  card.ease = Math.max(1.3, card.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  card.lastReviewed = new Date();
  card.due = new Date(Date.now() + card.interval * 86400000);
}

async function award(userId, xp) {
  const user = await User.findById(userId);
  if (!user) return null;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (user.lastActive !== today) {
    user.streak = user.lastActive === yesterday ? user.streak + 1 : 1;
    user.lastActive = today;
  }
  user.xp += xp;
  await user.save();
  return { xp: user.xp, streak: user.streak };
}

const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);

router.get('/deck', auth(false), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.dialect) filter.dialect = String(req.query.dialect);
    if (req.query.category) filter.category = String(req.query.category);
    const limit = Math.min(parseInt(req.query.limit) || 10, 30);
    let cards = [];
    if (req.user) {
      const due = await Progress.find({ user: req.user.id, due: trusted({ $lte: new Date() }) }).populate('word').limit(limit * 2);
      cards = due.map((p) => p.word).filter((w) => w && (!filter.dialect || w.dialect === filter.dialect)).slice(0, limit);
      const room = limit - cards.length;
      if (room > 0) {
        const seen = await Progress.find({ user: req.user.id }).distinct('word');
        cards = cards.concat(await Word.find({ ...filter, _id: trusted({ $nin: seen }) }).limit(room));
      }
    } else {
      cards = await Word.aggregate([{ $match: filter }, { $sample: { size: limit } }]);
    }
    res.json(cards);
  } catch (e) { next(e); }
});

router.post('/review', auth(), async (req, res, next) => {
  try {
    const q = Math.max(0, Math.min(5, parseInt(req.body.quality)));
    if (Number.isNaN(q)) return res.status(400).json({ error: 'Send a quality score from 0 to 5' });
    if (!(await Word.exists({ _id: req.body.wordId }))) return res.status(404).json({ error: 'Word not found' });
    const card = (await Progress.findOne({ user: req.user.id, word: req.body.wordId })) ||
      new Progress({ user: req.user.id, word: req.body.wordId });
    sm2(card, q);
    await card.save();
    const reward = await award(req.user.id, q >= 3 ? 10 : 2);
    res.json({ interval: card.interval, due: card.due, ...reward });
  } catch (e) { next(e); }
});

router.get('/quiz', auth(false), async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.dialect) filter.dialect = String(req.query.dialect);
    const n = Math.min(parseInt(req.query.n) || 5, 10);
    const picked = await Word.aggregate([{ $match: filter }, { $sample: { size: n } }]);
    const questions = [];
    for (const w of picked) {
      const wrong = await Word.aggregate([
        { $match: { concept: { $ne: w.concept } } }, { $group: { _id: '$concept' } }, { $sample: { size: 3 } }
      ]);
      questions.push({
        id: w._id, prompt: w.roman, native: w.native, dialectLabel: w.dialectLabel, audioUrl: w.audioUrl,
        options: shuffle([w.concept, ...wrong.map((x) => x._id)]), answer: w.concept
      });
    }
    res.json(questions);
  } catch (e) { next(e); }
});

router.post('/quiz/finish', auth(), async (req, res, next) => {
  try {
    const score = Math.max(0, Math.min(10, parseInt(req.body.score) || 0));
    res.json(await award(req.user.id, score * 5));
  } catch (e) { next(e); }
});

router.get('/stats', auth(), async (req, res, next) => {
  try {
    const [user, cards, due, mastered] = await Promise.all([
      User.findById(req.user.id),
      Progress.countDocuments({ user: req.user.id }),
      Progress.countDocuments({ user: req.user.id, due: trusted({ $lte: new Date() }) }),
      Progress.countDocuments({ user: req.user.id, interval: trusted({ $gte: 21 }) })
    ]);
    res.json({ xp: user?.xp || 0, streak: user?.streak || 0, cards, due, mastered });
  } catch (e) { next(e); }
});

module.exports = router;
