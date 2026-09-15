(() => {
  'use strict';
  const { CFG, $, name, fill, store, unlock, tone, noise, fanfare, vibrate, toast, confetti, bindSound, today } = window.BD;

  const TARGET = CFG.stackTarget || 20;
  const W = 360;               // 월드 가로 (화면 폭에 맞춰 확대)
  const LH = 30;               // 케이크 한 층 높이
  const BASE_W = 220;
  const PERFECT = 5;           // 이 정도 차이면 딱 맞은 걸로
  const speedAt = (n) => Math.min(430, 150 + n * 9);
  const FACES = CFG.moleFaces && CFG.moleFaces.length ? CFG.moleFaces : ['photos/stage9.jpg'];
  const FLAVORS = [
    { body: '#f8bfd3', cream: '#fff0f5', drip: '#ff8fb1' },   // 딸기
    { body: '#f3dcae', cream: '#fffaf0', drip: '#f7c873' },   // 바닐라
    { body: '#8d5b4c', cream: '#f6e2d3', drip: '#5e3a2e' },   // 초코
    { body: '#b7dca3', cream: '#f4fff0', drip: '#86c46b' },   // 녹차
    { body: '#bcc3ff', cream: '#f4f2ff', drip: '#8e98ff' },   // 블루베리
    { body: '#ffd0a1', cream: '#fff5ea', drip: '#ffab5c' },   // 오렌지
  ];

  const save = store('bdayStack_v1', { best: 0, cert: null, sound: true });
  bindSound($('btnSound'), save);

  // 얼굴 이미지
  const faces = FACES.map((src) => { const im = new Image(); im.src = src; return im; });

  // ---------- 화면 ----------
  const cv = $('scv'), ctx = cv.getContext('2d');
  let dpr = 1, vw = 0, vh = 0, S = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    S = Math.min(vw / W, 1.9);
  }
  const ox = () => (vw - W * S) / 2;     // 가로 가운데 정렬
  const baseY = () => vh * 0.82;          // 첫 층 바닥 (화면 좌표)

  // ---------- 상태 ----------
  let state = 'intro';   // intro | play | pause | falling | over
  let layers = [];       // {x, w, f(맛), face}
  let mover = null;      // {x, w, dir}
  let debris = [];       // 잘려서 떨어지는 조각
  let rings = [];
  let camY = 0, streak = 0, newBest = false, reachedAt = 0;
  let fallT = 0;

  const height = () => layers.length - 1;

  function newGame() {
    layers = [{ x: (W - BASE_W) / 2, w: BASE_W, f: 0, face: 0 }];
    debris = []; rings = [];
    camY = 0; streak = 0; newBest = false; reachedAt = 0;
    spawnMover();
    setScore(0);
    $('sgoal').classList.remove('done');
    $('shint').hidden = false;
    state = 'play';
  }

  function spawnMover() {
    const top = layers[layers.length - 1];
    const fromLeft = layers.length % 2 === 1;
    mover = { x: fromLeft ? -top.w * 0.2 : W - top.w * 0.8, w: top.w, dir: fromLeft ? 1 : -1 };
  }

  function setScore(n) {
    const el = $('sscore');
    el.textContent = n;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  function place() {
    if (state !== 'play') return;
    unlock();
    $('shint').hidden = true;
    const top = layers[layers.length - 1];
    const m = mover;
    const left = Math.max(m.x, top.x), right = Math.min(m.x + m.w, top.x + top.w);
    const overlap = right - left;
    const n = layers.length;
    const f = n % FLAVORS.length, face = n % faces.length;

    if (overlap <= 0) {                                  // 완전히 빗나감
      debris.push({ x: m.x, w: m.w, y: n * LH, vy: 0, vx: m.dir * 60, rot: 0, vr: m.dir * 2, f, face });
      mover = null;
      gameOver();
      return;
    }
    if (Math.abs(m.x - top.x) <= PERFECT) {              // PERFECT
      streak++;
      let w = top.w, x = top.x;
      if (streak >= 3 && w < BASE_W) { const g = Math.min(8, BASE_W - w); w += g; x -= g / 2; }
      layers.push({ x, w, f, face });
      rings.push({ x: x + w / 2, y: n * LH + LH / 2, w, t: 0 });
      floatText('PERFECT!' + (streak >= 2 ? ` x${streak}` : ''), x + w / 2, n * LH, true);
      tone(660 * Math.pow(2, Math.min(streak, 12) / 12), 0.15, 'triangle', 0.14);
      tone(1320 * Math.pow(2, Math.min(streak, 12) / 12), 0.12, 'sine', 0.05, 0.04);
      vibrate(20);
    } else {                                               // 잘림
      streak = 0;
      layers.push({ x: left, w: overlap, f, face });
      const cutX = m.x < top.x ? m.x : right;
      const cutW = m.w - overlap;
      debris.push({ x: cutX, w: cutW, y: n * LH, vy: 0, vx: (m.x < top.x ? -1 : 1) * 40, rot: 0, vr: (m.x < top.x ? -1 : 1) * 1.5, f, face: -1 });
      tone(330, 0.1, 'triangle', 0.12);
      noise(0.08, 0.2, 1200);
      vibrate(10);
    }
    const h = height();
    setScore(h);
    if (h === TARGET) {
      reachedAt = h;
      $('sgoal').classList.add('done');
      $('sgoal').textContent = '🎖️ 상장 확정! 계속 쌓아봐';
      toast('🎖️ 목표 달성! 상장 받을 자격 획득!');
      fanfare();
      confetti(60);
    } else if (h > 0 && h % 10 === 0) {
      toast(`🎂 ${h}층 돌파!`);
    }
    spawnMover();
  }

  function gameOver() {
    state = 'falling';
    fallT = 0;
    streak = 0;
    tone(300, 0.5, 'triangle', 0.14, 0, 0.4);
    vibrate(80);
    const h = height();
    if (h > save.best) { save.best = h; newBest = true; }
    if (h >= TARGET && (!save.cert || h > save.cert.h)) {
      const t = today();
      save.cert = { h, y: t.y, m: t.m, d: t.d };
    }
    save.write();
  }

  function afterFall() {
    state = 'over';
    const h = height();
    if (h >= TARGET) showCert({ h, ...today() }, true); else showResult();
  }

  function showResult() {
    const h = height();
    $('resTitle').textContent = h >= TARGET ? '🎖️ 상장 획득!' : '💥 와르르!';
    $('resMain').textContent = h;
    $('resLabel').textContent = h >= TARGET ? '층 쌓았어!' : `층 · 상장까지 ${TARGET - h}층 남았어!`;
    $('resBadge').hidden = !(newBest && h > 0);
    $('resSub').textContent = `최고 기록 ${save.best}층`;
    $('btnCertAgain').hidden = !save.cert;
    show('ovOver');
    if (newBest && h > 0) confetti(50);
  }

  // ---------- 🎖️ 상장 ----------
  // r = { h: 층수, y, m, d }
  let certFromGame = false;
  function showCert(r, fromGame) {
    certFromGame = fromGame;
    $('certNo').textContent = `제 ${r.y}-${String(r.m).padStart(2, '0')}${String(r.d).padStart(2, '0')}-${r.h} 호`;
    $('certAward').textContent = CFG.certAward || '최고의 파티시에상';
    $('certPhoto').src = CFG.jumpFace || 'photos/stage9.jpg';
    $('certName').textContent = name.split('').join(' ');
    $('certRecord').textContent = `케이크 ${r.h}층`;
    const age = CFG.friendAge ? `${CFG.friendAge}번째 생일` : '생일';
    $('certBody').textContent =
      `위 사람은 ${fill('{이름}')} 생일 기념 케이크 쌓기 대회에서 무려 ${r.h}층의 케이크를 흔들림 없이 쌓아 올리는 `
      + '놀라운 기록을 세웠습니다. 뛰어난 집중력과 섬세한 손끝으로 모두를 감탄하게 하였기에 '
      + `이 상장을 수여하며, ${age}을 진심으로 축하합니다.`;
    $('certDate').textContent = `${r.y}년 ${r.m}월 ${r.d}일`;
    $('certIssuer').textContent = CFG.certIssuer || '생일 축하 위원회';
    const from = CFG.fromName || '준우';
    $('certFrom').textContent = from.split('').join(' ');
    $('certSeal').textContent = `${from}之印`;
    const seal = $('certSeal');
    seal.classList.remove('on');
    const ov = $('ovCert');
    ov.hidden = false;
    // 카드 애니메이션 다시
    const cert = $('cert');
    cert.style.animation = 'none'; void cert.offsetWidth; cert.style.animation = '';
    if (fromGame) { confetti(160); fanfare(); }
    setTimeout(() => {
      seal.classList.add('on');
      noise(0.12, 0.5, 300); tone(90, 0.2, 'sine', 0.3);
      vibrate(40);
    }, 1100);
  }
  $('btnCertDone').onclick = () => {
    $('ovCert').hidden = true;
    if (certFromGame) showResult();
    else if (state === 'over') show('ovOver');
  };
  $('btnCertAgain').onclick = () => { if (save.cert) { hide('ovOver'); showCert(save.cert, false); } };
  $('btnCertIntro').onclick = () => { if (save.cert) showCert(save.cert, false); };

  // ---------- 효과 ----------
  const texts = [];
  function floatText(t, x, y, gold) { texts.push({ t, x, y, age: 0, gold }); }

  // ---------- 그리기 ----------
  const wx = (x) => ox() + x * S;
  const wy = (y) => baseY() - (y - camY) * S;   // y = 층 바닥 높이 (위로 +)

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLayer(L, yBottom, alpha = 1) {
    const x = wx(L.x), w = L.w * S, h = LH * S, y = wy(yBottom) - h;
    if (w <= 0.5) return;
    const F = FLAVORS[L.f];
    ctx.globalAlpha = alpha;
    // 몸통
    ctx.fillStyle = F.body;
    roundRect(x, y + h * 0.18, w, h * 0.82, 6 * S); ctx.fill();
    // 윗면 크림 + 흘러내림
    ctx.fillStyle = F.cream;
    roundRect(x - 1, y, w + 2, h * 0.34, 6 * S); ctx.fill();
    ctx.fillStyle = F.drip;
    const n = Math.max(2, Math.floor(w / (18 * S)));
    for (let i = 0; i < n; i++) {
      const cx = x + (i + 0.5) * (w / n);
      const dh = h * (0.22 + ((i * 37 + L.f * 13) % 5) * 0.05);
      ctx.beginPath();
      ctx.ellipse(cx, y + h * 0.3, (w / n) * 0.32, dh, 0, 0, Math.PI);
      ctx.fill();
    }
    ctx.fillRect(x, y + h * 0.2, w, h * 0.12);
    // 스프링클
    const cols = ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#fff'];
    for (let i = 0; i < Math.floor(w / (14 * S)); i++) {
      const sx = x + ((i * 53 + L.f * 29) % 97) / 97 * w;
      const sy = y + h * (0.06 + ((i * 31) % 10) / 70);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(sx, sy, 3 * S, 1.6 * S);
    }
    // 앞면 수호 얼굴
    if (L.face >= 0 && w > h * 1.3) {
      const im = faces[L.face], r = h * 0.3;
      const fx = x + w / 2, fy = y + h * 0.64;
      ctx.save();
      ctx.beginPath(); ctx.arc(fx, fy, r + 2 * S, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      if (im.complete && im.naturalWidth) {
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(im, fx - r, fy - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawBg(now) {
    const hue = (340 + camY * 0.12) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, `hsl(${hue}, 85%, 88%)`);
    g.addColorStop(1, `hsl(${(hue + 30) % 360}, 90%, 94%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // 떠다니는 풍선
    ctx.font = `${30 * S}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const par = camY * 0.4;
    for (let k = Math.floor((par - 50) / 140); k < Math.ceil((par + vh / S) / 140) + 1; k++) {
      if (k < 0) continue;
      const x = ((k * 0.618) % 1) * vw;
      const y = baseY() - (k * 140 - par) * S + Math.sin(now / 900 + k) * 6;
      ctx.globalAlpha = 0.55;
      ctx.fillText(['🎈', '🎉', '✨', '🎈', '🎀'][k % 5], x, y);
    }
    ctx.globalAlpha = 1;
  }

  function render(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBg(now);
    // 접시
    const py = wy(0);
    ctx.fillStyle = '#e9ecef';
    ctx.beginPath(); ctx.ellipse(wx(W / 2), py + 6 * S, (BASE_W / 2 + 34) * S, 12 * S, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(wx(W / 2), py + 2 * S, (BASE_W / 2 + 28) * S, 9 * S, 0, 0, Math.PI * 2); ctx.fill();

    // 쌓인 층 (화면에 보이는 것만)
    const lo = Math.max(0, Math.floor(camY / LH) - 2);
    const hi = Math.min(layers.length - 1, Math.ceil((camY + vh / S) / LH) + 2);
    for (let i = lo; i <= hi; i++) drawLayer(layers[i], i * LH);

    // 움직이는 층
    if (mover && state === 'play') {
      const n = layers.length;
      const L = { x: mover.x, w: mover.w, f: n % FLAVORS.length, face: n % faces.length };
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.15)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 6;
      drawLayer(L, n * LH);
      ctx.restore();
    }

    // 떨어지는 조각
    for (const d of debris) {
      ctx.save();
      const cx = wx(d.x + d.w / 2), cy = wy(d.y + LH / 2);
      ctx.translate(cx, cy); ctx.rotate(d.rot); ctx.translate(-cx, -cy);
      drawLayer({ x: d.x, w: d.w, f: d.f, face: d.face }, d.y);
      ctx.restore();
    }

    // PERFECT 링
    for (const r of rings) {
      const a = 1 - r.t / 450;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 4 * S * a;
      const grow = (r.t / 450) * 14 * S;
      roundRect(wx(r.x - r.w / 2) - grow, wy(r.y + LH / 2) - grow, r.w * S + grow * 2, LH * S + grow * 2, 8 * S);
      ctx.stroke();
    }

    // 글자
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of texts) {
      const p = t.age / 900;
      ctx.globalAlpha = 1 - p * p;
      ctx.font = `${(t.gold ? 26 : 22) * S}px Jua, sans-serif`;
      ctx.lineWidth = 5 * S; ctx.strokeStyle = '#fff';
      ctx.fillStyle = t.gold ? '#f59f00' : '#e85a86';
      const y = wy(t.y + LH * 1.6) - p * 40 * S;
      ctx.strokeText(t.t, wx(t.x), y); ctx.fillText(t.t, wx(t.x), y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    if (state === 'play' && mover) {
      const sp = speedAt(height());
      mover.x += mover.dir * sp * dt;
      const minX = -mover.w * 0.35, maxX = W - mover.w * 0.65;
      if (mover.x > maxX) { mover.x = maxX; mover.dir = -1; }
      if (mover.x < minX) { mover.x = minX; mover.dir = 1; }
    }
    // 카메라: 맨 위 층이 화면 가운데쯤 오도록
    const targetCam = Math.max(0, (layers.length + 1) * LH - (baseY() - vh * 0.42) / S);
    camY += (targetCam - camY) * (1 - Math.pow(0.002, dt));

    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.vy -= 900 * dt; d.y += d.vy * dt; d.x += d.vx * dt; d.rot += d.vr * dt;
      if (wy(d.y) > vh + 200) debris.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt * 1000; if (rings[i].t > 450) rings.splice(i, 1); }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].age += dt * 1000; if (texts[i].age > 900) texts.splice(i, 1); }
    if (state === 'falling') { fallT += dt; if (fallT > 1.2) afterFall(); }

    render(now);
    requestAnimationFrame(frame);
  }

  // ---------- 오버레이 / 입력 ----------
  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }
  function pause() { if (state === 'play') { state = 'pause'; show('ovPause'); } }

  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); place(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); place(); }
  });
  $('btnPause').onclick = pause;
  $('btnResume').onclick = () => { hide('ovPause'); state = 'play'; };
  $('btnQuit').onclick = () => { hide('ovPause'); newGame(); };
  $('btnStart').onclick = () => { unlock(); hide('ovIntro'); newGame(); };
  $('btnRetry').onclick = () => { hide('ovOver'); newGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__stack = {
      state: () => state, height: () => height(),
      aligned: () => mover && Math.abs(mover.x - layers[layers.length - 1].x) <= PERFECT - 1,
      place,
    };
  }

  // ---------- 시작 ----------
  $('goalN').textContent = TARGET;
  $('sgoal').textContent = `목표 ${TARGET}층 🎖️`;
  if (save.best) { $('introRecord').textContent = `🏆 최고 기록 ${save.best}층`; $('introRecord').hidden = false; }
  $('btnCertIntro').hidden = !save.cert;
  $('shint').hidden = true;
  window.addEventListener('resize', resize);
  resize();
  layers = [{ x: (W - BASE_W) / 2, w: BASE_W, f: 0, face: 0 }];
  requestAnimationFrame(frame);
})();
