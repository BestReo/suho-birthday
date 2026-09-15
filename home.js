(() => {
  'use strict';
  const CFG = window.GAME_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const name = CFG.friendName || '친구';
  const hasBatchim = (s) => {
    const c = s.charCodeAt(s.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  };
  $('homeTitle').innerHTML = '';
  $('homeTitle').append(`${name}${hasBatchim(name) ? '아' : '야'}`, document.createElement('br'), '생일 축하해!');

  // ---------- 기록 ----------
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
  const fmt = (ms) => { const s = ms / 1000; return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; };
  const m = read('bdayMerge_v2'), j = read('bdayJump_v1');
  if (m.bestTime) $('recMerge').textContent = `⚡ 최단 기록 ${fmt(m.bestTime)}`;
  else if (m.best) $('recMerge').textContent = `🏆 최고 ${m.best}점`;
  if (j.best) $('recJump').textContent = `🏆 최고 ${j.best}계단`;
  const mo = read('bdayMole_v1');
  if (mo.best) $('recMole').textContent = `🏆 최고 ${mo.best}마리`;
  const moleCard = document.querySelector('a[href="mole.html"] p');
  if (moleCard && CFG.moleTarget) moleCard.textContent = `1분 안에 ${name} ${CFG.moleTarget}마리 잡으면 깜짝 선물 🎂`;

  // ---------- 상자 열기 ----------
  const box = $('giftBox');
  let opened = false;
  function reveal(instant) {
    opened = true;
    box.hidden = true;
    $('homeSub').textContent = '뭐부터 해볼래? 🎮';
    $('games').hidden = false;
    if (instant) document.querySelectorAll('.game-card, .from').forEach((el) => { el.style.animationDuration = '0s'; });
  }
  box.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    box.style.animation = 'none';
    box.classList.add('shake');
    setTimeout(() => {
      box.classList.add('open');
      confetti(180);
      pop();
    }, 500);
    setTimeout(() => box.classList.add('gone'), 1100);
    setTimeout(() => {
      try { sessionStorage.setItem('boxOpened', '1'); } catch (e) { /* 무시 */ }
      reveal(false);
    }, 1550);
  });
  let wasOpened = false;
  try { wasOpened = sessionStorage.getItem('boxOpened') === '1'; } catch (e) { /* 무시 */ }
  if (location.hash === '#open' || wasOpened) reveal(true);

  // ---------- 효과음 ----------
  function pop() {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784, 1047].forEach((f, i) => {
        const t = ac.currentTime + i * 0.09;
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + 0.3);
      });
    } catch (e) { /* 소리 없어도 됨 */ }
  }

  // ---------- 폭죽 ----------
  const cf = $('confetti'), cfx = cf.getContext('2d');
  const bits = [];
  const COLORS = ['#ff7aa2', '#ffd166', '#7ad3ff', '#9be08c', '#c79bff', '#ffffff'];
  function confetti(n) {
    const r = box.getBoundingClientRect();
    const ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 6 + Math.random() * 9;
      bits.push({
        x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }
  let running = false, last = 0;
  function tick(now) {
    const k = Math.min(50, now - last) / 16; last = now;
    const d = window.devicePixelRatio || 1;
    if (cf.width !== innerWidth * d || cf.height !== innerHeight * d) { cf.width = innerWidth * d; cf.height = innerHeight * d; }
    cfx.setTransform(d, 0, 0, d, 0, 0);
    cfx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.vy += 0.25 * k; b.vx *= 0.99;
      b.x += b.vx * k; b.y += b.vy * k; b.r += b.vr * k;
      if (b.y > innerHeight + 30) { bits.splice(i, 1); continue; }
      const q = Math.abs(Math.cos(b.r * 2));
      cfx.save(); cfx.translate(b.x, b.y); cfx.rotate(b.r);
      cfx.fillStyle = b.c; cfx.fillRect(-b.w / 2, (-b.h / 2) * q, b.w, b.h * q + 1);
      cfx.restore();
    }
    if (bits.length) requestAnimationFrame(tick); else running = false;
  }
})();
