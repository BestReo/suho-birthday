(() => {
  'use strict';
  const { CFG, $, name, store, unlock, tone, noise, fanfare, vibrate, toast, confetti, bindSound } = window.BD;

  const TIERS = CFG.pianoTrophies || [{ at: 25, name: '동상', key: 'bronze' }, { at: 50, name: '은상', key: 'silver' }, { at: 100, name: '금상', key: 'gold' }];
  const LANES = 4;
  const save = store('bdayPiano_v1', { best: 0, trophies: [], sound: true });
  bindSound($('btnSound'), save);

  // 생일 축하 노래 멜로디 (한 타일 = 한 음)
  const N = { G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
  const MELODY = ['G4', 'G4', 'A4', 'G4', 'C5', 'B4', 'G4', 'G4', 'A4', 'G4', 'D5', 'C5',
    'G4', 'G4', 'G5', 'E5', 'C5', 'B4', 'A4', 'F5', 'F5', 'E5', 'C5', 'D5', 'C5'];
  const BASS = { 2: 130.8, 5: 98, 8: 98, 11: 130.8, 14: 130.8, 17: 87.3, 21: 130.8, 23: 98, 24: 130.8 };

  // ---------- 화면 ----------
  const cv = $('pcv'), ctx = cv.getContext('2d');
  let dpr = 1, vw = 0, vh = 0, TH = 200, LW = 90;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    vw = innerWidth; vh = innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    LW = vw / LANES;
    TH = Math.max(110, vh / 4.2);
  }

  // ---------- 상태 ----------
  let state = 'intro';    // intro | ready | play | pause | fail | over
  let rows = [], next = 0, scroll = 0, score = 0, songs = 0, started = false;
  let failCell = null, failT = 0, newBest = false, flashes = [];

  function genRow(k) {
    let col = (Math.random() * LANES) | 0;
    if (k > 0 && col === rows[k - 1].col && Math.random() < 0.6) col = (col + 1 + ((Math.random() * (LANES - 1)) | 0)) % LANES;
    rows[k] = { col, tapped: false, t: 0 };
  }
  const rowTop = (k) => vh - TH * 1.35 - k * TH + scroll;
  // 초당 줄 수: 금상(100타일)까지는 천천히 빨라지고, 그 뒤로는 확 빨라짐
  const speed = () => Math.min(7.5, 2.3 + Math.min(score, 100) * 0.009 + songs * 0.12 + Math.max(0, score - 100) * 0.02);

  function newGame() {
    rows = []; for (let k = 0; k < 30; k++) genRow(k);
    next = 0; scroll = 0; score = 0; songs = 0; started = false;
    failCell = null; newBest = false; flashes = [];
    setScore(0);
    updateNext();
    state = 'ready';
  }

  function setScore(n) {
    const el = $('pscore');
    el.textContent = n;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  function updateNext() {
    const tier = TIERS.find((t) => score < t.at);
    $('pnext').textContent = tier ? `${medal(tier.key)} ${tier.name}까지 ${tier.at - score}` : '🏆 전부 달성!';
  }
  const medal = (k) => ({ bronze: '🥉', silver: '🥈', gold: '🥇' }[k] || '🏆');

  // 피아노 소리
  function playNote(i) {
    const f = N[MELODY[i % MELODY.length]];
    tone(f, 0.9, 'triangle', 0.16);
    tone(f * 2, 0.5, 'sine', 0.05);
    tone(f * 3, 0.25, 'sine', 0.015);
    const b = BASS[i % MELODY.length];
    if (b) { tone(b, 1.2, 'sine', 0.12); tone(b * 1.5, 1, 'sine', 0.04); }
  }

  function tap(x, y) {
    if (state !== 'ready' && state !== 'play') return;
    unlock();
    const col = Math.max(0, Math.min(LANES - 1, Math.floor(x / LW)));
    const A = rowTop(0);
    const k = Math.floor((A + TH - y - 1e-6) / TH);
    if (k < next) return;                          // 이미 지나간 줄
    const row = rows[k];
    if (!row) return;
    if (k === next && row.col === col) {
      row.tapped = true; row.t = 0;
      flashes.push({ k, col, t: 0 });
      playNote(score);
      score++; next++;
      if (!rows[next + 25]) for (let j = rows.length; j < next + 40; j++) genRow(j);
      setScore(score);
      updateNext();
      vibrate(5);
      if (!started) { started = true; state = 'play'; }
      if (score % MELODY.length === 0) {
        songs++;
        toast(`🎵 ${songs}곡 완주! 더 빨라진다!`);
        confetti(40);
      }
      const tier = TIERS.find((t) => t.at === score);
      if (tier) toast(`${medal(tier.key)} ${tier.name} 달성!`);
      return;
    }
    if (row.col !== col) fail({ k, col });         // 흰 칸
  }

  function fail(cell) {
    state = 'fail';
    failCell = cell; failT = 0;
    tone(110, 0.6, 'sawtooth', 0.08); tone(116, 0.6, 'sawtooth', 0.06);
    noise(0.3, 0.2, 300);
    vibrate([60, 40, 80]);
    if (score > save.best) { save.best = score; newBest = true; }
    save.write();
    setTimeout(finish, 1300);
  }

  function finish() {
    state = 'over';
    const got = TIERS.filter((t) => score >= t.at);
    const top = got[got.length - 1];
    got.forEach((t) => { if (!save.trophies.includes(t.key)) save.trophies.push(t.key); });
    save.write();
    if (top) trophyShow(top); else showResult();
  }

  function showResult() {
    const tier = TIERS.find((t) => score < t.at);
    $('resTitle').textContent = score >= TIERS[0].at ? '🎹 멋진 연주였어!' : '😵 삐빅!';
    $('resMain').textContent = score;
    $('resLabel').textContent = tier ? `타일 · ${tier.name}까지 ${tier.at - score}타일!` : '타일 · 금상까지 완벽!';
    $('resBadge').hidden = !(newBest && score > 0);
    $('resSub').textContent = `최고 기록 ${save.best}타일`;
    renderCabinet($('cabinet2'));
    $('ovOver').hidden = false;
    if (newBest && score > 0) confetti(40);
  }

  // ---------- 🏆 트로피 ----------
  function trophyMarkup(key, rank) {
    const d = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(CFG.trophyDate || '');
    const date = d ? `${d[1]}. ${+d[2]}. ${+d[3]}` : '';
    return `<div class="trophy ${key}"><div class="cup"><span class="shine"></span><span class="star">★</span></div>`
      + '<div class="handle l"></div><div class="handle r"></div><div class="stem"></div>'
      + `<div class="base"><div class="plate"><div class="pl-1">생일 피아노 대회</div><div class="pl-2">${rank.split('').join(' ')}</div>`
      + `<div class="pl-3">${name.split('').join(' ')}</div><div class="pl-4">${date}</div></div></div></div>`;
  }
  function renderCabinet(el) {
    el.innerHTML = TIERS.map((t) => {
      const has = save.trophies.includes(t.key);
      return `<div class="cab-slot ${has ? '' : 'locked'}">${trophyMarkup(t.key, t.name)}<div class="lbl">${has ? t.name : `${t.at}타일`}</div></div>`;
    }).join('');
  }

  function trophyShow(tier) {
    const stage = document.querySelector('.trophy-stage');
    stage.innerHTML = trophyMarkup(tier.key, tier.name);
    stage.firstElementChild.id = 'bigTrophy';
    $('trTitle').textContent = `${medal(tier.key)} ${tier.name} 수상!`;
    $('trSub').textContent = `생일 피아노 대회에서 ${score}타일 연주 성공!`;
    const ov = $('ovTrophy');
    ov.hidden = false;
    // 드럼롤 → 짠!
    for (let i = 0; i < 14; i++) noise(0.05, 0.08 + i * 0.012, 900, 'bandpass', i * 0.06);
    setTimeout(() => { fanfare(); confetti(200); vibrate([30, 50, 30]); }, 900);
  }
  $('btnTrophyDone').onclick = () => { $('ovTrophy').hidden = true; showResult(); };

  // ---------- 그리기 ----------
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#fbf8f3'; ctx.fillRect(0, 0, vw, vh);
    // 레인 선
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
    for (let i = 1; i < LANES; i++) { ctx.beginPath(); ctx.moveTo(i * LW, 0); ctx.lineTo(i * LW, vh); ctx.stroke(); }
    // 보이는 줄
    const A = rowTop(0);
    const kMin = Math.max(0, Math.floor((A - vh) / TH)), kMax = Math.ceil((A + TH) / TH) + 1;
    for (let k = kMin; k <= kMax && k < rows.length; k++) {
      const y = rowTop(k);
      if (y > vh || y + TH < 0) continue;
      ctx.strokeStyle = 'rgba(0,0,0,.08)';
      ctx.beginPath(); ctx.moveTo(0, y + TH); ctx.lineTo(vw, y + TH); ctx.stroke();
      const r = rows[k];
      const x = r.col * LW;
      if (r.tapped) {
        ctx.fillStyle = 'rgba(28,27,46,.12)';
        ctx.fillRect(x + 1, y + 1, LW - 2, TH - 2);
      } else {
        const g = ctx.createLinearGradient(0, y, 0, y + TH);
        g.addColorStop(0, '#34324a'); g.addColorStop(1, '#141322');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x + 2, y + 2, LW - 4, TH - 4, 8) : ctx.rect(x + 2, y + 2, LW - 4, TH - 4);
        ctx.fill();
        if (k === 0 && !started) {
          ctx.fillStyle = '#fff'; ctx.font = `${Math.min(LW * 0.26, 26)}px Jua, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('시작', x + LW / 2, y + TH / 2);
        } else if (k % 25 === 24) {
          ctx.fillStyle = '#ffd43b'; ctx.font = `${Math.min(LW * 0.3, 28)}px Jua, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('♪', x + LW / 2, y + TH / 2);
        }
      }
    }
    // 누른 곳 반짝
    for (const f of flashes) {
      const y = rowTop(f.k);
      ctx.fillStyle = `rgba(255,212,59,${0.55 * (1 - f.t / 0.3)})`;
      ctx.fillRect(f.col * LW, y, LW, TH);
      ctx.fillStyle = `rgba(255,77,109,${1 - f.t / 0.3})`;
      ctx.font = `${LW * 0.35}px Jua, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♪', f.col * LW + LW / 2, y + TH / 2 - f.t * 80);
    }
    // 틀린 칸
    if (failCell) {
      const y = rowTop(failCell.k);
      const on = Math.floor(failT * 8) % 2 === 0;
      if (on) { ctx.fillStyle = '#ff4d6d'; ctx.fillRect(failCell.col * LW, y, LW, TH); }
    }
  }

  // ---------- 루프 ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    if (state === 'play') {
      scroll += speed() * TH * dt;
      const y = rowTop(next);
      if (y > vh - TH * 0.25) {                       // 놓침
        fail({ k: next, col: rows[next].col });
      }
    }
    if (state === 'fail') {
      failT += dt;
      // 놓친 줄이 보이게 살짝 되감기
      const y = rowTop(failCell.k);
      if (y > vh - TH * 1.1) scroll -= Math.min(y - (vh - TH * 1.1), 900 * dt);
    }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.3) flashes.splice(i, 1); }
    render();
    requestAnimationFrame(frame);
  }

  // ---------- 입력 ----------
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(e.clientX, e.clientY); });
  window.addEventListener('keydown', (e) => {
    const map = { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
    if (e.code in map && !e.repeat) {
      const k = next;
      tap(map[e.code] * LW + LW / 2, rowTop(k) + TH / 2);
    }
  });

  // ---------- 버튼 ----------
  function pause() { if (state === 'play') { state = 'pause'; $('ovPause').hidden = false; } }
  $('btnPause').onclick = pause;
  $('btnResume').onclick = () => { $('ovPause').hidden = true; state = 'play'; last = performance.now(); };
  $('btnQuit').onclick = () => { $('ovPause').hidden = true; newGame(); };
  $('btnStart').onclick = () => { unlock(); $('ovIntro').hidden = true; newGame(); };
  $('btnRetry').onclick = () => { $('ovOver').hidden = true; newGame(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__piano = {
      state: () => state, score: () => score,
      tapNext: () => { const r = rows[next]; tap(r.col * LW + LW / 2, rowTop(next) + TH / 2); },
    };
  }

  // ---------- 시작 ----------
  $('ruleTrophy').textContent = TIERS.map((t) => t.at).join('·');
  if (save.best) { $('introRecord').textContent = `🏆 최고 기록 ${save.best}타일`; $('introRecord').hidden = false; }
  renderCabinet($('cabinet'));
  window.addEventListener('resize', resize);
  resize();
  newGame(); state = 'intro';
  requestAnimationFrame(frame);
})();
