/* Hero scene: sky, layered sound waves, and luminous roots that grow down from the water line.
   The waves swell with voice level: pointer movement, or the microphone while recording (VoiceFX.pulse). */
(() => {
  const cv = document.getElementById('waves');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, roots = [], level = 0, target = 0, visible = true;
  const t0 = performance.now();

  const layers = [
    { y: 0.62, amp: 16, f: 0.006, s: 0.6, ph: 0, fill: 'rgba(255,255,255,.38)' },
    { y: 0.66, amp: 20, f: 0.0045, s: 0.45, ph: 2, fill: 'rgba(160,222,255,.55)' },
    { y: 0.70, amp: 22, f: 0.0055, s: 0.8, ph: 4, fill: 'rgba(92,194,242,.7)' }
  ];
  const deep = { y: 0.76, amp: 12, f: 0.005, s: 0.7, ph: 1 };

  const waveY = (l, x, t) =>
    H * l.y + Math.sin(x * l.f + t * l.s + l.ph) * l.amp * (1 + level * 2.4) +
    Math.sin(x * l.f * 2.3 - t * l.s * 1.3) * l.amp * 0.35;

  const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function grow(segs, x, y, a, len, d, delay, r) {
    if (d > 4 || len < 12) return;
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    if (y1 > H - 6) return;
    const dur = 0.6 + len / 140;
    segs.push({ x0: x, y0: y, x1, y1, d, delay, dur, bend: (r() - 0.5) * len * 0.5 });
    grow(segs, x1, y1, a + (r() - 0.5) * 0.5, len * 0.8, d + 1, delay + dur, r);
    if (r() < 0.85) grow(segs, x1, y1, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len * 0.64, d + 1, delay + dur + 0.1, r);
  }

  function buildRoots() {
    const r = rng(42), n = Math.max(4, Math.round(W / 160));
    roots = [];
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) * W) / n + (r() - 0.5) * 60, segs = [];
      grow(segs, x, H * deep.y + 8, Math.PI / 2 + (r() - 0.5) * 0.5, H * 0.1 + r() * H * 0.05, 0, i * 0.22, r);
      roots.push({ x, baseY: waveY(deep, x, 0), segs });
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildRoots();
  }

  function fillWave(l, t, style) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, waveY(l, x, t));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = style; ctx.fill();
  }

  function drawRoots(t) {
    ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(120,210,255,.9)'; ctx.shadowBlur = 8;
    for (const rt of roots) {
      const dy = waveY(deep, rt.x, t) - rt.baseY;
      for (const s of rt.segs) {
        const p = reduce ? 1 : Math.min(1, Math.max(0, (t - s.delay - 0.5) / s.dur));
        if (p <= 0) continue;
        const u1 = 1 - Math.pow(1 - p, 3), mx = (s.x0 + s.x1) / 2 + s.bend, my = (s.y0 + s.y1) / 2;
        const pt = (u) => [(1 - u) * (1 - u) * s.x0 + 2 * (1 - u) * u * mx + u * u * s.x1, (1 - u) * (1 - u) * s.y0 + 2 * (1 - u) * u * my + u * u * s.y1];
        ctx.beginPath(); ctx.moveTo(s.x0, s.y0 + dy);
        let tip = [s.x0, s.y0];
        for (let k = 1; k <= 8; k++) { tip = pt((u1 * k) / 8); ctx.lineTo(tip[0], tip[1] + dy); }
        ctx.lineWidth = Math.max(1, 3.2 - s.d * 0.6);
        ctx.strokeStyle = `rgba(200,238,255,${0.8 - s.d * 0.1})`; ctx.stroke();
        if (p < 1) { ctx.beginPath(); ctx.arc(tip[0], tip[1] + dy, 3, 0, 6.3); ctx.fillStyle = '#fff'; ctx.fill(); }
      }
    }
    ctx.restore();
  }

  function frame(now) {
    if (visible && !document.hidden) {
      const t = (now - t0) / 1000;
      level += (target - level) * 0.08; target *= 0.96;
      ctx.clearRect(0, 0, W, H);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#e4f6ff'); sky.addColorStop(0.55, '#8fd3ff'); sky.addColorStop(1, '#5ab4f0');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.82, H * 0.2, 0, W * 0.82, H * 0.2, H * 0.35);
      sun.addColorStop(0, 'rgba(255,255,255,.85)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
      layers.forEach((l) => fillWave(l, t, l.fill));
      const water = ctx.createLinearGradient(0, H * deep.y, 0, H);
      water.addColorStop(0, '#4a97ee'); water.addColorStop(1, '#2a6fd6');
      fillWave(deep, t, water);
      drawRoots(t);
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  let lx = 0, ly = 0;
  cv.parentElement.addEventListener('pointermove', (e) => {
    const speed = Math.hypot(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY;
    target = Math.max(target, Math.min(0.6, speed / 80));
  });
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(cv);
  window.addEventListener('resize', () => { resize(); if (reduce) requestAnimationFrame(frame); });
  window.VoiceFX = { pulse: (v) => (target = Math.max(target, Math.min(1, v))) };

  resize();
  requestAnimationFrame(frame);
})();
