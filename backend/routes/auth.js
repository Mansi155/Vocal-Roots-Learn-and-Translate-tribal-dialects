const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const sign = (u) => jwt.sign({ id: u._id, name: u.name, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, xp: u.xp, streak: u.streak });

router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ error: 'Enter your name' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters' });
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 11) });
    res.status(201).json({ token: sign(user), user: pub(user) });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Email or password is incorrect' });
    res.json({ token: sign(user), user: pub(user) });
  } catch (e) { next(e); }
});

module.exports = router;
