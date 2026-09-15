(() => {
  'use strict';
  const { CFG, $, name, callName, store, unlock, tone, noise, fanfare, vibrate, toast, confetti, bindSound, today } = window.BD;

  const TARGET = CFG.catchTarget || 50;
  const W = 360;
  const LIVES = 3;
  const KINDS = {
    gift: { e: '🎁', pts: 1 }, cake: { e: '🍰', pts: 1 }, balloon: { e: '🎈', pts: 1 },
    candy: { e: '🍭', pts: 1 }, cup: { e: '🧁', pts: 1 },
    star: { e: '⭐', pts: 3 }, broc: { e: '🥦', pts: 0 },
  };
  const GOOD = ['gift', 'cake', 'balloon', 'candy', 'cup'];
  const spawnGap = (t, s) => Math.max(250, 760 - t * 5 - s * 5);           // ms
  const fallSpeed = (t, s) => Math.min(540, 160 + s * 3.2 + t * 2.2);      // 월드/초
  const brocP = (s) => Math.min(0.33, 0.12 + s * 0.0045);

  const save = store('bdayCatch_v1', { best: 0, coupon: null, sound: true });
  bindSound($('btnSound'), save);

  const face = new Image();
  face.src = CFG.catchFace || 'photos/face/18.jpg';

  // ---------- 화면 ----------
  const cv = $('ccv'), ctx = cv.getContext('2d');
  let dpr = 1, vw = 0, vh = 0, S = 1, HW = 700;
  const sprites = {};
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    S = Math.min(vw / W, 1.7);
    HW = vh / S;
    for (const k in sprites) delete sprites[k];
  }
  const ox = () => (vw - W * S) / 2;
  const sx = (x) => ox() + x * S;
  const sy = (y) => y * S;
  const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  function sprite(kind, r) {
    const key = kind + r;
    if (sprites[key]) return sprites[key];
    const px = Math.ceil(r * 2.4 * S * dpr);
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d');
    g.font = `${px * 0.78}px ${EMOJI}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (kind === 'star') { g.shadowColor = 'rgba(255,212,59,.9)'; g.shadowBlur = px * 0.18; }
    g.fillText(KINDS[kind].e, px / 2, px / 2 + px * 0.04);
    return (sprites[key] = c);
  }

  // ---------- 상태 ----------
  let state = 'intro';
  let items = [], texts = [], puffs = [];
  let score = 0, lives = LIVES, t = 0, nextSpawn = 0, newBest = false, reached = false;
  let px = W / 2, targetX = W / 2, hurtT = 0, flashT = 0, shake = 0, bounce = 0;
  const BASKET_W = 86;
  const playerY = () => HW - 64;       // 상자 윗면 높이

  function newGame() {
    items = []; texts = []; puffs = [];
    score = 0; lives = LIVES; t = 0; nextSpawn = 0.6; newBest = false; reached = false;
    px = targetX = W / 2; hurtT = 0; flashT = 0; shake = 0;
    setScore(0); drawHearts();
    $('cgoal').classList.remove('done');
    $('cgoal').textContent = `목표 ${TARGET}점 🎟️`;
    $('chint').hidden = false;
    state = 'play';
  }

  function setScore(n) {
    const el = $('cscore');
    el.textContent = n;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function drawHearts() {
    $('hearts').textContent = '❤️'.repeat(lives) + '🤍'.repeat(LIVES - lives);
  }

  function spawn() {
    const r = Math.random();
    const kind = r < brocP(score) ? 'broc' : r < brocP(score) + 0.05 ? 'star' : GOOD[(Math.random() * GOOD.length) | 0];
    const rad = kind === 'star' ? 19 : 20;
    items.push({
      kind, r: rad,
      x: rad + Math.random() * (W - rad * 2), y: -rad,
      vy: fallSpeed(t, score) * (0.85 + Math.random() * 0.3),
      vx: (Math.random() - 0.5) * 30,
      rot: (Math.random() - 0.5) * 0.6, vr: (Math.random() - 0.5) * 2,
    });
  }

  function caught(it) {
    if (it.kind === 'broc') {
      lives--;
      drawHearts();
      const h = $('hearts'); h.classList.remove('hurt'); void h.offsetWidth; h.classList.add('hurt');
      hurtT = 0.8; flashT = 0.35; shake = 12;
      texts.push({ x: it.x, y: playerY() - 40, s: '으악! 🥦', c: '#2f9e44', age: 0 });
      tone(180, 0.35, 'square', 0.09, 0, 0.6); noise(0.2, 0.3, 500);
      vibrate([60, 40, 60]);
      if (lives <= 0) end();
      return;
    }
    const pts = KINDS[it.kind].pts;
    score += pts;
    setScore(score);
    bounce = 1;
    texts.push({ x: it.x, y: playerY() - 30, s: '+' + pts, c: it.kind === 'star' ? '#f59f00' : '#e85a86', age: 0, big: it.kind === 'star' });
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      puffs.push({ x: it.x, y: playerY(), vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 60, age: 0, c: ['#ff7aa2', '#ffd43b', '#74c0fc', '#8ce99a'][i % 4] });
    }
    if (it.kind === 'star') { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, i * 0.05)); vibrate(30); }
    else { tone(760 + (score % 5) * 70, 0.08, 'triangle', 0.12); vibrate(8); }
    if (!reached && score >= TARGET) {
      reached = true;
      $('cgoal').classList.add('done');
      $('cgoal').textContent = '🎟️ 선물 확정! 계속 받아봐';
      toast('🎉 목표 달성! 깜짝 선물 확정!');
      fanfare();
    }
  }

  function end() {
    state = 'ending';
    if (score > save.best) { save.best = score; newBest = true; }
    const won = score >= TARGET;
    if (won && !save.coupon) {
      const d = today();
      save.coupon = { no: `${String(d.m).padStart(2, '0')}${String(d.d).padStart(2, '0')}-01`, y: d.y, m: d.m, d: d.d, used: null };
    }
    save.write();
    tone(392, 0.2, 'triangle', 0.12); tone(330, 0.2, 'triangle', 0.12, 0.15); tone(262, 0.35, 'triangle', 0.12, 0.3);
    setTimeout(() => {
      state = 'over';
      if (won) show.start(true); else showResult(false);
    }, 1000);
  }

  function showResult(won) {
    $('resTitle').textContent = won ? '🎉 성공!' : '😵 아쉽다!';
    $('resMain').textContent = score;
    $('resLabel').textContent = won ? `점! (목표 ${TARGET}점)` : `점 · 선물까지 ${TARGET - score}점 남았어!`;
    $('resBadge').hidden = !(newBest && score > 0);
    $('resSub').textContent = `최고 기록 ${save.best}점`;
    $('btnCouponAgain').hidden = !save.coupon;
    openOv('ovOver');
    if (newBest && score > 0) confetti(50);
  }

  // ---------- 그리기 ----------
  function drawBg(now) {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#8ecbff'); g.addColorStop(0.7, '#dff0ff'); g.addColorStop(1, '#fff4e6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // 구름
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 5; i++) {
      const x = ((now / 60 * (0.3 + i * 0.1) + i * 230) % (vw + 200)) - 100;
      const y = 80 + i * 70;
      ctx.beginPath();
      ctx.ellipse(x, y, 50, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 30, y - 10, 30, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 28, y - 4, 26, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 잔디
    const gy = sy(HW - 28);
    ctx.fillStyle = '#8ce99a'; ctx.fillRect(0, gy, vw, vh - gy);
    ctx.fillStyle = '#69db7c'; ctx.fillRect(0, gy, vw, 6);
  }

  function drawPlayer() {
    const x = sx(px), top = sy(playerY());
    const bw = BASKET_W * S, bh = 34 * S;
    const b = bounce;
    ctx.save();
    ctx.translate(x, top + bh);
    ctx.scale(1 + b * 0.08, 1 - b * 0.1);
    ctx.translate(-x, -(top + bh));
    // 머리
    const hr = 26 * S, hx = x, hy = top - hr * 0.55;
    ctx.save();
    if (hurtT > 0) ctx.translate(Math.sin(performance.now() / 30) * 3 * S, 0);
    ctx.beginPath(); ctx.arc(hx, hy, hr + 3 * S, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, Math.PI * 2); ctx.clip();
    if (face.complete && face.naturalWidth) ctx.drawImage(face, hx - hr, hy - hr, hr * 2, hr * 2);
    else { ctx.fillStyle = '#ffe0c7'; ctx.fill(); }
    if (hurtT > 0) { ctx.fillStyle = 'rgba(80,200,90,.35)'; ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); }
    ctx.restore();
    if (hurtT > 0) {
      ctx.font = `${20 * S}px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('💫', hx, hy - hr - 6 * S);
    }
    ctx.restore();
    // 팔
    ctx.strokeStyle = '#ffcfa8'; ctx.lineWidth = 7 * S; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 14 * S, top + 4 * S); ctx.lineTo(x - bw / 2 + 4 * S, top + 8 * S);
    ctx.moveTo(x + 14 * S, top + 4 * S); ctx.lineTo(x + bw / 2 - 4 * S, top + 8 * S);
    ctx.stroke();
    // 선물 상자 (바구니)
    ctx.fillStyle = '#ff7aa2';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - bw / 2, top, bw, bh, 8 * S) : ctx.rect(x - bw / 2, top, bw, bh); ctx.fill();
    ctx.fillStyle = '#e85a86'; ctx.fillRect(x - bw / 2, top, bw, 7 * S);
    ctx.fillStyle = '#ffd43b'; ctx.fillRect(x - 6 * S, top, 12 * S, bh);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x - bw / 2 + 6 * S, top + 10 * S, 8 * S, bh - 16 * S);
    ctx.restore();
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.ellipse(x, sy(HW - 26), bw * 0.45, 5 * S, 0, 0, Math.PI * 2); ctx.fill();
  }

  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    drawBg(now);
    for (const it of items) {
      const sp = sprite(it.kind, it.r), s = it.r * 2.4 * S;
      ctx.save();
      ctx.translate(sx(it.x), sy(it.y)); ctx.rotate(it.rot);
      ctx.drawImage(sp, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    if (state !== 'intro') drawPlayer();
    for (const p of puffs) {
      ctx.globalAlpha = 1 - p.age / 0.5;
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 4 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const tx of texts) {
      const p = tx.age / 0.8;
      ctx.globalAlpha = 1 - p * p;
      ctx.font = `${(tx.big ? 30 : 24) * S}px Jua, sans-serif`;
      ctx.lineWidth = 5 * S; ctx.strokeStyle = '#fff'; ctx.fillStyle = tx.c;
      const y = sy(tx.y) - p * 40 * S;
      ctx.strokeText(tx.s, sx(tx.x), y); ctx.fillText(tx.s, sx(tx.x), y);
    }
    ctx.globalAlpha = 1;
    if (flashT > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255,60,60,${flashT})`;
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  // ---------- 루프 ----------
  let last = performance.now();
  const keys = { l: false, r: false };
  function frame(now) {
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    if (state === 'play' || state === 'ending') {
      if (state === 'play') {
        t += dt;
        nextSpawn -= dt;
        if (nextSpawn <= 0) { spawn(); nextSpawn = spawnGap(t, score) / 1000; }
        if (keys.l) targetX -= 460 * dt;
        if (keys.r) targetX += 460 * dt;
      }
      targetX = Math.max(BASKET_W / 2, Math.min(W - BASKET_W / 2, targetX));
      px += (targetX - px) * (1 - Math.pow(0.00001, dt));
      const top = playerY();
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const prevY = it.y;
        it.y += it.vy * dt; it.x += it.vx * dt; it.rot += it.vr * dt;
        if (it.x < it.r || it.x > W - it.r) it.vx *= -1;
        if (state === 'play' && prevY < top && it.y >= top && Math.abs(it.x - px) < BASKET_W / 2 + it.r * 0.4) {
          items.splice(i, 1);
          caught(it);
          continue;
        }
        if (it.y > HW + 40) items.splice(i, 1);
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].age += dt; if (texts[i].age > 0.8) texts.splice(i, 1); }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt;
      if (p.age > 0.5) puffs.splice(i, 1);
    }
    hurtT = Math.max(0, hurtT - dt);
    flashT = Math.max(0, flashT - dt);
    shake = shake > 0.3 ? shake * Math.pow(0.02, dt) : 0;
    bounce = Math.max(0, bounce - dt * 6);
    render(now);
    show.tick(dt, now);
    requestAnimationFrame(frame);
  }

  // ---------- 입력 ----------
  const toWorld = (clientX) => (clientX - ox()) / S;
  cv.addEventListener('pointerdown', (e) => {
    unlock();
    if (state === 'play') { targetX = toWorld(e.clientX); $('chint').hidden = true; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (state !== 'play') return;
    targetX = toWorld(e.clientX);     // 손가락이든 마우스든 따라감
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.l = true; $('chint').hidden = true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.r = true; $('chint').hidden = true; }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false;
  });

  // ================= 🎆 불꽃놀이 + 🎟️ 쿠폰 =================
  const show = (() => {
    const ov = $('ovShow'), fw = $('fw'), g = fw.getContext('2d');
    let on = false, T = 0, parts = [], rockets = [], nextRocket = 0, textDone = false, couponShown = false, fromGame = false;
    let fdpr = 1;
    const COLORS = ['#ff6b6b', '#ffd43b', '#74c0fc', '#b197fc', '#63e6be', '#ff8fab', '#ffffff', '#ffa94d'];

    function sizeFw() {
      fdpr = Math.min(window.devicePixelRatio || 1, 2);
      fw.width = Math.round(innerWidth * fdpr); fw.height = Math.round(innerHeight * fdpr);
      g.setTransform(fdpr, 0, 0, fdpr, 0, 0);
      g.fillStyle = '#05061a'; g.fillRect(0, 0, innerWidth, innerHeight);
    }

    function launch(x, targetY, color) {
      rockets.push({ x, y: innerHeight + 10, ty: targetY, vy: -Math.sqrt(2 * 520 * (innerHeight - targetY)), c: color || COLORS[(Math.random() * COLORS.length) | 0] });
      noise(0.5, 0.12, 400, 'bandpass', 0, 2400);
    }
    function burst(x, y, c, n = 90, power = 1) {
      const c2 = COLORS[(Math.random() * COLORS.length) | 0];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
        const sp = (120 + Math.random() * 180) * power;
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2 + Math.random() * 0.8, age: 0, c: Math.random() < 0.7 ? c : c2, size: 2 + Math.random() * 1.6 });
      }
      noise(0.6, 0.45, 180); noise(0.3, 0.15, 3000, 'highpass', 0.15);
      vibrate(15);
    }

    // 글자 모양으로 모이는 불꽃
    function textFireworks(lines) {
      const c = document.createElement('canvas');
      const w = Math.min(innerWidth, 520), fs = Math.min(w * 0.17, 84);
      c.width = w; c.height = fs * 1.25 * lines.length;
      const cg = c.getContext('2d');
      cg.fillStyle = '#fff';
      cg.font = `${fs}px 'Black Han Sans', Jua, sans-serif`;
      cg.textAlign = 'center'; cg.textBaseline = 'top';
      lines.forEach((ln, i) => cg.fillText(ln, w / 2, i * fs * 1.2));
      const data = cg.getImageData(0, 0, c.width, c.height).data;
      const step = Math.max(3, Math.round(fs / 17));
      const TEXT_COLORS = ['#ffffff', '#fff3bf', '#ffe066', '#ffd8a8', '#fcc2d7'];
      const ox = (innerWidth - c.width) / 2, oy = innerHeight * 0.28 - c.height / 2;
      const cx = innerWidth / 2, cy = innerHeight * 0.6;
      for (let y = 0; y < c.height; y += step) {
        for (let x = 0; x < c.width; x += step) {
          if (data[(y * c.width + x) * 4 + 3] > 128) {
            parts.push({
              x: cx, y: cy, tx: ox + x, ty: oy + y, sx: cx, sy: cy,
              text: true, age: -Math.random() * 0.25, life: 5.2,
              c: TEXT_COLORS[(x * 7 + y * 3) % TEXT_COLORS.length], size: 1.6,
            });
          }
        }
      }
      noise(0.9, 0.6, 150); noise(0.5, 0.2, 3500, 'highpass', 0.2);
      vibrate([30, 40, 30]);
    }

    function start(game) {
      fromGame = game;
      on = true; T = 0; parts = []; rockets = []; nextRocket = 0.4; textDone = false; couponShown = false;
      ov.hidden = false;
      $('couponWrap').hidden = true;
      $('btnSkip').hidden = false;
      $('showMsg').style.opacity = 1;
      $('showMsg').textContent = game ? `🎉 ${score}점 달성!` : '';
      sizeFw();
      if (!game) showCoupon();
    }

    function showCoupon() {
      if (couponShown) return;
      couponShown = true;
      $('btnSkip').hidden = true;
      $('showMsg').style.opacity = 0;
      const cp = save.coupon;
      $('cpTitle').textContent = CFG.couponTitle || '떡볶이 사주기';
      $('cpSub').textContent = `${name} 전용 · 1회 사용`;
      $('cpFrom').textContent = CFG.fromName || '준우';
      $('cpDate').textContent = cp ? `${cp.y}.${String(cp.m).padStart(2, '0')}.${String(cp.d).padStart(2, '0')}` : '';
      $('cpNo').textContent = cp ? `No.${cp.no}` : '';
      $('cpUsed').hidden = !(cp && cp.used);
      $('btnCouponUse').hidden = !!(cp && cp.used);
      $('cpNote').textContent = cp && cp.used ? `${cp.used}에 사용했어! 떡볶이 맛있었지? 🌶️` : (CFG.couponNote || '');
      $('btnCouponDone').textContent = fromGame ? '쿠폰 받기 🎟️' : '닫기';
      $('couponWrap').hidden = false;
      if (fromGame) { fanfare(); confetti(120); }
    }

    function tick(dt, now) {
      if (!on) return;
      T += dt;
      // 잔상 남기며 지우기
      g.fillStyle = 'rgba(5,6,26,0.22)';
      g.fillRect(0, 0, innerWidth, innerHeight);

      if (fromGame) {
        if (T < 6.5 || couponShown) {
          nextRocket -= dt;
          if (nextRocket <= 0) {
            launch(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.15 + Math.random() * 0.3));
            nextRocket = couponShown ? 1.2 + Math.random() : 0.3 + Math.random() * 0.35;
          }
        }
        if (!textDone && T >= 6.8) {
          textDone = true;
          $('showMsg').style.opacity = 0;
          textFireworks([callName, '생일 축하해!']);
        }
        if (!couponShown && T >= 12) showCoupon();
      } else {
        nextRocket -= dt;
        if (nextRocket <= 0) { launch(innerWidth * (0.15 + Math.random() * 0.7), innerHeight * (0.1 + Math.random() * 0.25)); nextRocket = 1.1 + Math.random(); }
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += 520 * dt; r.y += r.vy * dt;
        g.fillStyle = '#fff3bf';
        g.beginPath(); g.arc(r.x, r.y, 2.4, 0, Math.PI * 2); g.fill();
        if (r.vy >= 0 || r.y <= r.ty) { rockets.splice(i, 1); burst(r.x, r.y, r.c); }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age < 0) continue;
        if (p.text) {
          const k = Math.min(1, p.age / 1.1);
          const e = 1 - Math.pow(1 - k, 3);
          if (p.age < 4) {
            p.x = p.sx + (p.tx - p.sx) * e;
            p.y = p.sy + (p.ty - p.sy) * e;
          } else {
            p.vy = (p.vy || 0) + 160 * dt;
            p.y += p.vy * dt;
          }
          const tw = p.age > 1.1 && p.age < 4 ? 0.6 + 0.4 * Math.sin(now / 90 + p.tx) : 1;
          g.globalAlpha = Math.max(0, Math.min(1, (p.life - p.age) / 1.2)) * tw;
        } else {
          p.vx *= Math.pow(0.35, dt); p.vy *= Math.pow(0.35, dt);
          p.vy += 90 * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
          g.globalAlpha = Math.max(0, 1 - p.age / p.life);
        }
        if (p.age > p.life) { parts.splice(i, 1); continue; }
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    function close() {
      on = false;
      ov.hidden = true;
      if (fromGame) showResult(true);
      else if (state === 'over') openOv('ovOver');
    }

    $('btnSkip').onclick = () => { if (!textDone) { textDone = true; textFireworks([callName, '생일 축하해!']); } showCoupon(); };
    $('btnCouponDone').onclick = close;
    $('btnCouponUse').onclick = () => {
      const cp = save.coupon;
      if (!cp || cp.used) return;
      if (!confirm(`${CFG.fromName || '준우'}가 떡볶이 사줬어? 사용 완료로 바꿀까?`)) return;
      const d = today();
      cp.used = `${d.y}.${String(d.m).padStart(2, '0')}.${String(d.d).padStart(2, '0')}`;
      save.write();
      $('cpUsed').hidden = false;
      $('btnCouponUse').hidden = true;
      $('cpNote').textContent = '떡볶이 맛있게 먹어! 🌶️';
      noise(0.12, 0.5, 300); tone(90, 0.2, 'sine', 0.3);
    };
    window.addEventListener('resize', () => { if (on) sizeFw(); });
    return { start, tick };
  })();

  // ---------- 오버레이 ----------
  function openOv(id) { $(id).hidden = false; }
  function closeOv(id) { $(id).hidden = true; }
  function pause() { if (state === 'play') { state = 'pause'; openOv('ovPause'); } }
  $('btnPause').onclick = pause;
  $('btnResume').onclick = () => { closeOv('ovPause'); state = 'play'; };
  $('btnQuit').onclick = () => { closeOv('ovPause'); newGame(); };
  $('btnStart').onclick = () => { unlock(); closeOv('ovIntro'); newGame(); };
  $('btnRetry').onclick = () => { closeOv('ovOver'); newGame(); };
  $('btnCouponAgain').onclick = () => { closeOv('ovOver'); show.start(false); };
  $('btnCouponIntro').onclick = () => { unlock(); show.start(false); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__catch = {
      state: () => state, score: () => score, lives: () => lives,
      next: () => items.filter((i) => i.kind !== 'broc').sort((a, b) => b.y - a.y)[0],
      items: () => items.map((i) => ({ k: i.kind, x: i.x, y: i.y, vy: i.vy })),
      py: () => playerY(), px: () => px,
      setTarget: (x) => { targetX = x; }, win: () => { score = TARGET; end(); },
    };
  }

  // ---------- 시작 ----------
  $('goalN').textContent = TARGET;
  $('cgoal').textContent = `목표 ${TARGET}점 🎟️`;
  if (save.best) { $('introRecord').textContent = `🏆 최고 기록 ${save.best}점`; $('introRecord').hidden = false; }
  $('btnCouponIntro').hidden = !save.coupon;
  $('chint').hidden = true;
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
