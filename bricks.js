(() => {
  'use strict';
  const { CFG, $, fill, store, unlock, tone, noise, fanfare, vibrate, toast, confetti, bindSound } = window.BD;

  const TARGET = CFG.bricksTarget || 3;
  const ALBUM = CFG.album || [];
  const W = 360;
  const COLS = 5, GAP = 4, SIDE = 10, TOP = 110, BH = 52;  // 큰 벽돌 → 한 판이 금방 끝남
  const BW = (W - SIDE * 2 - GAP * (COLS - 1)) / COLS;
  const PADDLE_W = 96, PADDLE_H = 14, BALL_R = 8;
  const MAX_LIVES = 5;
  const COLORS = ['#ff8fab', '#ffa94d', '#ffd43b', '#8ce99a', '#66d9e8', '#74c0fc', '#b197fc', '#f783ac', '#63e6be'];

  const save = store('bdayBricks_v1', { best: 0, next: 0, revealed: [], film: false, sound: true });
  bindSound($('btnSound'), save);

  const photos = ALBUM.map((a) => { const im = new Image(); im.src = a.src; return im; });

  // ---------- 화면 ----------
  const cv = $('bcv'), ctx = cv.getContext('2d');
  let dpr = 1, vw = 0, vh = 0, S = 1, HW = 700;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    S = Math.min(vw / W, (vh * 0.95) / 640);
    HW = vh / S;
  }
  const ox = () => (vw - W * S) / 2;
  const sx = (x) => ox() + x * S;
  const sy = (y) => y * S;
  const paddleY = () => Math.min(HW - 86, 560);   // 긴 화면에서도 벽돌과 너무 멀지 않게

  // ---------- 상태 ----------
  let state = 'intro';   // intro | ready | play | pause | reveal | over
  let bricks = [], ball = null, parts = [], texts = [];
  let px = W / 2, targetX = W / 2;
  let lives = 3, stageInRun = 0, photoIdx = 0, rows = 8, speed = 300, hitsSincePaddle = 0, shake = 0;
  let newBest = false, filmShownThisRun = false;
  let lastBreak = 0, stageTime = 0;

  function newGame() {
    lives = 3; stageInRun = 0; newBest = false; filmShownThisRun = false;
    photoIdx = save.next % Math.max(1, ALBUM.length);
    drawHearts();
    startStage();
  }

  function startStage() {
    rows = stageInRun === 0 ? 4 : 5;
    speed = Math.min(500, 420 + stageInRun * 15);
    bricks = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        bricks.push({
          x: SIDE + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH,
          hp: 1, max: 1, c: COLORS[(r + c) % COLORS.length], alive: true, row: r,
        });
      }
    }
    lastBreak = 0; stageTime = 0;
    parts = []; texts = [];
    resetBall();
    updateHud();
    $('bhint').hidden = false;
    state = 'ready';
  }

  function resetBall() {
    ball = { x: px, y: paddleY() - BALL_R - 1, vx: 0, vy: 0, stuck: true };
    hitsSincePaddle = 0;
  }

  function launch() {
    if (state !== 'ready' || !ball.stuck) return;
    unlock();
    const a = (-0.25 + Math.random() * 0.5);
    ball.vx = Math.sin(a) * speed; ball.vy = -Math.cos(a) * speed;
    ball.stuck = false;
    $('bhint').hidden = true;
    state = 'play';
    tone(520, 0.08, 'triangle', 0.1);
  }

  function updateHud() {
    $('bstage').textContent = `사진 ${stageInRun + 1}`;
    const left = TARGET - stageInRun;
    const g = $('bgoal');
    if (filmShownThisRun || left <= 0) { g.textContent = '🎬 영상 받음!'; g.classList.add('done'); }
    else { g.textContent = `🎬 영상까지 ${left}장`; g.classList.remove('done'); }
  }
  function drawHearts() {
    $('hearts').textContent = '❤️'.repeat(lives) + (lives < 3 ? '🤍'.repeat(3 - lives) : '');
  }

  // ---------- 충돌 ----------
  function hitBrick(b, nx, ny) {
    b.hp--;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (b.hp <= 0) {
      b.alive = false;
      lastBreak = stageTime;
      hitsSincePaddle++;
      for (let i = 0; i < 10; i++) {
        parts.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 220, age: 0, c: b.c, s: 2 + Math.random() * 3 });
      }
      const f = 440 * Math.pow(2, ((rows - b.row) + Math.min(hitsSincePaddle, 8)) / 12);
      tone(f, 0.08, 'triangle', 0.11);
      noise(0.04, 0.12, 2500, 'highpass');
      if (hitsSincePaddle >= 3) texts.push({ x: cx, y: cy, s: `x${hitsSincePaddle}!`, age: 0 });
      shake = Math.max(shake, 2);
      vibrate(6);
    } else {
      tone(300, 0.06, 'square', 0.05);
    }
    void nx; void ny;
    if (!bricks.some((x) => x.alive)) stageClear();
  }

  // 벽돌이 몇 개 안 남았는데 한참 안 맞으면, 공이 남은 벽돌 쪽으로 살짝 휘어짐
  function assist() {
    const dt = 1 / 180;
    const left = bricks.filter((b) => b.alive);
    if (left.length > 3 || stageTime - lastBreak < 4 || ball.vy > 0) return;
    let best = null, bd = Infinity;
    for (const b of left) {
      const d = Math.abs(b.x + b.w / 2 - ball.x) + Math.abs(b.y + b.h / 2 - ball.y) * 0.3;
      if (d < bd) { bd = d; best = b; }
    }
    const dx = best.x + best.w / 2 - ball.x;
    const sp = Math.hypot(ball.vx, ball.vy);
    ball.vx += Math.sign(dx) * Math.min(Math.abs(dx) * 3, 260) * dt;
    const k = sp / Math.hypot(ball.vx, ball.vy);
    ball.vx *= k; ball.vy *= k;
  }

  function step(dt) {
    if (ball.stuck) { ball.x = px; ball.y = paddleY() - BALL_R - 1; return; }
    stageTime += dt;
    assist();
    const n = 3;
    for (let k = 0; k < n; k++) {
      const h = dt / n;
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      // 벽
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); tone(200, 0.03, 'sine', 0.05); }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); tone(200, 0.03, 'sine', 0.05); }
      if (ball.y < TOP - 30 + BALL_R) { ball.y = TOP - 30 + BALL_R; ball.vy = Math.abs(ball.vy); }
      // 판
      const py = paddleY();
      if (ball.vy > 0 && ball.y + BALL_R >= py && ball.y + BALL_R <= py + PADDLE_H + 8 && Math.abs(ball.x - px) <= PADDLE_W / 2 + BALL_R) {
        const rel = Math.max(-1, Math.min(1, (ball.x - px) / (PADDLE_W / 2)));
        const ang = rel * 1.05;                              // 최대 약 60도
        const sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(ang) * sp; ball.vy = -Math.cos(ang) * sp;
        ball.y = py - BALL_R;
        hitsSincePaddle = 0;
        tone(330, 0.06, 'triangle', 0.1);
        paddleBounce = 1;
      }
      // 벽돌
      for (const b of bricks) {
        if (!b.alive) continue;
        const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
        const dx = ball.x - cx, dy = ball.y - cy;
        if (dx * dx + dy * dy <= BALL_R * BALL_R) {
          const ovx = Math.min(ball.x + BALL_R - b.x, b.x + b.w - (ball.x - BALL_R));
          const ovy = Math.min(ball.y + BALL_R - b.y, b.y + b.h - (ball.y - BALL_R));
          if (ovx < ovy) { ball.vx = ball.x < b.x + b.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx); }
          else { ball.vy = ball.y < b.y + b.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy); }
          hitBrick(b);
          if (state !== 'play') return;
          break;
        }
      }
      // 너무 수평으로만 움직이지 않게
      if (Math.abs(ball.vy) < speed * 0.25) ball.vy = Math.sign(ball.vy || -1) * speed * 0.25;
      // 떨어짐
      if (ball.y > HW + 20) { loseLife(); return; }
    }
  }

  function loseLife() {
    lives--;
    drawHearts();
    const h = $('hearts'); h.classList.remove('hurt'); void h.offsetWidth; h.classList.add('hurt');
    tone(220, 0.3, 'triangle', 0.12, 0, 0.5);
    vibrate(60);
    shake = 8;
    if (lives <= 0) { gameOver(); return; }
    resetBall();
    state = 'ready';
    $('bhint').hidden = false;
  }

  function stageClear() {
    state = 'reveal';
    const idx = photoIdx;
    if (!save.revealed.includes(idx)) save.revealed.push(idx);
    save.next = (idx + 1) % Math.max(1, ALBUM.length);
    stageInRun++;
    if (stageInRun > save.best) { save.best = stageInRun; newBest = true; }
    save.write();
    lives = Math.min(MAX_LIVES, lives + 1);
    drawHearts();
    fanfare();
    confetti(80);
    vibrate([20, 40, 20]);
    const reachedGoal = stageInRun >= TARGET && !filmShownThisRun;
    setTimeout(() => {
      $('rvImg').src = ALBUM[idx] ? ALBUM[idx].src : '';
      $('rvCap').textContent = '📸 ' + fill((ALBUM[idx] && ALBUM[idx].caption) || '');
      $('rvCount').textContent = `사진 ${save.revealed.length} / ${ALBUM.length} 모음`;
      $('btnNext').textContent = reachedGoal ? '🎬 선물 영상 보기' : '다음 사진 ▶';
      $('btnNext').dataset.film = reachedGoal ? '1' : '';
      $('ovReveal').hidden = false;
    }, 700);
  }

  $('btnNext').onclick = () => {
    $('ovReveal').hidden = true;
    const playFilm = $('btnNext').dataset.film === '1';
    photoIdx = (photoIdx + 1) % Math.max(1, ALBUM.length);
    if (playFilm) {
      filmShownThisRun = true;
      save.film = true; save.write();
      $('btnFilmIntro').hidden = false;
      window.Film.play(() => { toast('다음 사진도 도전해봐! 🧱'); startStage(); });
    } else {
      startStage();
    }
  };

  function gameOver() {
    state = 'over';
    save.write();
    $('resTitle').textContent = stageInRun >= TARGET ? '🎬 영상 받았어!' : '😵 게임 끝!';
    $('resMain').textContent = stageInRun;
    $('resLabel').textContent = stageInRun >= TARGET ? '장 공개!' : `장 공개 · 영상까지 ${TARGET - stageInRun}장 남았어!`;
    $('resBadge').hidden = !(newBest && stageInRun > 0);
    $('resSub').textContent = `최고 기록 ${save.best}장 · 모은 사진 ${save.revealed.length}/${ALBUM.length}`;
    $('btnFilmAgain').hidden = !save.film;
    setTimeout(() => { $('ovOver').hidden = false; }, 600);
  }

  // ---------- 그리기 ----------
  let paddleBounce = 0;
  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#2b2240'); g.addColorStop(1, '#46305e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    // 벽돌 뒤 사진
    const area = { x: SIDE, y: TOP, w: W - SIDE * 2, h: rows * (BH + GAP) - GAP };
    ctx.save();
    ctx.beginPath(); ctx.rect(sx(area.x), sy(area.y), area.w * S, area.h * S); ctx.clip();
    ctx.fillStyle = '#1a1426'; ctx.fillRect(sx(area.x), sy(area.y), area.w * S, area.h * S);
    const im = photos[photoIdx];
    if (im && im.complete && im.naturalWidth) {
      const k = Math.max((area.w * S) / im.naturalWidth, (area.h * S) / im.naturalHeight);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.drawImage(im, sx(area.x) + (area.w * S - w) / 2, sy(area.y) + (area.h * S - h) * 0.3, w, h);
    }
    ctx.restore();

    // 벽돌
    const few = bricks.filter((b) => b.alive).length <= 3;
    for (const b of bricks) {
      if (!b.alive) continue;
      const x = sx(b.x), y = sy(b.y), w = b.w * S, h = b.h * S;
      if (few) {                           // 몇 개 안 남으면 반짝여서 잘 보이게
        ctx.shadowColor = '#fff'; ctx.shadowBlur = 10 + 8 * Math.sin(now / 150);
      }
      ctx.fillStyle = b.hp < b.max ? b.c + 'aa' : b.c;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, w, h, 5 * S) : ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(x + 3 * S, y + 2 * S, w - 6 * S, h * 0.28);
      ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(x, y + h * 0.8, w, h * 0.2);
      if (b.max > 1) {
        ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2 * S;
        ctx.strokeRect(x + 2 * S, y + 2 * S, w - 4 * S, h - 4 * S);
        if (b.hp < b.max) {
          ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5 * S;
          ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.5, y + h * 0.6); ctx.lineTo(x + w * 0.7, y + h); ctx.stroke();
        }
      }
    }

    // 판
    const py = paddleY();
    const pb = paddleBounce;
    const pw = PADDLE_W * S * (1 + pb * 0.08), ph = PADDLE_H * S * (1 - pb * 0.2);
    ctx.fillStyle = '#ff7aa2';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(sx(px) - pw / 2, sy(py), pw, ph, ph / 2) : ctx.rect(sx(px) - pw / 2, sy(py), pw, ph);
    ctx.fill();
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(sx(px) - 5 * S, sy(py), 10 * S, ph);

    // 공
    const bx = sx(ball.x), by = sy(ball.y), br = BALL_R * S;
    const bg = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 1, bx, by, br);
    bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#ffd6e0');
    ctx.fillStyle = bg;
    ctx.shadowColor = 'rgba(255,200,220,.8)'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    for (const p of parts) {
      ctx.globalAlpha = 1 - p.age / 0.6;
      ctx.fillStyle = p.c;
      ctx.fillRect(sx(p.x), sy(p.y), p.s * S, p.s * S);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of texts) {
      ctx.globalAlpha = 1 - t.age / 0.8;
      ctx.font = `${22 * S}px Jua, sans-serif`;
      ctx.lineWidth = 4 * S; ctx.strokeStyle = '#2b2240'; ctx.fillStyle = '#ffd43b';
      const y = sy(t.y) - t.age * 50 * S;
      ctx.strokeText(t.s, sx(t.x), y); ctx.fillText(t.s, sx(t.x), y);
    }
    ctx.globalAlpha = 1;
    void now;
  }

  // ---------- 루프 ----------
  let last = performance.now();
  const keys = { l: false, r: false };
  function frame(now) {
    const dt = Math.min(40, now - last) / 1000;
    last = now;
    if (state === 'play' || state === 'ready') {
      if (keys.l) targetX -= 420 * dt;
      if (keys.r) targetX += 420 * dt;
      targetX = Math.max(PADDLE_W / 2, Math.min(W - PADDLE_W / 2, targetX));
      px += (targetX - px) * (1 - Math.pow(0.00001, dt));
      if (state === 'play') step(dt); else if (ball) { ball.x = px; ball.y = paddleY() - BALL_R - 1; }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
      if (p.age > 0.6) parts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].age += dt; if (texts[i].age > 0.8) texts.splice(i, 1); }
    shake = shake > 0.3 ? shake * Math.pow(0.02, dt) : 0;
    paddleBounce = Math.max(0, paddleBounce - dt * 6);
    if (ball) render(now);
    requestAnimationFrame(frame);
  }

  // ---------- 입력 ----------
  const toWorld = (clientX) => (clientX - ox()) / S;
  let downX = 0, moved = false;
  cv.addEventListener('pointerdown', (e) => {
    unlock();
    downX = e.clientX; moved = false;
    if (state === 'play' || state === 'ready') targetX = toWorld(e.clientX);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (state !== 'play' && state !== 'ready') return;
    if (Math.abs(e.clientX - downX) > 6) moved = true;
    targetX = toWorld(e.clientX);
  });
  cv.addEventListener('pointerup', () => { if (state === 'ready' && !moved) launch(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = true;
    if (e.code === 'Space') { e.preventDefault(); launch(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false;
  });

  // ---------- 버튼 ----------
  let pausedFrom = 'play';
  function pause() {
    if (state !== 'play' && state !== 'ready') return;
    pausedFrom = state; state = 'pause'; $('ovPause').hidden = false;
  }
  $('btnPause').onclick = pause;
  $('btnResume').onclick = () => { $('ovPause').hidden = true; state = pausedFrom; last = performance.now(); };
  $('btnQuit').onclick = () => { $('ovPause').hidden = true; newGame(); };
  $('btnStart').onclick = () => { unlock(); $('ovIntro').hidden = true; newGame(); };
  $('btnRetry').onclick = () => { $('ovOver').hidden = true; newGame(); };
  const replayFilm = (after) => { unlock(); window.Film.play(after); };
  $('btnFilmIntro').onclick = () => replayFilm(() => {});
  $('btnFilmAgain').onclick = () => { $('ovOver').hidden = true; replayFilm(() => { $('ovOver').hidden = false; }); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__bricks = {
      state: () => state, stage: () => stageInRun,
      track: (off) => { targetX = ball.x + (off || 0); },
      left: () => bricks.filter((b) => b.alive).length,
      launch,
      clearAll: () => { bricks.forEach((b) => { b.alive = false; }); stageClear(); },
      film: () => window.Film.play(() => {}),
    };
  }

  // ---------- 시작 ----------
  $('goalN').textContent = TARGET;
  if (save.best) { $('introRecord').textContent = `🏆 최고 ${save.best}장 · 모은 사진 ${save.revealed.length}/${ALBUM.length}`; $('introRecord').hidden = false; }
  $('btnFilmIntro').hidden = !save.film;
  $('bhint').hidden = true;
  window.addEventListener('resize', resize);
  resize();
  rows = 4; bricks = []; resetBall();
  requestAnimationFrame(frame);
})();
