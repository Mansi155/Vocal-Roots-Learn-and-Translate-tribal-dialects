require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}

mongoose.set('sanitizeFilter', true); // blocks NoSQL operator injection in filters

const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '200kb' }));
app.use(morgan('dev'));

app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/words', require('./routes/words'));
app.use('/api/translate', require('./routes/translate'));
app.use('/api/learn', require('./routes/learn'));
app.use('/api/ml', require('./routes/ml'));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server' });
});

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/vocalroots');
    console.log('MongoDB connected');
    if (process.env.SEED_ON_START === 'true') await require('./seed/seed').seed();
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Vocal Roots running at http://localhost:${port}`));
  } catch (e) {
    console.error('Startup failed:', e.message);
    process.exit(1);
  }
})();
