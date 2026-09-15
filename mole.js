(() => {
  'use strict';

  const CFG = window.GAME_CONFIG;
  const TIME = (CFG.moleTime || 60) * 1000;
  const TARGET = CFG.moleTarget || 45;
  const CANDLES = Math.max(1, Math.min(15, CFG.moleCandles || 7));
  const FACES = CFG.moleFaces && CFG.moleFaces.length ? CFG.moleFaces : ['photos/stage9.jpg'];
  const GOLD_P = 0.08, DECOY_P = 0.12;
  const lerp = (a, b, t) => a + (b - a) * t;
  const spawnGap = (p) => lerp(880, 470, p) * (0.8 + Math.random() * 0.4);   // 다음 두더지까지 (ms)
  const upTime = (p) => lerp(1150, 700, p);                                  // 머무는 시간 (ms)
  const maxUp = (p) => (p < 0.3 ? 2 : 3);

  // ---------- 저장 ----------
  const SAVE_KEY = 'bdayMole_v1';
  const save = (() => {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { d = {}; }
    return {
      best: d.best || 0, clears: d.clears || 0, sound: d.sound !== false,
      write() {
        try { localStorage.setItem(SAVE_KEY, JSON.stringify({ best: this.best, clears: this.clears, sound: this.sound })); } catch (e) { /* 무시 */ }
      },
    };
  })();

  const name = CFG.friendName || '친구';
  const hasBatchim = (s) => {
    const c = s.charCodeAt(s.length - 1);
    return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  };
  const callName = name + (hasBatchim(name) ? '아' : '야');

  const $ = (id) => document.getElementById(id);
  const field = $('field');

  // 얼굴 미리 불러오기
  FACES.forEach((src) => { const im = new Image(); im.src = src; });

  // ---------- 구멍 9개 ----------
  const holes = [];
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('div');
    el.className = 'hole';
    el.innerHTML = '<div class="dirt"></div><div class="mask"><div class="mole"><div class="face"></div>'
      + '<div class="crown">👑</div><div class="dizzy">💫</div></div></div><div class="lip"></div>';
    field.appendChild(el);
    const h = { el, mole: el.querySelector('.mole'), face: el.querySelector('.face'), busy: false, type: null, timer: 0, hit: false };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); whack(h, e.clientX, e.clientY); });
    holes.push(h);
  }

  function layout() {
    const r = field.getBoundingClientRect();
    const rowGap = parseFloat(getComputedStyle(field).rowGap) || 0;
    const size = Math.max(60, Math.min((r.width - 12) / 3, (r.height - rowGap * 2) / 3 / 1.05));
    for (const h of holes) {
      h.el.style.width = size + 'px';
      h.el.style.fontSize = size / 10 + 'px';
    }
  }

  // ---------- 상태 ----------
  let state = 'intro';    // intro | count | play | pause | end | party
  let score = 0, elapsed = 0, nextSpawn = 0, lastFace = -1;
  let last = 0, newBest = false, reached = false, lastSec = -1;

  function newGame() {
    for (const h of holes) resetHole(h);
    score = 0; elapsed = 0; nextSpawn = 600; lastFace = -1;
    newBest = false; reached = false; lastSec = -1;
    updateHud();
    $('mtime').textContent = Math.ceil(TIME / 1000);
    $('mtime').classList.remove('warn');
    countdown(3, () => { state = 'play'; last = performance.now(); });
  }

  function countdown(n, done) {
    state = 'count';
    const cd = $('countdown');
    cd.hidden = false;
    let k = n;
    const step = () => {
      if (k === 0) {
        cd.innerHTML = '<span>시작!</span>';
        sfx.go();
        setTimeout(() => { cd.hidden = true; done(); }, 450);
        return;
      }
      cd.innerHTML = `<span>${k}</span>`;
      sfx.tick();
      k--;
      setTimeout(step, 650);
    };
    step();
  }

  function resetHole(h) {
    clearTimeout(h.timer);
    h.busy = false; h.hit = false; h.type = null;
    h.el.classList.remove('up', 'hit', 'bad');
  }

  function spawn() {
    const p = elapsed / TIME;
    const up = holes.filter((h) => h.busy).length;
    if (up >= maxUp(p)) return;
    const free = holes.filter((h) => !h.busy);
    if (!free.length) return;
    const h = free[(Math.random() * free.length) | 0];
    const r = Math.random();
    h.type = r < GOLD_P ? 'gold' : r < GOLD_P + DECOY_P ? 'decoy' : 'normal';
    h.mole.className = 'mole ' + h.type;
    if (h.type === 'decoy') {
      h.face.style.backgroundImage = '';
      h.face.textContent = '🥦';
    } else {
      let f;
      do { f = (Math.random() * FACES.length) | 0; } while (FACES.length > 1 && f === lastFace);
      lastFace = f;
      h.face.textContent = '';
      h.face.style.backgroundImage = `url("${FACES[f]}")`;
    }
    h.busy = true; h.hit = false;
    h.el.classList.remove('hit', 'bad');
    void h.el.offsetWidth;
    h.el.classList.add('up');
    sfx.pop();
    h.timer = setTimeout(() => hide(h), upTime(p) * (h.type === 'gold' ? 0.8 : 1));
  }

  function hide(h) {
    h.el.classList.remove('up');
    h.timer = setTimeout(() => { h.busy = false; h.type = null; }, 160);
  }

  function whack(h, x, y) {
    if (state !== 'play') return;
    sfx.unlock();
    hammer(x, y);
    if (!h.busy || h.hit || !h.el.classList.contains('up')) { sfx.miss(); return; }
    h.hit = true;
    clearTimeout(h.timer);
    if (h.type === 'decoy') {
      score = Math.max(0, score - 1);
      h.el.classList.add('bad');
      popText(x, y, '앗! -1', 'bad');
      sfx.bad();
      vibrate([40, 30, 40]);
      h.el.classList.remove('up');
    } else {
      const pts = h.type === 'gold' ? 3 : 1;
      score += pts;
      h.el.classList.add('hit');
      popText(x, y, h.type === 'gold' ? '+3 👑' : '+1', h.type === 'gold' ? 'gold' : '');
      if (h.type === 'gold') sfx.gold(); else sfx.hit();
      vibrate(h.type === 'gold' ? 40 : 15);
    }
    h.timer = setTimeout(() => { resetHole(h); }, 420);
    updateHud();
    if (!reached && score >= TARGET) {
      reached = true;
      toast('🎯 목표 달성! 끝까지 더 잡아봐!');
      sfx.gold();
    }
  }

  function updateHud() {
    $('mscore').textContent = score;
    $('mprogFill').style.width = Math.min(100, (score / TARGET) * 100) + '%';
    $('mprog').classList.toggle('done', score >= TARGET);
  }

  function endGame() {
    state = 'end';
    for (const h of holes) { clearTimeout(h.timer); h.el.classList.remove('up'); h.busy = true; }
    $('mtime').textContent = 0;
    $('mtime').classList.remove('warn');
    if (score > save.best) { save.best = score; newBest = true; }
    const win = score >= TARGET;
    if (win) save.clears++;
    save.write();
    sfx.end();
    const cd = $('countdown');
    cd.innerHTML = '<span style="font-size:72px">끝!</span>';
    cd.hidden = false;
    setTimeout(() => {
      cd.hidden = true;
      if (win) party.start(); else showResult(false);
    }, 1100);
  }

  function showResult(win) {
    state = 'end';
    $('resTitle').textContent = win ? '🎉 성공!' : '😵 아쉽다!';
    $('resMain').textContent = score;
    $('resLabel').textContent = win ? `마리 잡았어! (목표 ${TARGET})` : `마리 · 목표까지 ${TARGET - score}마리 남았어!`;
    $('resBadge').hidden = !(newBest && score > 0);
    $('resSub').textContent = `최고 기록 ${save.best}마리`;
    $('btnPartyAgain').hidden = !win;
    show('ovOver');
    if (newBest && score > 0) confetti(60);
  }

  // ---------- 루프 ----------
  function frame(now) {
    if (state === 'play') {
      const dt = Math.min(100, now - last);
      last = now;
      elapsed += dt;
      nextSpawn -= dt;
      if (nextSpawn <= 0) { spawn(); nextSpawn = spawnGap(elapsed / TIME); }
      const left = Math.max(0, TIME - elapsed);
      const sec = Math.ceil(left / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        $('mtime').textContent = sec;
        $('mtime').classList.toggle('warn', sec <= 10);
        if (sec <= 5 && sec > 0) sfx.tick();
      }
      if (left <= 0) endGame();
    } else last = now;
    confettiTick(16);
    requestAnimationFrame(frame);
  }

  // ---------- 효과 ----------
  function hammer(x, y) {
    const h = document.createElement('div');
    h.className = 'hammer'; h.textContent = '🔨';
    h.style.left = x + 'px'; h.style.top = y + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 260);
  }
  function popText(x, y, text, cls) {
    const t = document.createElement('div');
    t.className = 'pop-text ' + (cls || '');
    t.textContent = text;
    t.style.left = x + 'px'; t.style.top = y + 'px';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 820);
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function show(id) { $(id).hidden = false; }
  function hide2(id) { $(id).hidden = true; }

  // ---------- 🎂 성공 보상 ----------
  const party = (() => {
    const ov = $('ovParty');
    const candlesEl = $('candles');
    let timers = [];
    let lit = 0, canBlow = false;
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));

    function build() {
      candlesEl.innerHTML = '';
      candlesEl.style.gap = CANDLES > 8 ? '2.5%' : '4%';
      for (let i = 0; i < CANDLES; i++) {
        const c = document.createElement('div');
        c.className = 'candle';
        c.style.height = (44 + ((i * 7) % 3) * 6) + 'px';
        if (CANDLES > 8) c.style.width = '11px';
        c.innerHTML = '<div class="wick"></div><div class="flame"></div><div class="smoke"></div>';
        c.addEventListener('pointerdown', (e) => { e.preventDefault(); blow(c); });
        candlesEl.appendChild(c);
      }
      lit = CANDLES;
      $('cakeFace').src = CFG.jumpFace || 'photos/stage9.jpg';
    }

    function start() {
      state = 'party';
      timers.forEach(clearTimeout); timers = [];
      build();
      canBlow = false;
      ov.classList.remove('dark');
      $('partyEnd').hidden = true;
      $('partyTitle').textContent = `🎉 ${score}마리 성공!`;
      $('partyMsg').textContent = '노래 시작까지';
      $('partyCount').textContent = '';
      ov.hidden = false;
      sfx.unlock();
      confetti(120);
      sfx.gold();
      // 노래 전 카운트다운
      let n = CFG.moleSongCountdown || 5;
      const tick = () => {
        if (n === 0) { sing(); return; }
        const c = $('partyCount');
        c.textContent = n;
        c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick');
        sfx.tick();
        n--;
        later(tick, 1000);
      };
      later(tick, 900);
    }

    function sing() {
      $('partyCount').textContent = '🎵';
      $('partyMsg').textContent = '생일 축하 노래';
      const dur = sfx.song();
      const noteTimer = setInterval(floatNote, 450);
      timers.push(noteTimer);
      later(() => {
        clearInterval(noteTimer);
        sfx.cheer();
        confetti(80);
        $('partyCount').textContent = '🕯️';
        $('partyMsg').textContent = '촛불을 눌러서 꺼줘!';
        canBlow = true;
        candlesEl.querySelectorAll('.candle').forEach((c) => c.classList.add('ready'));
      }, dur * 1000 + 300);
    }

    function floatNote() {
      const n = document.createElement('span');
      n.textContent = ['🎵', '🎶', '🎂', '✨'][(Math.random() * 4) | 0];
      n.style.left = (10 + Math.random() * 80) + '%';
      $('notes').appendChild(n);
      setTimeout(() => n.remove(), 2500);
    }

    function blow(c) {
      if (!canBlow || c.classList.contains('out')) return;
      c.classList.remove('ready');
      c.classList.add('out');
      sfx.blow();
      vibrate(20);
      lit--;
      if (lit === 0) {
        canBlow = false;
        ov.classList.add('dark');
        $('partyCount').textContent = '';
        $('partyMsg').textContent = '';
        later(finale, 900);
      }
    }

    function finale() {
      $('partyBig').innerHTML = '';
      $('partyBig').append(`${callName}`, document.createElement('br'), '생일 축하해! 🎉');
      $('partyEnd').hidden = false;
      confetti(250);
      sfx.fanfare();
      vibrate([30, 60, 30, 60, 30]);
    }

    $('btnPartyDone').onclick = () => {
      timers.forEach(clearTimeout); timers = [];
      ov.hidden = true;
      showResult(true);
    };
    return { start };
  })();

  // ---------- 폭죽 ----------
  const cf = $('confetti'), cfx = cf.getContext('2d');
  const bits = [];
  const CF_COLORS = ['#ff7aa2', '#ffd166', '#7ad3ff', '#9be08c', '#c79bff', '#ffffff'];
  function confetti(n) {
    for (let i = 0; i < n; i++) {
      bits.push({
        x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.4,
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
        c: CF_COLORS[(Math.random() * CF_COLORS.length) | 0],
      });
    }
  }
  function confettiTick(dtMs) {
    const d = window.devicePixelRatio || 1;
    if (cf.width !== innerWidth * d || cf.height !== innerHeight * d) { cf.width = innerWidth * d; cf.height = innerHeight * d; }
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
      cfx.fillStyle = b.c; cfx.fillRect(-b.w / 2, (-b.h / 2) * q, b.w, b.h * q + 1);
      cfx.restore();
    }
  }

  // ---------- 소리 ----------
  const sfx = (() => {
    let ac = null;
    const tone = (freq, dur, type = 'sine', vol = 0.12, delay = 0, slide = 1) => {
      if (!save.sound || !ac) return;
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
    };
    const noise = (dur, vol, freq) => {
      if (!save.sound || !ac) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
      src.connect(f).connect(g).connect(ac.destination);
      src.start();
    };
    // 생일 축하 노래 멜로디 (다장조, 3/4박자) [음, 박자]
    const N = { G4: 392, A4: 440, B4: 494, C5: 523, D5: 587, E5: 659, F5: 698, G5: 784 };
    const MELODY = [
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
      ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
      ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2],
      ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
    ];
    const BASS = [[1, 130.8], [4, 98], [7, 98], [10, 130.8], [13, 130.8], [16, 87.3], [19, 130.8], [22, 98], [23, 130.8]];
    return {
      unlock() {
        if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; } }
        if (ac.state === 'suspended') ac.resume();
      },
      pop() { tone(700, 0.06, 'sine', 0.05, 0, 1.6); },
      hit() { tone(880, 0.09, 'triangle', 0.14, 0, 0.6); noise(0.06, 0.25, 1800); },
      gold() { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, i * 0.06)); },
      bad() { tone(220, 0.25, 'square', 0.07, 0, 0.7); },
      miss() { noise(0.04, 0.1, 600); },
      tick() { tone(1000, 0.05, 'square', 0.04); },
      go() { tone(1320, 0.25, 'triangle', 0.12); },
      end() { [784, 659, 523].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, i * 0.12)); },
      blow() { noise(0.35, 0.3, 900); },
      // 노래 끝나고 "와아~" 환호 + 박수
      cheer() {
        if (!save.sound || !ac) return;
        const len = Math.floor(ac.sampleRate * 2.2);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          const t = i / ac.sampleRate;
          const env = Math.min(1, t / 0.25) * Math.max(0, 1 - (t - 0.4) / 1.8);
          d[i] = (Math.random() * 2 - 1) * env;
        }
        const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.7; g.gain.value = 0.45;
        src.connect(f).connect(g).connect(ac.destination);
        src.start();
        for (let k = 0; k < 18; k++) {
          const t = ac.currentTime + 0.1 + k * 0.11 + Math.random() * 0.05;
          const s = ac.createBufferSource(), ff = ac.createBiquadFilter(), gg = ac.createGain();
          const b = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.04), ac.sampleRate);
          const cd = b.getChannelData(0);
          for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * (1 - i / cd.length);
          s.buffer = b; ff.type = 'highpass'; ff.frequency.value = 1500; gg.gain.value = 0.4;
          s.connect(ff).connect(gg).connect(ac.destination);
          s.start(t);
        }
      },
      fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.11, 1.02)); },
      song() {
        const beat = 0.52;
        let t = 0;
        for (const [n, b] of MELODY) {
          tone(N[n], b * beat * 0.95, 'triangle', 0.16, t);
          tone(N[n] * 2, b * beat * 0.6, 'sine', 0.03, t);     // 오르골 느낌
          t += b * beat;
        }
        for (const [b, f] of BASS) tone(f, beat * 2.4, 'sine', 0.1, b * beat - beat * 0);
        return t;
      },
    };
  })();

  function vibrate(p) {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p);
    } catch (e) { /* 무시 */ }
  }

  // ---------- 버튼 ----------
  const soundBtn = $('btnSound');
  const syncSound = () => { soundBtn.textContent = save.sound ? '🔊' : '🔇'; };
  syncSound();
  soundBtn.onclick = () => { save.sound = !save.sound; save.write(); syncSound(); sfx.unlock(); };

  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    show('ovPause');
  }
  $('btnPause').onclick = pause;
  $('btnResume').onclick = () => { hide2('ovPause'); state = 'play'; last = performance.now(); };
  $('btnQuit').onclick = () => { hide2('ovPause'); newGame(); };
  $('btnStart').onclick = () => { sfx.unlock(); hide2('ovIntro'); newGame(); };
  $('btnRetry').onclick = () => { hide2('ovOver'); newGame(); };
  $('btnPartyAgain').onclick = () => { hide2('ovOver'); party.start(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // 테스트용 (주소에 ?debug 붙였을 때만)
  if (location.search.includes('debug')) {
    window.__mole = {
      state: () => state, score: () => score,
      upHoles: () => holes.filter((h) => h.busy && !h.hit && h.el.classList.contains('up')).map((h) => ({ el: h.el, type: h.type })),
      finish: () => { elapsed = TIME; },
    };
  }

  // ---------- 시작 ----------
  $('goalN').textContent = TARGET;
  $('mtarget').textContent = TARGET;
  $('goalTime').textContent = TIME % 60000 ? `${TIME / 1000}초` : `${TIME / 60000}분`;
  if (save.best) { $('introRecord').textContent = `🏆 최고 기록 ${save.best}마리`; $('introRecord').hidden = false; }
  window.addEventListener('resize', layout);
  layout();
  requestAnimationFrame(frame);
})();
