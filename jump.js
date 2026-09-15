(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;
  const LETTER_AT = CFG.jumpLetterAt || 100;   // 이 계단에 도착하면 편지
  const TURN_PROB = 0.35;                       // 계단이 꺾일 확률
  const GAIN = 0.085;                           // 한 칸 오를 때 차는 게이지
  const drainRate = (n) => 0.13 + Math.min(0.4, n * 0.0015);   // 초당 닳는 양
  const TAU = Math.PI * 2;

  // ---------- 저장 ----------
  const SAVE_KEY = 'bdayJump_v1';
  const save = (() => {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { d = {}; }
    return {
      best: d.best || 0,
      sound: d.sound !== false,
      write() {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify({ best: this.best, sound: this.sound })); } catch (e) { /* 무시 */ }
      },
    };
  })();

  // ---------- 글자 ----------
  const name = CFG.friendName || '친구';
  const hasBatchim = (s) => {
    const c = s.charCodeAt(s.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  };
  const fill = (t) => t
    .replaceAll('{이름아}', name + (hasBatchim(name) ? '아' : '야'))
    .replaceAll('{이름}', name);

  const $ = (id) => document.getElementById(id);
  const cv = $('jcv'), ctx = cv.getContext('2d');
  const scoreEl = $('jscore'), gaugeEl = $('jgauge'), gaugeFill = $('jgaugeFill');

  // ---------- 얼굴 ----------
  const face = new Image();
  face.onload = () => { headCache = null; };
  face.src = CFG.jumpFace || 'photos/stage9.jpg';

  // ---------- 색 ----------
  function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  const STAIR_COLORS = ['#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];
  // 높이별 하늘 [계단 수, 위 색, 아래 색]
  const SKY = [
    [0, '#8fd0ff', '#fff3e0'],
    [60, '#ff9fb2', '#ffd6a5'],
    [130, '#34346e', '#7b5ea7'],
    [220, '#07071f', '#2a1f4f'],
  ];
  function skyAt(h) {
    for (let i = SKY.length - 1; i >= 0; i--) {
      if (h >= SKY[i][0]) {
        const a = SKY[i], b = SKY[i + 1];
        if (!b) return [a[1], a[2]];
        const t = (h - a[0]) / (b[0] - a[0]);
        return [mix(a[1], b[1], t), mix(a[2], b[2], t)];
      }
    }
    return [SKY[0][1], SKY[0][2]];
  }

  // ---------- 화면 ----------
  let W = 0, H = 0, dpr = 1, U = 60, RISE = 31;
  let headCache = null;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    U = Math.max(44, Math.min(86, W / 6.2));
    RISE = U * 0.52;
    headCache = null;
  }

  // ---------- 계단 ----------
  let stairs = [];
  let genDir = 1;
  function genTo(n) {
    while (stairs.length <= n) {
      const i = stairs.length;
      if (i === 0) { stairs.push(0); genDir = Math.random() < 0.5 ? 1 : -1; continue; }
      if (i > 2 && Math.random() < TURN_PROB) genDir = -genDir;
      stairs.push(stairs[i - 1] + genDir);
    }
  }

  // ---------- 상태 ----------
  let state = 'intro';   // intro | play | pause | falling | over
  let idx = 0, facing = 1;
  let gauge = 1, started = false;
  let camX = 0, camY = 0;
  let hop = null;               // { fx, fy, tx, ty, t }
  let fall = null;              // { x, y, vx, vy, rot, t, reason }
  let newBest = false;
  let resumeState = 'play';

  function newGame() {
    stairs = []; genTo(60);
    idx = 0;
    facing = stairs[1] - stairs[0];
    gauge = 1; started = false;
    camX = stairs[0]; camY = 0;
    hop = null; fall = null; newBest = false;
    particles.length = 0;
    setScore(0);
    state = 'play';
  }

  function setScore(n) {
    scoreEl.textContent = n;
    scoreEl.classList.remove('pop'); void scoreEl.offsetWidth; scoreEl.classList.add('pop');
  }

  function act(turn) {
    if (state !== 'play') return;
    sfx.unlock();
    if (turn) facing = -facing;
    genTo(idx + 60);
    const need = stairs[idx + 1] - stairs[idx];
    const fx = stairs[idx], fy = idx;
    if (facing !== need) {
      startFall('miss', fx, fy);
      return;
    }
    idx++;
    started = true;
    gauge = Math.min(1, gauge + GAIN);
    hop = { fx, fy, tx: stairs[idx], ty: idx, t: 0 };
    setScore(idx);
    sfx.step(idx, turn);
    vibrate(6);
    dust(stairs[idx], idx);
    milestone(idx);
  }

  function milestone(n) {
    if (n === LETTER_AT) {
      state = 'pause';                 // 바로 멈추고 (연타해도 안 올라감)
      resumeState = 'play';
      setTimeout(openLetter, 350);     // 도착 모습 잠깐 보여준 뒤 편지
    } else if (n === Math.floor(LETTER_AT / 2)) {
      toast('절반 왔다! 💪');
    } else if (n === LETTER_AT - 10) {
      toast('💌 편지까지 10계단!');
    } else if (n > LETTER_AT && n % 50 === 0) {
      toast(`🔥 ${n}계단 돌파!`);
    }
  }

  function startFall(reason, x, y) {
    state = 'falling';
    fall = {
      x, y, rot: 0, t: 0, reason,
      vx: reason === 'miss' ? facing * 2.2 : 0,
      vy: reason === 'miss' ? 5 : 1.5,
    };
    sfx.fall();
    vibrate(90);
    if (idx > save.best) { save.best = idx; newBest = true; }
    save.write();
  }

  function showResult() {
    state = 'over';
    $('resTitle').textContent = fall && fall.reason === 'time' ? '⏰ 시간 초과!' : '💥 헛디뎠다!';
    $('resMain').textContent = idx;
    $('resBadge').hidden = !(newBest && idx > 0);
    $('resSub').textContent = idx >= LETTER_AT
      ? `최고 ${save.best}계단 · 💌 편지 받음!`
      : `최고 ${save.best}계단 · 편지까지 ${LETTER_AT - idx}계단 남았어!`;
    $('jbest').textContent = `최고 ${save.best}`;
    show('ovOver');
    if (newBest && idx > 0) confetti(60);
  }

  // ---------- 효과 ----------
  const particles = [];
  function dust(x, y) {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: x + (Math.random() - 0.5) * 0.6, y: y + 0.05,
        vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random() * 1.2,
        t: 0, life: 350 + Math.random() * 200,
        c: STAIR_COLORS[(Math.random() * STAIR_COLORS.length) | 0],
      });
    }
  }

  // ---------- 좌표 변환 ----------
  const cx = () => W / 2;
  const cy = () => H * 0.6;
  const sx = (x) => cx() + (x - camX) * U;
  const sy = (y) => cy() - (y - camY) * RISE;

  // ---------- 그리기 ----------
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawSky(now) {
    const [top, bot] = skyAt(camY);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 별
    const starA = Math.max(0, Math.min(1, (camY - 100) / 60));
    if (starA > 0) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) {
        const x = ((i * 97.13) % 1) * W || (i * 53) % W;
        const px = (i * 131) % W;
        const py = ((i * 71 + camY * 3) % (H + 20)) - 10;
        const tw = 0.5 + 0.5 * Math.sin(now / 400 + i);
        ctx.globalAlpha = starA * (0.4 + 0.6 * tw);
        ctx.fillRect(px, py, 2, 2);
        void x;
      }
      ctx.globalAlpha = 1;
    }

    // 떠다니는 장식 (천천히 따라오는 배경)
    const PAR = 0.35;
    const base = camY * PAR;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${U * 0.62}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    const from = Math.floor((base - 12) / 3), to = Math.ceil((base + 14) / 3);
    for (let k = from; k <= to; k++) {
      if (k < 0) continue;
      const h = k * 3 / PAR;                // 이 장식이 속한 대략의 계단 높이
      const set = h < 55 ? ['☁️', '🎈', '☁️', '🐦', '🎈']
        : h < 120 ? ['🎈', '☁️', '🎈', '🎀']
          : h < 210 ? ['⭐', '🌙', '✨', '⭐']
            : ['🪐', '⭐', '🚀', '✨', '🛸'];
      const e = set[k % set.length];
      const x = (((k * 0.618034) % 1) * 0.9 + 0.05) * W + Math.sin(now / 1500 + k) * 8;
      const y = cy() - (k * 3 - base) * RISE;
      ctx.globalAlpha = 0.75;
      ctx.fillText(e, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function drawStair(i) {
    const x = sx(stairs[i]) - U / 2, y = sy(i);
    const T = RISE * 0.42, F = RISE * 0.58;
    const special = i === LETTER_AT;
    const col = special ? '#ffd43b' : STAIR_COLORS[i % STAIR_COLORS.length];
    // 앞면
    ctx.fillStyle = shade(col, -0.22);
    roundRect(ctx, x, y + T - 2, U, F + 2, 6); ctx.fill();
    // 윗면
    ctx.fillStyle = col;
    roundRect(ctx, x, y, U, T, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    roundRect(ctx, x + 4, y + 2, U - 8, T * 0.35, 3); ctx.fill();

    if (i > 0 && (i % 25 === 0 || special)) {
      ctx.fillStyle = shade(col, -0.55);
      ctx.font = `${Math.round(F * 0.8)}px Jua, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i, x + U / 2, y + T + F / 2);
    }
    if (special && idx < LETTER_AT) {
      ctx.font = `${U * 0.7}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const bob = Math.sin(performance.now() / 300) * 4;
      ctx.fillText('💌', x + U / 2, y - U * 0.55 + bob);
    }
  }

  function head() {
    const hr = U * 0.34;
    if (headCache && headCache.hr === hr) return headCache;
    const size = Math.ceil((hr + 3) * 2 * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    g.translate(hr + 3, hr + 3);
    g.beginPath(); g.arc(0, 0, hr, 0, TAU); g.fillStyle = '#ffe0c7'; g.fill();
    if (face.complete && face.naturalWidth) {
      g.save(); g.beginPath(); g.arc(0, 0, hr, 0, TAU); g.clip();
      const k = Math.max((2 * hr) / face.naturalWidth, (2 * hr) / face.naturalHeight);
      const w = face.naturalWidth * k, h = face.naturalHeight * k;
      g.drawImage(face, -w / 2, -h / 2, w, h);
      g.restore();
    }
    g.lineWidth = 3; g.strokeStyle = '#fff';
    g.beginPath(); g.arc(0, 0, hr, 0, TAU); g.stroke();
    headCache = { c, hr, size: size / dpr };
    return headCache;
  }

  // 발 위치 (px, py) 기준으로 캐릭터
  function drawPlayer(px, py, lift, rot) {
    const hr = U * 0.34, bw = U * 0.42, bh = U * 0.32, leg = U * 0.16;
    ctx.save();
    ctx.translate(px, py);
    if (rot) ctx.rotate(rot);
    const lean = facing * 0.08;
    ctx.rotate(lean);
    // 다리
    const spread = lift > 0.05 ? U * 0.1 : U * 0.06;
    ctx.strokeStyle = '#3b5bdb'; ctx.lineWidth = U * 0.1; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-U * 0.07, -leg); ctx.lineTo(-spread, -2);
    ctx.moveTo(U * 0.07, -leg); ctx.lineTo(spread, -2);
    ctx.stroke();
    // 몸
    ctx.fillStyle = '#ff8787';
    roundRect(ctx, -bw / 2, -leg - bh, bw, bh + 2, bw * 0.3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `${bh * 0.55}px Jua, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // 팔 (보는 방향으로)
    ctx.strokeStyle = '#ff8787'; ctx.lineWidth = U * 0.09;
    ctx.beginPath();
    ctx.moveTo(facing * bw * 0.35, -leg - bh * 0.7);
    ctx.lineTo(facing * bw * 0.85, -leg - bh * (lift > 0.05 ? 1.1 : 0.45));
    ctx.stroke();
    // 머리
    const hy = -leg - bh - hr * 0.8;
    const hc = head();
    ctx.drawImage(hc.c, -hc.size / 2, hy - hc.size / 2, hc.size, hc.size);
    // 고깔모자
    ctx.save();
    ctx.translate(0, hy - hr * 0.78);
    ctx.rotate(facing * 0.28);
    const hw = hr * 0.62, hh = hr * 1.05;
    ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(hw, 0); ctx.lineTo(0, -hh); ctx.closePath();
    ctx.fillStyle = '#845ef7'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = hr * 0.18;
    for (let s = -2; s <= 2; s++) {
      ctx.beginPath(); ctx.moveTo(-hw * 2, s * hh * 0.35); ctx.lineTo(hw * 2, s * hh * 0.35 - hh * 0.5); ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, -hh, hr * 0.16, 0, TAU); ctx.fillStyle = '#ff6b6b'; ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSky(now);

    // 보이는 계단만
    const lo = Math.max(0, Math.floor(camY - (H - cy()) / RISE) - 2);
    const hi = Math.ceil(camY + cy() / RISE) + 2;
    genTo(hi + 5);
    for (let i = hi; i >= lo; i--) drawStair(i);   // 위 계단을 먼저 → 아래 계단이 앞에

    // 캐릭터
    if (state !== 'intro') {
      let px, py, lift = 0, rot = 0;
      if (fall) {
        px = sx(fall.x); py = sy(fall.y); rot = fall.rot;
      } else if (hop) {
        const t = hop.t;
        lift = Math.sin(Math.PI * t) * 0.55;
        px = sx(hop.fx + (hop.tx - hop.fx) * t);
        py = sy(hop.fy + (hop.ty - hop.fy) * t + lift);
      } else {
        px = sx(stairs[idx]); py = sy(idx);
      }
      // 그림자
      if (!fall) {
        ctx.fillStyle = 'rgba(0,0,0,.15)';
        ctx.beginPath(); ctx.ellipse(sx(hop ? hop.tx : stairs[idx]), sy(hop ? hop.ty : idx) + 3, U * 0.24, U * 0.06, 0, 0, TAU); ctx.fill();
      }
      drawPlayer(px, py, lift, rot);
    }

    for (const p of particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), U * 0.06, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last) / 1000;
    last = now;

    if (state === 'play') {
      if (started) {
        gauge -= drainRate(idx) * dt;
        if (gauge <= 0) { gauge = 0; startFall('time', stairs[idx], idx); }
      }
      if (hop) { hop.t += dt / 0.09; if (hop.t >= 1) hop = null; }
    }
    if (state === 'falling' && fall) {
      fall.t += dt;
      fall.vy -= 22 * dt;
      fall.x += fall.vx * dt;
      fall.y += fall.vy * dt;
      fall.rot += (fall.vx >= 0 ? 1 : -1) * 7 * dt;
      if (fall.t > 1.1) showResult();
    }

    // 카메라
    const tx = fall ? camX : hop ? hop.tx : stairs[idx] || 0;
    const ty = fall ? camY : hop ? hop.ty : idx;
    const k = 1 - Math.pow(0.0005, dt);
    camX += (tx - camX) * k;
    camY += (ty - camY) * k;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt * 1000;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt;
    }

    // 게이지 UI
    gaugeFill.style.width = (gauge * 100).toFixed(1) + '%';
    gaugeFill.style.background = gauge > 0.5 ? '#51cf66' : gauge > 0.25 ? '#fcc419' : '#ff6b6b';
    gaugeEl.classList.toggle('low', state === 'play' && started && gauge < 0.25);

    render(now);
    confettiTick(dt * 1000);
    requestAnimationFrame(frame);
  }

  // ---------- 오버레이 ----------
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }

  function pause() {
    if (state !== 'play') return;
    resumeState = 'play';
    state = 'pause';
    show('ovPause');
  }

  function openLetter() {
    $('letterTitle').textContent = fill(CFG.jumpLetterTitle || CFG.letterTitle || '💌 {이름}에게');
    $('letterBody').textContent = fill(CFG.jumpLetter || CFG.letter || '');
    show('ovLetter');
    document.querySelector('#ovLetter .card').scrollTop = 0;
    confetti(160);
    sfx.fanfare();
    vibrate([30, 60, 30, 60, 30]);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- 폭죽 ----------
  const cf = $('confetti'), cfx = cf.getContext('2d');
  const bits = [];
  const CF_COLORS = ['#ff7aa2', '#ffd166', '#7ad3ff', '#9be08c', '#c79bff', '#ffffff'];
  function confetti(n) {
    for (let i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        c: CF_COLORS[(Math.random() * CF_COLORS.length) | 0],
      });
    }
  }
  function confettiTick(dtMs) {
    const d = window.devicePixelRatio || 1;
    if (cf.width !== innerWidth * d || cf.height !== innerHeight * d) {
      cf.width = innerWidth * d; cf.height = innerHeight * d;
    }
    cfx.setTransform(d, 0, 0, d, 0, 0);
    cfx.clearRect(0, 0, innerWidth, innerHeight);
    const k = dtMs / 16;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.x += b.vx * k; b.y += b.vy * k; b.r += b.vr * k;
      b.vx += Math.sin(b.y / 40) * 0.03;
      if (b.y > innerHeight + 30) { bits.splice(i, 1); continue; }
      const q = Math.abs(Math.cos(b.r * 2));
      cfx.save(); cfx.translate(b.x, b.y); cfx.rotate(b.r);
      cfx.fillStyle = b.c;
      cfx.fillRect(-b.w / 2, (-b.h / 2) * q, b.w, b.h * q + 1);
      cfx.restore();
    }
  }

  // ---------- 소리 ----------
  const sfx = (() => {
    let ac = null;
    const SCALE = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];
    const tone = (freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 1) => {
      if (!save.sound || !ac) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    };
    return {
      unlock() {
        if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
        if (ac.state === 'suspended') ac.resume();
      },
      step(n, turned) {
        const f = 523 * Math.pow(2, SCALE[n % SCALE.length] / 12);
        tone(f, 0.07, turned ? 'square' : 'triangle', turned ? 0.05 : 0.1);
      },
      fall() { tone(500, 0.6, 'triangle', 0.14, 0, 0.25); },
      fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.11, 1.02)); },
    };
  })();

  function vibrate(p) {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p);
    } catch (e) { /* 무시 */ }
  }

  // ---------- 입력 ----------
  function bindBtn(el, turn) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      act(turn);
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('pointercancel', up);
  }
  bindBtn($('btnTurn'), true);
  bindBtn($('btnUp'), false);
  // 화면 왼쪽 탭 = 방향전환, 오른쪽 탭 = 오르기
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    act(e.clientX < r.left + r.width / 2);
  });
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (['ArrowLeft', 'KeyA', 'KeyZ'].includes(e.code)) { e.preventDefault(); act(true); }
    if (['ArrowRight', 'ArrowUp', 'KeyD', 'KeyX', 'Space'].includes(e.code)) { e.preventDefault(); act(false); }
  });

  // ---------- 버튼 ----------
  const soundBtn = $('btnSound');
  const syncSound = () => { soundBtn.textContent = save.sound ? '🔊' : '🔇'; };
  syncSound();
  soundBtn.onclick = () => { save.sound = !save.sound; save.write(); syncSound(); sfx.unlock(); };
  $('btnPause').onclick = pause;
  $('btnStart').onclick = () => { sfx.unlock(); hide('ovIntro'); newGame(); };
  $('btnRetry').onclick = () => { hide('ovOver'); newGame(); };
  $('btnResume').onclick = () => { hide('ovPause'); state = resumeState; };
  $('btnQuit').onclick = () => { hide('ovPause'); newGame(); };
  $('btnLetterClose').onclick = () => {
    hide('ovLetter');
    gauge = 1;                       // 편지 보상: 게이지 가득
    state = resumeState;
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__jump = {
      needTurn: () => stairs[idx + 1] - stairs[idx] !== facing,
      idx: () => idx, state: () => state, gauge: () => gauge,
    };
  }

  // ---------- 시작 ----------
  $('goalN').textContent = LETTER_AT;
  $('jbest').textContent = `최고 ${save.best}`;
  if (save.best) { $('introRecord').textContent = `🏆 최고 기록 ${save.best}계단`; $('introRecord').hidden = false; }
  window.addEventListener('resize', resize);
  resize();
  newGame(); state = 'intro';
  requestAnimationFrame(frame);
})();
