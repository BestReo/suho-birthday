// 🎬 수호 성장 영상 — 사진 + 켄번스 + 전환 + 자막 + 필름 효과 + 직접 만든 음악
// 사용: Film.play(() => { /* 닫았을 때 */ })
window.Film = (() => {
  'use strict';
  const CFG = window.GAME_CONFIG;
  const BD = window.BD;
  const album = CFG.album || [];
  const BPM = 80, BEAT = 60 / BPM, BAR = BEAT * 4;   // 한 마디 = 3초, 사진은 마디마다 넘어감
  const TR = 0.9;                                    // 전환 길이 (초)

  let ov, cv, g, W = 0, H = 0, dpr = 1;
  let imgs = [], timeline = [], total = 0, t0 = 0, raf = 0, onClose = null, ac = null, master = null, playing = false;
  let grain = null;

  // ---------- 준비 ----------
  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'film';
    ov.innerHTML = '<canvas></canvas>'
      + '<button class="film-skip">건너뛰기 ›</button>'
      + '<div class="film-end" hidden><button class="btn primary film-replay">🎬 다시 보기</button><button class="btn film-close">닫기</button></div>';
    document.body.appendChild(ov);
    cv = ov.querySelector('canvas');
    g = cv.getContext('2d');
    ov.querySelector('.film-skip').onclick = () => { t0 = performance.now() / 1000 - (total - 7.5); fadeMusic(1.5); };
    ov.querySelector('.film-replay').onclick = () => start();
    ov.querySelector('.film-close').onclick = close;
    window.addEventListener('resize', () => { if (playing || !ov.hidden) size(); });
    // 필름 노이즈 텍스처
    grain = document.createElement('canvas');
    grain.width = grain.height = 160;
    const gg = grain.getContext('2d'), id = gg.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = Math.random() * 255;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
    }
    gg.putImageData(id, 0, 0);
    imgs = album.map((a) => { const im = new Image(); im.src = a.src; return im; });
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  }

  // 흐린 배경용 (작게 줄였다 키우면 어디서나 블러)
  const blurCache = new Map();
  function blurred(im) {
    if (blurCache.has(im)) return blurCache.get(im);
    const c = document.createElement('canvas');
    const k = 28 / Math.max(im.naturalWidth, im.naturalHeight);
    c.width = Math.max(2, Math.round(im.naturalWidth * k)); c.height = Math.max(2, Math.round(im.naturalHeight * k));
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    blurCache.set(im, c);
    return c;
  }

  // ---------- 타임라인 ----------
  function makeTimeline() {
    const tl = [];
    let t = 0;
    const add = (seg, bars) => { seg.start = t; seg.dur = bars * BAR; t += seg.dur; tl.push(seg); };
    add({ type: 'title' }, 2);
    const chapters = CFG.filmChapters || [];
    const trans = ['fade', 'zoom', 'slide', 'fade', 'flash', 'zoom', 'fade', 'slide'];
    album.forEach((a, i) => {
      const ch = chapters.find((c) => c.at === i);
      if (ch) add({ type: 'chapter', title: ch.title, sub: BD.fill(ch.sub) }, 1);
      const r = (n) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
      add({
        type: 'photo', i, caption: BD.fill(a.caption || ''),
        zin: r(1) < 0.6, px: (r(2) - 0.5) * 0.08, py: (r(3) - 0.5) * 0.08,
        tr: trans[i % trans.length],
      }, 1);
    });
    add({ type: 'collage' }, 2);
    add({ type: 'end' }, 3);
    total = t;
    return tl;
  }

  // ---------- 음악 (직접 만든 곡: C - G - Am - F 진행, 오르골 + 패드 + 베이스) ----------
  const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);   // MIDI 번호 → 주파수
  const PROG = [[48, 55, 60, 64, 67], [43, 55, 59, 62, 67], [45, 57, 60, 64, 69], [41, 53, 57, 60, 65]];  // C G Am F
  function music() {
    try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    if (ac.state === 'suspended') ac.resume();
    const now = ac.currentTime + 0.1;
    master = ac.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.9, now + 2.5);
    // 잔향 느낌 (짧은 딜레이 되먹임)
    const delay = ac.createDelay(1); delay.delayTime.value = BEAT * 0.75;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const wet = ac.createGain(); wet.gain.value = 0.35;
    delay.connect(fb).connect(delay); delay.connect(wet).connect(master);
    master.connect(ac.destination);

    const voice = (freq, t, dur, type, vol, attack = 0.01, dest = master) => {
      const o = ac.createOscillator(), gn = ac.createGain();
      o.type = type; o.frequency.value = freq;
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(vol, t + attack);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn); gn.connect(dest); if (dest === master) gn.connect(delay);
      o.start(t); o.stop(t + dur + 0.05);
    };
    const bars = Math.ceil(total / BAR);
    const ARP = [0, 2, 3, 4, 3, 2, 1, 2];   // 코드 음 순서
    for (let b = 0; b < bars; b++) {
      const t = now + b * BAR;
      const last = b >= bars - 2;
      const ch = last ? PROG[0] : PROG[b % 4];
      const intro = b < 2;
      // 패드
      [ch[1], ch[2], ch[3]].forEach((n) => {
        voice(NOTE(n), t, BAR * 1.05, 'triangle', 0.035, 0.8);
        voice(NOTE(n) * 1.004, t, BAR * 1.05, 'sine', 0.03, 0.9);
      });
      // 베이스
      if (!intro) voice(NOTE(ch[0]), t, BAR * 0.95, 'sine', 0.12, 0.05);
      // 오르골 아르페지오 (8분음표)
      for (let k = 0; k < 8; k++) {
        if (last && k > 3) break;
        const n = ch[ARP[k]] + 12;
        const tt = t + k * BEAT / 2;
        voice(NOTE(n), tt, 1.2, 'sine', intro ? 0.05 : 0.08, 0.005);
        voice(NOTE(n) * 2, tt, 0.5, 'sine', 0.015, 0.005);
      }
      // 챕터 넘어갈 때 종소리
      const seg = timeline.find((s) => Math.abs(s.start - b * BAR) < 0.01 && (s.type === 'chapter' || s.type === 'end'));
      if (seg) { voice(NOTE(84), t, 2.5, 'sine', 0.06, 0.005); voice(NOTE(91), t + 0.02, 2, 'sine', 0.03, 0.005); }
    }
    // 마지막 화음
    const endT = now + bars * BAR;
    [60, 64, 67, 72].forEach((n) => voice(NOTE(n), endT, 4, 'sine', 0.06, 0.01));
  }
  function fadeMusic(sec) {
    if (!master || !ac) return;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.exponentialRampToValueAtTime(0.0001, t + sec);
    const m = master;
    setTimeout(() => { try { m.disconnect(); } catch (e) { /* 무시 */ } }, sec * 1000 + 100);
    master = null;
  }

  // ---------- 그리기 ----------
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));

  function drawPhoto(seg, lt, alpha, extraScale = 1, dx = 0) {
    const im = imgs[seg.i];
    if (!im || !im.complete || !im.naturalWidth) return;
    const p = Math.min(1, lt / (seg.dur + TR));
    const s = (seg.zin ? 1 + 0.12 * p : 1.12 - 0.12 * p) * extraScale;
    g.save();
    g.globalAlpha = alpha;
    g.translate(dx, 0);
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const coverK = Math.max(W / iw, H / ih), containK = Math.min(W / iw, H / ih);
    const wide = iw / ih > (W / H) * 1.25;   // 화면보다 훨씬 가로로 긴 사진
    if (wide) {
      // 흐린 배경 + 가운데 사진
      const bk = coverK * 1.15 * s;
      const b = blurred(im);
      g.filter = 'none';
      g.imageSmoothingEnabled = true;
      g.drawImage(b, W / 2 - (iw * bk) / 2, H / 2 - (ih * bk) / 2, iw * bk, ih * bk);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, W, H);
      const k = containK * 0.96 * s;
      const w = iw * k, h = ih * k;
      g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 30;
      g.drawImage(im, W / 2 - w / 2 + seg.px * W * p, H / 2 - h / 2, w, h);
      g.shadowBlur = 0;
    } else {
      const k = coverK * s;
      const w = iw * k, h = ih * k;
      g.drawImage(im, W / 2 - w / 2 + seg.px * W * p, H / 2 - h / 2 + seg.py * H * p, w, h);
    }
    g.restore();
  }

  function caption(text, lt, dur, alpha) {
    if (!text) return;
    const a = alpha * ease(Math.min((lt - 0.5) / 0.6, (dur - lt + TR * 0.3) / 0.6));
    if (a <= 0) return;
    g.save();
    g.globalAlpha = a;
    const fs = Math.min(W * 0.06, 30);
    g.font = `${fs}px Jua, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = H * 0.84;
    const w = g.measureText(text).width + fs * 1.4;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    const r = fs * 0.9;
    g.roundRect ? g.roundRect(W / 2 - w / 2, y - r, w, r * 2, r) : g.rect(W / 2 - w / 2, y - r, w, r * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 6;
    g.fillText(text, W / 2, y + 1);
    g.restore();
  }

  function centerText(lines, lt, dur, opts = {}) {
    const fade = ease(Math.min(lt / 1.0, (dur - lt) / 0.8));
    g.save();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((ln, k) => {
      const a = fade * ease((lt - k * (opts.stagger || 0.5)) / 0.8);
      if (a <= 0) return;
      g.globalAlpha = a;
      let fs = ln.size;
      g.font = `${ln.weight || ''} ${fs}px ${ln.font || 'Jua, sans-serif'}`;
      const tw = g.measureText(ln.text).width * 1.1;
      if (tw > W * 0.86) { fs *= (W * 0.86) / tw; g.font = `${ln.weight || ''} ${fs}px ${ln.font || 'Jua, sans-serif'}`; }
      const spacing = (opts.spread ? (1 - ease(lt / 2.5)) * 0.4 + 0.1 : 0.05) * fs;
      if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
      g.fillStyle = ln.color || '#fff';
      g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 12;
      g.fillText(ln.text, W / 2, H / 2 + ln.dy + (1 - a) * 12);
    });
    if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.restore();
  }

  function drawSeg(seg, lt, alpha, trIn) {
    if (seg.type === 'photo') {
      let sc = 1, dx = 0;
      if (trIn && seg.tr === 'zoom') sc = 1 + 0.25 * (1 - alpha);
      if (trIn && seg.tr === 'slide') dx = (1 - ease(alpha)) * W * 0.35;
      drawPhoto(seg, lt, trIn && seg.tr === 'slide' ? 1 : alpha, sc, dx);
      caption(seg.caption, lt, seg.dur, alpha);
    } else if (seg.type === 'title') {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      // 첫 사진이 아주 흐리게 깔림
      const im = imgs[imgs.length - 1];
      if (im && im.complete && im.naturalWidth) {
        g.save(); g.globalAlpha = alpha * 0.35 * ease(lt / 3);
        const b = blurred(im), k = Math.max(W / im.naturalWidth, H / im.naturalHeight) * (1.1 + lt * 0.02);
        g.drawImage(b, W / 2 - (im.naturalWidth * k) / 2, H / 2 - (im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
        g.restore();
      }
      const fs = Math.min(W * 0.13, 72);
      g.save(); g.globalAlpha = alpha;
      centerText([
        { text: BD.fill(CFG.filmTitle || '{이름}의 이야기'), size: fs, dy: -fs * 0.35, font: "'Nanum Myeongjo', serif", weight: 800 },
        { text: CFG.filmYears || '', size: fs * 0.32, dy: fs * 0.55, color: '#e9d8a6', font: "'Nanum Myeongjo', serif" },
      ], lt, seg.dur, { spread: true, stagger: 0.9 });
      g.restore();
    } else if (seg.type === 'chapter') {
      g.save(); g.globalAlpha = alpha;
      g.fillStyle = '#0b0b0e'; g.fillRect(0, 0, W, H);
      const fs = Math.min(W * 0.1, 54);
      centerText([
        { text: seg.title, size: fs * 0.42, dy: -fs * 0.55, color: '#e9d8a6', font: "'Nanum Myeongjo', serif" },
        { text: seg.sub, size: fs, dy: fs * 0.25 },
      ], lt, seg.dur, { stagger: 0.35 });
      // 가는 선
      const lw = W * 0.25 * ease(lt / 1.2);
      g.strokeStyle = 'rgba(233,216,166,.7)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(W / 2 - lw, H / 2 - fs * 1.05); g.lineTo(W / 2 + lw, H / 2 - fs * 1.05); g.stroke();
      g.restore();
    } else if (seg.type === 'collage') {
      g.save(); g.globalAlpha = alpha;
      g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
      const n = imgs.length, cols = W < H ? 4 : 6, rows = Math.ceil(n / cols);
      const cell = Math.min(W / (cols + 0.6), H / (rows + 0.6));
      const zoom = 1.25 - 0.25 * ease(lt / seg.dur);
      g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2, -H / 2);
      imgs.forEach((im, k) => {
        const appear = ease((lt - k * 0.08) / 0.5);
        if (appear <= 0 || !im.naturalWidth) return;
        const cx = W / 2 + ((k % cols) - (cols - 1) / 2) * cell;
        const cy = H / 2 + (Math.floor(k / cols) - (rows - 1) / 2) * cell;
        const sz = cell * 0.86;
        g.save();
        g.globalAlpha = alpha * appear;
        g.translate(cx, cy); g.rotate(Math.sin(k * 3.1) * 0.08); g.scale(0.6 + 0.4 * appear, 0.6 + 0.4 * appear);
        g.fillStyle = '#fff'; g.fillRect(-sz / 2 - 4, -sz / 2 - 4, sz + 8, sz + 14);
        const k2 = Math.max(sz / im.naturalWidth, sz / im.naturalHeight);
        g.beginPath(); g.rect(-sz / 2, -sz / 2, sz, sz); g.clip();
        g.drawImage(im, -im.naturalWidth * k2 / 2, -im.naturalHeight * k2 / 2, im.naturalWidth * k2, im.naturalHeight * k2);
        g.restore();
      });
      g.restore();
    } else if (seg.type === 'end') {
      g.save(); g.globalAlpha = alpha;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const lines = (CFG.filmEnd || []).map((s) => BD.fill(s));
      const fs = Math.min(W * 0.075, 40);
      centerText(lines.map((s, k) => ({
        text: s, size: k === lines.length - 1 ? fs * 0.6 : fs,
        dy: (k - (lines.length - 1) / 2) * fs * 1.7,
        color: k === lines.length - 1 ? '#e9d8a6' : '#fff',
        font: k === 0 ? "'Nanum Myeongjo', serif" : 'Jua, sans-serif',
      })), lt, seg.dur + 30, { stagger: 1.1 });
      g.restore();
    }
  }

  function effects(now) {
    // 빛 번짐
    const lx = W * (0.15 + 0.1 * Math.sin(now / 3.1)), ly = H * (0.2 + 0.1 * Math.cos(now / 2.3));
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.7);
    lg.addColorStop(0, 'rgba(255,170,90,.22)'); lg.addColorStop(0.5, 'rgba(255,110,140,.07)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = lg; g.fillRect(0, 0, W, H); g.restore();
    // 비네팅
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // 필름 노이즈
    g.save();
    g.globalAlpha = 0.07; g.globalCompositeOperation = 'overlay';
    const ox = Math.random() * 160, oy = Math.random() * 160;
    for (let x = -ox; x < W; x += 160) for (let y = -oy; y < H; y += 160) g.drawImage(grain, x, y);
    g.restore();
    // 시네마 레터박스
    const bar = H * 0.055;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
  }

  function frame() {
    const now = performance.now() / 1000;
    const t = now - t0;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    let i = timeline.findIndex((s) => t >= s.start && t < s.start + s.dur);
    if (i < 0) i = timeline.length - 1;
    const seg = timeline[i], lt = t - seg.start;
    drawSeg(seg, lt, 1, false);
    // 다음 장면으로 넘어가는 중
    const next = timeline[i + 1];
    const into = lt - (seg.dur - TR);
    if (next && into > 0) {
      const a = ease(into / TR);
      drawSeg(next, into - TR, a, true);
      if (next.tr === 'flash') {
        g.fillStyle = `rgba(255,255,255,${Math.sin(a * Math.PI) * 0.85})`;
        g.fillRect(0, 0, W, H);
      }
    }
    effects(now);
    // 처음 페이드 인
    if (t < 1.2) { g.fillStyle = `rgba(0,0,0,${1 - ease(t / 1.2)})`; g.fillRect(0, 0, W, H); }
    if (t >= total - 2.5) ov.querySelector('.film-end').hidden = false;
    if (t >= total - 0.2) ov.querySelector('.film-skip').hidden = true;
    raf = requestAnimationFrame(frame);
  }

  function start() {
    build();
    timeline = makeTimeline();
    ov.hidden = false;
    ov.querySelector('.film-end').hidden = true;
    ov.querySelector('.film-skip').hidden = false;
    size();
    if (master) fadeMusic(0.3);
    t0 = performance.now() / 1000;
    cancelAnimationFrame(raf);
    playing = true;
    music();
    raf = requestAnimationFrame(frame);
  }

  function close() {
    playing = false;
    cancelAnimationFrame(raf);
    fadeMusic(0.6);
    ov.hidden = true;
    const cb = onClose; onClose = null;
    if (cb) cb();
  }

  function play(cb) { onClose = cb; build(); start(); }
  function preload() { build(); }
  return { play, preload };
})();
