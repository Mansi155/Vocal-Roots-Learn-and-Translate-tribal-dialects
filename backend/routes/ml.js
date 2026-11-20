const router = require('express').Router();
const axios = require('axios');
const auth = require('../middleware/auth');

const ML = () => process.env.ML_URL || 'http://127.0.0.1:8001';
const down = (res) => res.status(503).json({ error: 'The ML service is not running. Start it with: uvicorn app:app --port 8001' });

router.post('/detect', async (req, res) => {
  try {
    const { data } = await axios.post(`${ML()}/detect`, { text: String(req.body.text || '').slice(0, 300) }, { timeout: 4000 });
    res.json(data);
  } catch (e) {
    console.error("ML_ERROR:",e.message,e.code);
    if (e.response) return res.status(e.response.status).json({ error: e.response.data.detail || 'Detection failed' });
    down(res);
  }
});

router.get('/recommend', auth(), async (req, res) => {
  try {
    const { data } = await axios.get(`${ML()}/recommend/${req.user.id}`, { params: { limit: 8 }, timeout: 4000 });
    res.json(data);
  } catch (e) {
    if (e.response) return res.status(e.response.status).json({ error: e.response.data.detail || 'Plan failed' });
    down(res);
  }
});

router.post('/retrain', auth(), async (req, res) => {
  if (req.user.role !== 'reviewer') return res.status(403).json({ error: 'Only reviewers can retrain the models' });
  try { res.json((await axios.post(`${ML()}/retrain`, {}, { timeout: 15000 })).data); } catch { down(res); }
});

module.exports = router;
