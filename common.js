// 케이크 쌓기 / 선물 받기가 같이 쓰는 도구 (이름, 저장, 소리, 폭죽, 토스트)
window.BD = (() => {
  'use strict';
  const CFG = window.GAME_CONFIG;
  const $ = (id) => document.getElementById(id);

  const name = CFG.friendName || '친구';
  const hasBatchim = (s) => {
    const c = s.charCodeAt(s.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  };
  const callName = name + (hasBatchim(name) ? '아' : '야');
  const fill = (t) => t.replaceAll('{이름아}', callName).replaceAll('{이름}', name);

  function store(key, defaults) {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { d = {}; }
    const o = Object.assign({}, defaults, d);
    Object.defineProperty(o, 'write', {
      value() { try { localStorage.setItem(key, JSON.stringify(this)); } catch (e) { /* 무시 */ } },
    });
    return o;
  }

  // ---------- 소리 ----------
  let ac = null;
  const snd = { on: true };
  function unlock() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
    if (ac.state === 'suspended') ac.resume();
  }
  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 1) {
    if (!snd.on || !ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol, freq, type = 'lowpass', delay = 0, sweepTo = 0) {
    if (!snd.on || !ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
    const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    const t = ac.currentTime + delay;
    src.buffer = buf; f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.value = vol;
    src.connect(f).connect(g).connect(ac.destination);
    src.start(t);
  }
  const fanfare = () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.11, 1.02));

  function vibrate(p) {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p);
    } catch (e) { /* 무시 */ }
  }

  // ---------- 토스트 ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- 폭죽 (위에서 떨어지는 종이) ----------
  const bits = [];
  const COLORS = ['#ff7aa2', '#ffd166', '#7ad3ff', '#9be08c', '#c79bff', '#ffffff'];
  let cf = null, cfx = null, running = false, last = 0;
  function confetti(n) {
    cf = cf || $('confetti');
    if (!cf) return;
    cfx = cfx || cf.getContext('2d');
    for (let i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        c: COLORS[(Math.random() * COLORS.length) | 0],
      });
    }
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  }
  function tick(now) {
    const k = Math.min(50, now - last) / 16; last = now;
    const d = window.devicePixelRatio || 1;
    if (cf.width !== innerWidth * d || cf.height !== innerHeight * d) { cf.width = innerWidth * d; cf.height = innerHeight * d; }
    cfx.setTransform(d, 0, 0, d, 0, 0);
    cfx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.x += b.vx * k; b.y += b.vy * k; b.r += b.vr * k;
      b.vx += Math.sin(b.y / 40) * 0.03;
      if (b.y > innerHeight + 30) { bits.splice(i, 1); continue; }
      const q = Math.abs(Math.cos(b.r * 2));
      cfx.save(); cfx.translate(b.x, b.y); cfx.rotate(b.r);
      cfx.fillStyle = b.c; cfx.fillRect(-b.w / 2, (-b.h / 2) * q, b.w, b.h * q + 1);
      cfx.restore();
    }
    if (bits.length) requestAnimationFrame(tick); else { running = false; cfx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  // 소리 버튼 공통 연결
  function bindSound(btn, save) {
    snd.on = save.sound !== false;
    const sync = () => { btn.textContent = snd.on ? '🔊' : '🔇'; };
    sync();
    btn.onclick = () => { snd.on = !snd.on; save.sound = snd.on; save.write(); sync(); unlock(); };
  }

  const today = () => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  };

  return { CFG, $, name, callName, fill, store, unlock, tone, noise, fanfare, vibrate, toast, confetti, bindSound, today };
})();
