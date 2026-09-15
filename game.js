(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;
  const STAGES = CFG.stages;
  const N = STAGES.length;
  const LAST = N - 1;
  const SPAWN = Math.min(CFG.spawnLevels || 4, LAST);
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  // ---------- 월드 / 규칙 수치 ----------
  const W = 360, H = 700;     // 폰 세로 화면 비율에 맞춤
  const DROP_Y = 64;          // 떨어뜨리는 높이
  const LINE_Y = 122;         // 이 선 위로 넘친 채 OVER_MS 지나면 실패
  const OVER_MS = 2500;
  const GRACE_MS = 1200;      // 막 떨어뜨린 공은 잠깐 봐줌
  const DROP_COOLDOWN = 420;
  const STEP = 1000 / 60;
  const TAU = Math.PI * 2;
  const R_MIN = 16, R_MAX = 84;
  const COMBO_MS = 1300;      // 이 시간 안에 또 합치면 콤보
  const lvlRadius = (i) => R_MIN + (R_MAX - R_MIN) * Math.pow(i / LAST, 1.15);
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  // ---------- 저장 ----------
  const SAVE_KEY = 'bdayMerge_v2';
  const save = (() => {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { d = {}; }
    return {
      best: d.best || 0,
      bestTime: d.bestTime || 0,
      wins: d.wins || 0,
      found: new Set(d.found || []),
      sound: d.sound !== false,
      write() {
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify({
            best: this.best, bestTime: this.bestTime, wins: this.wins,
            found: [...this.found], sound: this.sound,
          }));
        } catch (e) { /* 저장 불가(사생활 모드 등) — 무시 */ }
      },
    };
  })();
  for (let i = 0; i < SPAWN; i++) save.found.add(i);

  // ---------- 글자 유틸 ----------
  const name = CFG.friendName || '친구';
  const hasBatchim = (s) => {
    const c = s.charCodeAt(s.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  };
  const fill = (t) => t
    .replaceAll('{이름아}', name + (hasBatchim(name) ? '아' : '야'))
    .replaceAll('{이름}', name);
  const fmtClear = (ms) => {
    const s = ms / 1000;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const stageEl = $('stage');
  const scoreEl = $('score'), timerEl = $('timer');

  // ---------- 사진 불러오기 ----------
  STAGES.forEach((st, i) => {
    if (!st.img) return;
    const im = new Image();
    im.onload = () => { st._img = im; delete sprites[i]; refreshMinis(); };
    im.src = st.img;
  });

  // ---------- 색 유틸 ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // ---------- 공 그리기 (0,0 중심, 반지름 r) ----------
  function drawBall(g, r, i) {
    const st = STAGES[i];
    g.beginPath(); g.arc(0, 0, r, 0, TAU);
    g.fillStyle = st.color; g.fill();

    if (st._img) {
      const im = st._img, ir = r * 0.88;
      const [fx, fy] = st.imgPos || [0.5, 0.5];
      const k = Math.max(2 * ir / im.naturalWidth, 2 * ir / im.naturalHeight) * (st.imgZoom || 1);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      g.save();
      g.beginPath(); g.arc(0, 0, ir, 0, TAU); g.clip();
      g.drawImage(im, -w * fx, -h * fy, w, h);
      g.restore();
    } else {
      g.font = `${r * 1.2}px ${EMOJI_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(st.emoji, 0, r * 0.08);
    }
    gloss(g, r);
    const lw = Math.max(1, r * 0.055);
    g.lineWidth = lw; g.strokeStyle = shade(st.color, -0.28);
    g.beginPath(); g.arc(0, 0, r - lw / 2, 0, TAU); g.stroke();
  }

  function gloss(g, r) {
    g.beginPath(); g.ellipse(-r * 0.38, -r * 0.42, r * 0.22, r * 0.12, -0.7, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fill();
  }

  function drawLocked(g, r) {
    g.beginPath(); g.arc(0, 0, r, 0, TAU);
    g.fillStyle = '#f1e4e8'; g.fill();
    g.lineWidth = Math.max(1, r * 0.06); g.strokeStyle = '#dcc5cc'; g.stroke();
    g.fillStyle = '#c9aeb6';
    g.font = `${r * 1.1}px Jua, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', 0, r * 0.08);
  }

  // UI용 작은 캔버스
  function paintMini(c, k, locked) {
    const size = +c.dataset.size || 40, d = window.devicePixelRatio || 1;
    if (c.width !== size * d) {
      c.width = c.height = size * d;
      c.style.width = c.style.height = size + 'px';
    }
    const g = c.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, size, size);
    g.translate(size / 2, size / 2);
    if (locked) drawLocked(g, size / 2 - 1); else drawBall(g, size / 2 - 1, k);
  }

  // ---------- 게임 캔버스용 스프라이트 캐시 ----------
  let scale = 1, dpr = 1;
  let sprites = {};
  function sprite(lvl) {
    if (sprites[lvl]) return sprites[lvl];
    const r = lvlRadius(lvl), pad = 2, s = scale * dpr;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil((r + pad) * 2 * s);
    const g = c.getContext('2d');
    g.scale(s, s); g.translate(r + pad, r + pad);
    drawBall(g, r, lvl);
    return (sprites[lvl] = { c, size: (r + pad) * 2 });
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const box = getComputedStyle($('box'));
    const bx = parseFloat(box.borderLeftWidth) + parseFloat(box.borderRightWidth);
    const by = parseFloat(box.borderTopWidth) + parseFloat(box.borderBottomWidth);
    const aw = stageEl.clientWidth - bx, ah = stageEl.clientHeight - by;
    scale = Math.max(0.1, Math.min(aw / W, ah / H));
    cv.style.width = W * scale + 'px';
    cv.style.height = H * scale + 'px';
    cv.width = Math.round(W * scale * dpr);
    cv.height = Math.round(H * scale * dpr);
    sprites = {};
    buildEvo();
  }

  // ---------- 물리 ----------
  const engine = Engine.create();
  engine.gravity.y = 1.1;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;

  const wallOpt = { isStatic: true, friction: 0.3, restitution: 0.1 };
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, H + 50, W * 2, 100, wallOpt),
    Bodies.rectangle(-50, H / 2 - H, 100, H * 4, wallOpt),
    Bodies.rectangle(W + 50, H / 2 - H, 100, H * 4, wallOpt),
  ]);

  let balls = [];
  let pending = [];
  let gameTime = 0;

  function addBall(lvl, x, y, vx = 0, vy = 0) {
    const r = lvlRadius(lvl);
    const b = Bodies.circle(x, y, r, {
      restitution: 0.12, friction: 0.25, frictionStatic: 0.5,
      frictionAir: 0.006, density: 0.0012,
    });
    b.plugin = {
      ball: true, lvl,
      born: gameTime, over: 0, merged: false, dead: false,
      pop: 0, sq: 0, sqv: 0, landed: false,
    };
    Body.setVelocity(b, { x: vx, y: vy });
    Composite.add(engine.world, b);
    balls.push(b);
    return b;
  }

  function removeBody(b) {
    if (b.plugin.dead) return;
    b.plugin.dead = true;
    Composite.remove(engine.world, b);
    balls = balls.filter((o) => o !== b);
  }

  function impact(b, sp) {
    const p = b.plugin;
    if (!p || !p.ball) return;
    p.sq = Math.min(0.24, Math.max(p.sq, sp * 0.03));
    if (!p.landed) { p.landed = true; sfx.land(Math.min(1, sp / 8)); }
  }

  function handlePairs(pairs, start) {
    for (const pr of pairs) {
      const a = pr.bodyA, b = pr.bodyB, pa = a.plugin, pb = b.plugin;
      if (start) {
        const sp = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
        if (sp > 1.2) { impact(a, sp); impact(b, sp); }
      }
      if (!pa.ball || !pb.ball || pa.merged || pb.merged || pa.lvl !== pb.lvl) continue;
      pa.merged = pb.merged = true;
      pending.push([a, b]);
    }
  }
  Events.on(engine, 'collisionStart', (e) => handlePairs(e.pairs, true));
  Events.on(engine, 'collisionActive', (e) => handlePairs(e.pairs, false));

  function processPending() {
    if (!pending.length) return;
    const list = pending; pending = [];
    for (const [a, b] of list) {
      if (state !== 'play') return;
      if (a.plugin.dead || b.plugin.dead) continue;
      const x = (a.position.x + b.position.x) / 2, y = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2, vy = (a.velocity.y + b.velocity.y) / 2;
      const lvl = a.plugin.lvl;
      removeBody(a); removeBody(b);
      levelUp(lvl, x, y, vx, vy);
    }
  }

  function levelUp(lvl, x, y, vx, vy) {
    const nl = Math.min(LAST, lvl + 1);
    // 콤보
    combo = gameTime - lastMerge < COMBO_MS ? combo + 1 : 1;
    lastMerge = gameTime;
    if (combo >= 2) comboFx = { n: combo, t: 0 };

    const nb = addBall(nl, x, y, vx, vy);
    nb.plugin.born = gameTime - GRACE_MS / 2;
    nb.plugin.pop = 1;
    nb.plugin.landed = true;

    const pts = ((nl * (nl + 1)) / 2) * combo;
    addScore(pts, x, y, combo);
    burst(x, y, nl, 10 + nl * 3);
    shockwave(nb, x, y, lvlRadius(nl), nl);
    shake = Math.max(shake, 1.5 + nl * 0.9 + combo * 0.6);
    if (nl >= 5) hitstop = Math.max(hitstop, 40 + nl * 12);
    sfx.merge(nl, combo);
    vibrate(8 + nl * 3);
    if (nl > maxLvl) maxLvl = nl;
    discover(nl);
    if (nl === LAST) win(x, y);
  }

  // 합칠 때 주변을 살짝 밀어냄
  function shockwave(self, x, y, r, lvl) {
    const reach = r * 2.6;
    for (const b of balls) {
      if (b === self) continue;
      const dx = b.position.x - x, dy = b.position.y - y, d = Math.hypot(dx, dy);
      if (d <= 0 || d > reach) continue;
      const f = (1 - d / reach) * (1 + lvl * 0.12);
      Body.setVelocity(b, { x: b.velocity.x + (dx / d) * f, y: b.velocity.y + (dy / d) * f * 0.5 });
    }
  }

  // ---------- 게임 상태 ----------
  let state = 'intro';     // intro | play | pause | win | over
  let score = 0, dispScore = 0;
  let cur = 0, nxt = 0;
  let aimX = W / 2;
  let aiming = false;
  let canDropAt = 0;
  let danger = 0;
  let combo = 0, lastMerge = -99999;
  let maxLvl = 0;
  let winTime = 0;
  let lastTick = -1;
  let shake = 0, hitstop = 0, flash = 0;
  let comboFx = null;
  let newBestScore = false, newBestTime = false;

  const randLvl = () => Math.floor(Math.random() * SPAWN);

  function addScore(pts, x, y, c) {
    score += pts;
    if (score > save.best) { save.best = score; newBestScore = true; }
    floats.push({ x, y, t: 0, text: '+' + pts, hot: c >= 2 });
  }

  function paintNext() {
    paintMini($('nextCv'), nxt);
  }

  function discover(lvl) {
    if (save.found.has(lvl)) return;
    save.found.add(lvl);
    save.write();
    buildEvo();
    if (lvl !== LAST) toast(`🔓 새로 발견! ${STAGES[lvl].emoji} ${STAGES[lvl].name}`);
  }

  function newGame() {
    for (const b of balls.slice()) removeBody(b);
    balls = []; pending = []; particles.length = 0; floats.length = 0;
    gameTime = 0; danger = 0; combo = 0; lastMerge = -99999;
    maxLvl = SPAWN - 1; lastTick = -1;
    shake = 0; hitstop = 0; flash = 0; comboFx = null;
    newBestScore = false; newBestTime = false;
    score = 0; dispScore = 0;
    cur = randLvl(); nxt = randLvl();
    aimX = W / 2;
    canDropAt = 300;
    paintNext();
    timerEl.classList.remove('warn');
    state = 'play';
  }

  function drop() {
    if (state !== 'play' || gameTime < canDropAt) return;
    const r = lvlRadius(cur);
    const b = addBall(cur, clampX(aimX, r), DROP_Y);
    Body.setVelocity(b, { x: 0, y: 2 });
    sfx.drop();
    cur = nxt; nxt = randLvl();
    paintNext();
    canDropAt = gameTime + DROP_COOLDOWN;
  }

  const clampX = (x, r) => Math.max(r + 1, Math.min(W - r - 1, x));

  function win(x, y) {
    state = 'win';
    winTime = gameTime;
    if (!save.bestTime || winTime < save.bestTime) { save.bestTime = winTime; newBestTime = true; }
    save.wins++;
    save.write();
    hitstop = 0;
    shake = 16; flash = 1;
    burst(x, y, LAST, 60);
    confetti(200);
    sfx.fanfare();
    vibrate([30, 60, 30, 60, 30]);
    album.preload();
    setTimeout(openLetter, 1300);
  }

  function fail(reason) {
    if (state !== 'play') return;
    state = 'over';
    save.write();
    sfx.over();
    vibrate(80);
    shake = 8;
    setTimeout(() => showResult(false, reason), 900);
  }

  function showResult(won, reason) {
    const cvs = $('resCv');
    if (won) {
      $('resTitle').textContent = '🎂 성공!';
      paintMini(cvs, LAST);
      $('resMain').textContent = fmtClear(winTime);
      $('resLabel').textContent = '클리어 시간';
      $('resBadge').textContent = '⚡ 최단 기록!';
      $('resBadge').hidden = !newBestTime;
      $('resSub').textContent = `최단 기록 ${fmtClear(save.bestTime)} · 점수 ${score}`;
    } else {
      $('resTitle').textContent = '💥 넘쳤다!';
      paintMini(cvs, maxLvl);
      $('resMain').textContent = score;
      const left = LAST - maxLvl;
      $('resLabel').textContent = `「${STAGES[maxLvl].name}」까지 도착 · 케이크까지 ${left}단계!`;
      $('resBadge').textContent = '🏆 최고 점수!';
      $('resBadge').hidden = !(newBestScore && score > 0);
      $('resSub').textContent = save.bestTime
        ? `최단 기록 ${fmtClear(save.bestTime)} · 최고 점수 ${save.best}`
        : `최고 점수 ${save.best}`;
    }
    show('ovOver');
    if ((won && newBestTime) || (!won && newBestScore && score > 0)) confetti(60);
  }

  function checkDanger(dt) {
    let near = false;
    for (const b of balls) {
      const top = b.position.y - lvlRadius(b.plugin.lvl);
      if (gameTime - b.plugin.born < GRACE_MS) { b.plugin.over = 0; continue; }
      if (top < LINE_Y + 60) near = true;
      if (top < LINE_Y) {
        b.plugin.over += dt;
        if (b.plugin.over > OVER_MS) { fail('overflow'); return; }
      } else b.plugin.over = 0;
    }
    danger = near ? Math.min(1, danger + dt / 300) : Math.max(0, danger - dt / 300);
  }

  function updateHud() {
    const sec = Math.floor(gameTime / 1000);
    if (sec !== lastTick) { lastTick = sec; timerEl.textContent = fmtClear(gameTime); }
    if (dispScore !== score) {
      dispScore += Math.max(1, Math.round((score - dispScore) * 0.2));
      if (dispScore > score) dispScore = score;
      scoreEl.textContent = dispScore + '점';
    }
  }

  // ---------- 입력 ----------
  const toWorldX = (e) => {
    const r = cv.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  };
  cv.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    sfx.unlock();
    aiming = true;
    aimX = toWorldX(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (state !== 'play') return;
    if (aiming || e.pointerType === 'mouse') aimX = toWorldX(e);
  });
  cv.addEventListener('pointerup', (e) => {
    if (!aiming) return;
    aiming = false;
    aimX = toWorldX(e);
    drop();
  });
  cv.addEventListener('pointercancel', () => { aiming = false; });

  // ---------- 효과 ----------
  const particles = [];
  const floats = [];
  function burst(x, y, lvl, n) {
    const r = lvlRadius(lvl), col = STAGES[lvl].color;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = 1.5 + Math.random() * (3 + lvl * 0.4);
      particles.push({
        x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
        t: 0, life: 500 + Math.random() * 400,
        s: 2 + Math.random() * 4,
        c: Math.random() < 0.35 ? '#ffffff' : shade(col, -0.1),
        star: Math.random() < 0.3,
      });
    }
    particles.push({ ring: true, x, y, r, grow: 0.6, t: 0, life: 380, c: shade(col, -0.15) });
  }

  function updateFx(dt) {
    const k = dt / 16;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      if (p.t > p.life) { particles.splice(i, 1); continue; }
      if (!p.ring) { p.x += p.vx * k; p.y += p.vy * k; p.vy += 0.12 * k; p.vx *= 0.99; }
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      floats[i].t += dt;
      if (floats[i].t > 900) floats.splice(i, 1);
    }
    if (comboFx) { comboFx.t += dt; if (comboFx.t > 900) comboFx = null; }
    shake *= Math.pow(0.86, k);
    if (shake < 0.1) shake = 0;
    flash = Math.max(0, flash - dt / 250);
    // 젤리 스프링
    for (const b of balls) {
      const p = b.plugin;
      p.sqv += -p.sq * 0.35; p.sqv *= 0.74; p.sq += p.sqv;
      if (Math.abs(p.sq) < 0.001 && Math.abs(p.sqv) < 0.001) p.sq = p.sqv = 0;
      if (p.pop) p.pop = Math.max(0, p.pop - 0.07 * k);
    }
  }

  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
  }

  // 지금 떨어뜨리면 어디에 떨어질지
  function landingY(x, r) {
    let y = H - r;
    for (const b of balls) {
      const rr = r + lvlRadius(b.plugin.lvl), dx = Math.abs(b.position.x - x);
      if (dx < rr) {
        const cy = b.position.y - Math.sqrt(rr * rr - dx * dx);
        if (cy < y) y = cy;
      }
    }
    return Math.max(DROP_Y, y);
  }

  // ---------- 그리기 ----------
  function render(now) {
    const s = scale * dpr;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 위험 비네트
    if (danger > 0) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 120);
      const g = ctx.createLinearGradient(0, 0, 0, LINE_Y + 80);
      g.addColorStop(0, `rgba(250,82,82,${0.28 * danger * pulse})`);
      g.addColorStop(1, 'rgba(250,82,82,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, LINE_Y + 80);
    }

    // 경고선
    const blink = danger > 0 ? 0.5 + 0.5 * Math.sin(now / 90) : 0;
    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = danger > 0
      ? `rgba(240,70,90,${0.35 + 0.6 * danger * blink})`
      : 'rgba(247,185,201,.9)';
    ctx.beginPath(); ctx.moveTo(0, LINE_Y); ctx.lineTo(W, LINE_Y); ctx.stroke();
    ctx.restore();

    // 조준선 + 떨어질 자리 + 현재 공
    if (state === 'play' || state === 'pause') {
      const r = lvlRadius(cur), x = clampX(aimX, r);
      const ready = gameTime >= canDropAt;
      const ly = landingY(x, r);
      ctx.save();
      ctx.globalAlpha = ready ? 1 : 0.35;
      ctx.strokeStyle = 'rgba(232,90,134,.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(x, DROP_Y + r); ctx.lineTo(x, ly - r); ctx.stroke();
      if (ly > DROP_Y + r * 2) {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(232,90,134,.45)';
        ctx.beginPath(); ctx.arc(x, ly, r, 0, TAU); ctx.stroke();
      }
      ctx.setLineDash([]);
      const sp = sprite(cur);
      const bob = Math.sin(now / 260) * 2;
      ctx.drawImage(sp.c, x - sp.size / 2, DROP_Y - sp.size / 2 + bob, sp.size, sp.size);
      ctx.restore();
    }

    // 공들
    for (const b of balls) {
      const p = b.plugin, sp = sprite(p.lvl), r = lvlRadius(p.lvl);
      let k = 1;
      if (p.pop) k = 1 - p.pop * 0.4 + Math.sin((1 - p.pop) * Math.PI) * 0.18;
      ctx.save();
      ctx.translate(b.position.x, b.position.y + r * p.sq * 0.8);
      ctx.scale(k * (1 + p.sq * 0.7), k * (1 - p.sq));
      ctx.rotate(b.angle);
      if (p.over > 0) ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(now / 80));
      ctx.drawImage(sp.c, -sp.size / 2, -sp.size / 2, sp.size, sp.size);
      ctx.restore();
    }

    // 파티클
    for (const p of particles) {
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      if (p.ring) {
        ctx.strokeStyle = p.c; ctx.lineWidth = 5 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (p.t / p.life) * p.grow), 0, TAU); ctx.stroke();
      } else {
        ctx.fillStyle = p.c;
        if (p.star) star(ctx, p.x, p.y, p.s * 1.4);
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;

    // 점수 텍스트
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floats) {
      const p = f.t / 900;
      ctx.globalAlpha = 1 - p * p;
      ctx.font = `${f.big ? 34 : f.hot ? 26 : 22}px Jua, sans-serif`;
      ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
      ctx.fillStyle = f.big ? '#f76707' : f.hot ? '#f59f00' : '#e85a86';
      ctx.strokeText(f.text, f.x, f.y - p * 40);
      ctx.fillText(f.text, f.x, f.y - p * 40);
    }
    ctx.globalAlpha = 1;

    // 콤보
    if (comboFx) {
      const t = comboFx.t / 900;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15) * 0.5);
      ctx.save();
      ctx.translate(W / 2, 200);
      ctx.rotate(-0.06);
      ctx.scale(pop, pop);
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = `${40 + Math.min(comboFx.n, 8) * 3}px Jua, sans-serif`;
      ctx.lineWidth = 8; ctx.strokeStyle = '#fff';
      const g = ctx.createLinearGradient(-100, 0, 100, 0);
      g.addColorStop(0, '#ff6b6b'); g.addColorStop(0.5, '#f59f00'); g.addColorStop(1, '#e64980');
      ctx.fillStyle = g;
      const txt = `${comboFx.n} COMBO!`;
      ctx.strokeText(txt, 0, 0); ctx.fillText(txt, 0, 0);
      ctx.restore();
    }

    // 번쩍
    if (flash > 0) {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (state === 'over') {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.fillStyle = 'rgba(91,58,69,.12)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- 메인 루프 ----------
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    if (state === 'play') {
      if (hitstop > 0) {
        hitstop -= dt;
      } else {
        acc += dt;
        while (acc >= STEP && state === 'play') {
          Engine.update(engine, STEP);
          gameTime += STEP;
          processPending();
          acc -= STEP;
        }
        if (state === 'play') checkDanger(dt);
      }
    } else acc = 0;
    updateFx(dt);
    updateHud();
    render(now);
    confettiTick(dt);
    requestAnimationFrame(frame);
  }

  // ---------- 오버레이 ----------
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }
  function pause() { if (state === 'play') { state = 'pause'; aiming = false; } }
  function resume() { if (state === 'pause') state = 'play'; }

  function openLetter() {
    $('letterTitle').textContent = fill(CFG.letterTitle || '💌 {이름}에게');
    $('letterBody').textContent = fill(CFG.letter || '');
    show('ovLetter');
    document.querySelector('#ovLetter .card').scrollTop = 0;
    confetti(120);
  }

  function openBook() {
    pause();
    const grid = $('bookGrid');
    grid.innerHTML = '';
    STAGES.forEach((st, i) => {
      const found = save.found.has(i);
      const item = document.createElement('div');
      item.className = 'book-item' + (found ? '' : ' locked');
      const c = document.createElement('canvas');
      c.className = 'mini'; c.dataset.size = 64;
      item.appendChild(c);
      item.insertAdjacentHTML('beforeend',
        `<div class="lv">${i + 1}단계</div><div class="nm"></div><div class="cap"></div>`);
      item.querySelector('.nm').textContent = found ? st.name : '???';
      item.querySelector('.cap').textContent = found ? fill(st.caption || '') : '합쳐서 발견해봐';
      grid.appendChild(item);
      paintMini(c, i, !found);
    });
    $('bookCount').textContent = `${save.found.size} / ${N}`;
    show('ovBook');
  }

  function buildEvo() {
    const evo = $('evo');
    evo.innerHTML = '';
    const avail = evo.clientWidth || 300;
    const size = Math.max(16, Math.min(34, Math.floor((avail - (N - 1) * 10) / N)));
    STAGES.forEach((st, i) => {
      if (i) {
        const ar = document.createElement('span');
        ar.className = 'arrow'; ar.textContent = '›';
        evo.appendChild(ar);
      }
      const c = document.createElement('canvas');
      c.className = 'mini'; c.dataset.size = size;
      evo.appendChild(c);
      paintMini(c, i, !save.found.has(i));
    });
  }

  function refreshMinis() {
    buildEvo();
    paintNext();
    paintMini($('introCv'), LAST);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.hidden = true;
    void t.offsetWidth;          // 애니메이션 재시작
    t.textContent = msg;
    t.hidden = false;
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
  function confettiTick(dt) {
    const d = window.devicePixelRatio || 1;
    if (cf.width !== innerWidth * d || cf.height !== innerHeight * d) {
      cf.width = innerWidth * d; cf.height = innerHeight * d;
    }
    cfx.setTransform(d, 0, 0, d, 0, 0);
    cfx.clearRect(0, 0, innerWidth, innerHeight);
    const k = dt / 16;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i];
      b.x += b.vx * k; b.y += b.vy * k; b.r += b.vr * k;
      b.vx += Math.sin(b.y / 40) * 0.03;
      if (b.y > innerHeight + 30) { bits.splice(i, 1); continue; }
      const sq = Math.abs(Math.cos(b.r * 2));
      cfx.save();
      cfx.translate(b.x, b.y); cfx.rotate(b.r);
      cfx.fillStyle = b.c;
      cfx.fillRect(-b.w / 2, (-b.h / 2) * sq, b.w, b.h * sq + 1);
      cfx.restore();
    }
  }

  // ---------- 소리 (파일 없이 합성) ----------
  const sfx = (() => {
    let ac = null;
    const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];   // 펜타토닉
    const tone = (freq, dur, type = 'sine', vol = 0.14, delay = 0, slide = 1) => {
      if (!save.sound || !ac) return;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol, freq) => {
      if (!save.sound || !ac) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f).connect(g).connect(ac.destination);
      src.start();
    };
    return {
      unlock() {
        if (!ac) {
          try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        }
        if (ac.state === 'suspended') ac.resume();
      },
      drop() { tone(520, 0.06, 'sine', 0.06, 0, 0.6); },
      land(v) { tone(150, 0.08, 'triangle', 0.04 + v * 0.1, 0, 0.6); },
      merge(lvl, c) {
        const idx = Math.min(SCALE.length - 1, lvl - 1 + (c - 1));
        const f = 392 * Math.pow(2, SCALE[idx] / 12);
        tone(f, 0.18, 'sine', 0.18, 0, 1.01);
        tone(f * 2, 0.1, 'triangle', 0.05, 0.015);
        noise(0.05, 0.12, 2500);
        if (c >= 3) tone(f * 3, 0.12, 'sine', 0.05, 0.06);
      },
      page() { noise(0.18, 0.18, 4000); },
      over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.14, 0.95)); },
      fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.11, 1.02)); },
    };
  })();

  // ---------- 앨범 (성공하면 편지 다음에 열림) ----------
  const album = (() => {
    const bookEl = $('albumBook');
    const list = CFG.album || [];
    const STICKERS = ['✨', '🎈', '💖', '⭐', '🎀', '🌼', '🍭', '🎵'];
    let pages = [], idx = 0, busy = false, preloaded = false;

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };

    function coverPage() {
      const p = el('div', 'page cover');
      const coverSrc = CFG.albumCover || (list.length && list[list.length - 1].src);
      if (coverSrc) {
        const im = el('img', 'cover-photo'); im.src = coverSrc; im.alt = '';
        p.appendChild(im);
      }
      p.appendChild(el('h2', null, fill(CFG.albumTitle || '{이름}의 앨범')));
      p.appendChild(el('p', null, `📸 ${list.length}장의 추억`));
      p.appendChild(el('div', 'hint2', '넘겨봐 →'));
      return p;
    }

    function photoPage(item, i) {
      const p = el('div', 'page');
      const fig = el('figure', 'polaroid');
      fig.style.setProperty('--rot', `${((i * 37) % 7) - 3}deg`);
      fig.appendChild(el('span', 'tape l'));
      fig.appendChild(el('span', 'tape r'));
      const im = el('img'); im.src = item.src; im.alt = item.caption || ''; im.draggable = false;
      fig.appendChild(im);
      fig.appendChild(el('figcaption', null, fill(item.caption || '')));
      p.appendChild(fig);
      const st = el('span', 'sticker', STICKERS[i % STICKERS.length]);
      const corner = i % 3;
      Object.assign(st.style, corner === 0 ? { left: '14px', bottom: '8px' }
        : corner === 1 ? { right: '12px', top: '10px' } : { left: '16px', top: '10px' });
      st.style.setProperty('--r', `${(i % 2 ? 1 : -1) * 15}deg`);
      p.appendChild(st);
      p.appendChild(el('span', 'pno', `${i + 1}`));
      return p;
    }

    function endPage() {
      const p = el('div', 'page end');
      p.appendChild(el('div', 'end-cake', '🎂'));
      p.appendChild(el('p', null, fill(CFG.albumEnd || '생일 축하해!')));
      const b = el('button', 'btn primary', '결과 보기');
      b.onclick = close;
      p.appendChild(b);
      return p;
    }

    function nav() {
      $('albumPage').textContent = `${idx + 1} / ${pages.length}`;
      $('albumPrev').disabled = idx === 0;
      $('albumNext').disabled = idx === pages.length - 1;
    }

    function go(d) {
      const ni = idx + d;
      if (busy || ni < 0 || ni >= pages.length) return;
      busy = true;
      const cur = pages[idx], nxt = pages[ni];
      sfx.page();
      if (d > 0) {
        bookEl.insertBefore(nxt, cur);       // 다음 장을 밑에 깔고
        cur.classList.add('turn-out');       // 윗장을 넘김
        setTimeout(() => { cur.classList.remove('turn-out'); cur.remove(); done(ni); }, 600);
      } else {
        nxt.classList.add('turn-in');        // 이전 장을 위에서 되돌려 덮음
        bookEl.appendChild(nxt);
        setTimeout(() => { nxt.classList.remove('turn-in'); cur.remove(); done(ni); }, 600);
      }
    }
    function done(ni) { idx = ni; busy = false; nav(); }

    // 스와이프 / 탭으로 넘기기
    let sx = null;
    bookEl.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    bookEl.addEventListener('pointerup', (e) => {
      if (sx == null || e.target.closest('button')) { sx = null; return; }
      const dx = e.clientX - sx; sx = null;
      if (dx < -35) go(1);
      else if (dx > 35) go(-1);
      else if (Math.abs(dx) < 8) {
        const r = bookEl.getBoundingClientRect();
        go(e.clientX > r.left + r.width * 0.4 ? 1 : -1);
      }
    });
    $('albumPrev').onclick = () => go(-1);
    $('albumNext').onclick = () => go(1);
    $('albumClose').onclick = () => close();

    function open() {
      pages = [coverPage(), ...list.map(photoPage), endPage()];
      idx = 0; busy = false;
      bookEl.innerHTML = '';
      bookEl.appendChild(pages[0]);
      nav();
      show('ovAlbum');
    }
    function close() {
      hide('ovAlbum');
      showResult(true);
    }
    function preload() {
      if (preloaded) return;
      preloaded = true;
      [CFG.albumCover, ...list.map((it) => it.src)].filter(Boolean)
        .forEach((src) => { const im = new Image(); im.src = src; });
    }
    return { open, preload, has: () => list.length > 0 };
  })();

  function vibrate(p) {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p);
    } catch (e) { /* 무시 */ }
  }

  // ---------- 버튼 ----------
  const soundBtn = $('btnSound');
  const syncSoundBtn = () => { soundBtn.textContent = save.sound ? '🔊' : '🔇'; };
  syncSoundBtn();
  soundBtn.onclick = () => { save.sound = !save.sound; save.write(); syncSoundBtn(); sfx.unlock(); };

  $('btnStart').onclick = () => { sfx.unlock(); hide('ovIntro'); newGame(); };
  $('btnRetry').onclick = () => { hide('ovOver'); newGame(); };
  $('btnOverBook').onclick = () => { openBook(); };
  $('btnBook').onclick = () => { openBook(); };
  $('btnBookClose').onclick = () => {
    hide('ovBook');
    if ($('ovOver').hidden && $('ovIntro').hidden) resume();
  };
  $('btnLetterClose').onclick = () => {
    hide('ovLetter');
    if (album.has()) album.open(); else showResult(true);
  };
  if (!album.has()) $('btnLetterClose').textContent = '결과 보기';
  $('btnRestart').onclick = () => {
    if (!confirm('지금 판을 끝내고 처음부터 할까?')) return;
    hide('ovBook'); hide('ovOver'); hide('ovIntro'); newGame();
  };

  // 앱 전환하면 일시정지 + 기록 저장
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { save.write(); if (state === 'play') openBook(); }
  });

  // ---------- 시작 ----------
  $('introTitle').textContent = fill('{이름아} 생일 축하해!');
  if (save.bestTime) {
    $('introRecord').textContent = `⚡ 최단 기록 ${fmtClear(save.bestTime)}`;
    $('introRecord').hidden = false;
  }
  document.title = fill('🎂 {이름} 생일 합치기');
  timerEl.textContent = fmtClear(0);
  window.addEventListener('resize', resize);
  resize();
  refreshMinis();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { sprites = {}; refreshMinis(); });
  requestAnimationFrame(frame);
})();
