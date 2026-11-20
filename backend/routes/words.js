const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const Word = require('../models/Word');
const Dialect = require('../models/Dialect');
const auth = require('../middleware/auth');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const EXT = { 'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/mpeg': '.mp3', 'audio/wav': '.wav' };
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + (EXT[file.mimetype.split(';')[0]] || '.webm'))
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith('audio/'))
});

router.get('/stats', async (req, res, next) => {
  try {
    const [words, dialects, verified] = await Promise.all([
      Word.countDocuments(), Dialect.countDocuments(), Word.countDocuments({ verified: true })
    ]);
    res.json({ words, dialects, verified });
  } catch (e) { next(e); }
});

router.get('/dialects', async (req, res, next) => {
  try {
    const [list, counts] = await Promise.all([
      Dialect.find().sort({ name: 1 }).lean(),
      Word.aggregate([{ $group: { _id: '$dialect', count: { $sum: 1 } } }])
    ]);
    const byId = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    res.json(list.map((d) => ({
      id: d.id, label: d.name, family: d.family, regions: d.regions, script: d.script, note: d.note, count: byId[d.id] || 0
    })));
  } catch (e) { next(e); }
});

router.get('/categories', async (req, res, next) => {
  try { res.json((await Word.distinct('category')).sort()); } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.dialect) filter.dialect = String(req.query.dialect);
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.q) {
      const rx = new RegExp(esc(String(req.query.q).slice(0, 40).toLowerCase()));
      filter.$or = [{ romanLower: rx }, { concept: rx }];
    }
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    res.json(await Word.find(filter).sort({ concept: 1 }).limit(limit));
  } catch (e) { next(e); }
});

router.post('/', auth(), async (req, res, next) => {
  try {
    const b = req.body;
    const typed = String(b.dialect || '').trim().slice(0, 50);
    const doc = {
      dialectLabel: typed, dialect: slug(typed),
      concept: String(b.concept || '').trim().slice(0, 40),
      hindi: String(b.hindi || '').trim().slice(0, 40),
      roman: String(b.roman || '').trim().slice(0, 40),
      native: String(b.native || '').trim().slice(0, 40),
      category: String(b.category || 'general').trim().slice(0, 30),
      verified: false, source: 'community', contributor: req.user.id
    };
    if (!doc.dialect || !doc.concept || !doc.hindi || !doc.roman)
      return res.status(400).json({ error: 'Dialect, English meaning, Hindi and the dialect word are all required' });
    // Match an existing dialect by id or name; only create a new one if nothing matches.
    let dialect = await Dialect.findOne({ $or: [{ id: doc.dialect }, { name: new RegExp('^' + esc(typed) + '$', 'i') }] });
    if (!dialect) dialect = await Dialect.create({ id: doc.dialect, name: typed });
    doc.dialect = dialect.id; doc.dialectLabel = dialect.name;
    res.status(201).json(await Word.create(doc));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'This dialect already has a word for that meaning' });
    next(e);
  }
});

// Native-speaker recording. Only the contributor (or a reviewer) can attach audio.
router.post('/:id/audio', auth(), upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Attach an audio file under 3 MB' });
    const word = await Word.findById(req.params.id);
    const owns = word && String(word.contributor) === String(req.user.id);
    if (!word || (!owns && req.user.role !== 'reviewer')) {
      fs.unlink(req.file.path, () => {});
      return res.status(word ? 403 : 404).json({ error: word ? 'You can only add audio to words you contributed' : 'Word not found' });
    }
    word.audioUrl = '/uploads/' + req.file.filename;
    await word.save();
    res.json(word);
  } catch (e) { next(e); }
});

router.patch('/:id/verify', auth(), async (req, res, next) => {
  try {
    if (req.user.role !== 'reviewer') return res.status(403).json({ error: 'Only reviewers can verify words' });
    const word = await Word.findByIdAndUpdate(req.params.id, { verified: true }, { new: true });
    word ? res.json(word) : res.status(404).json({ error: 'Word not found' });
  } catch (e) { next(e); }
});

module.exports = router;
