(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlay-text');

  const W = canvas.width, H = canvas.height;

  const ROAD_WIDTH = 74;
  const ANCHOR = { x: W / 2, y: H * 0.74 }; // where the car sits on screen
  const TURN_TOLERANCE = 34;                // world units — the valid tap window
  const BASE_SPEED = 92;                    // world units per second
  const MAX_SPEED = 210;
  const SEGMENT_COUNT = 300;

  const BEST_KEY = 'driftBossUnblockedBest';
  let best = Number(localStorage.getItem(BEST_KEY) || 0);
  bestEl.textContent = best;

  let state = 'ready'; // ready | playing | crashed
  let path, carDist, segIndex, heading, speed, score, particles, flashT;

  function dirVector(h) {
    return { x: Math.sin(h), y: -Math.cos(h) };
  }

  function buildPath() {
    const points = [{ x: 0, y: 0 }];
    const turns = [];
    let h = 0;
    let p = points[0];
    let len = 260; // generous first straight to warm up
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const v = dirVector(h);
      const next = { x: p.x + v.x * len, y: p.y + v.y * len };
      points.push(next);
      p = next;
      const turn = Math.random() < 0.5 ? -1 : 1;
      turns.push(turn);
      h += turn * Math.PI / 2;
      len = 130 + Math.random() * 90;
    }
    return { points, turns };
  }

  function reset() {
    path = buildPath();
    segIndex = 0;
    carDist = 0;
    heading = 0;
    speed = BASE_SPEED;
    score = 0;
    particles = [];
    flashT = 0;
    scoreEl.textContent = 0;
  }

  function segLength(i) {
    const a = path.points[i], b = path.points[i + 1];
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function carWorldPos() {
    const a = path.points[segIndex];
    const v = dirVector(heading);
    return { x: a.x + v.x * carDist, y: a.y + v.y * carDist };
  }

  function distToCorner() {
    return segLength(segIndex) - carDist;
  }

  function worldToScreen(wx, wy) {
    const car = carWorldPos();
    const dx = wx - car.x, dy = wy - car.y;
    const a = -heading;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = dx * Math.sin(a) + dy * Math.cos(a);
    return { x: ANCHOR.x + rx, y: ANCHOR.y + ry };
  }

  function crash() {
    state = 'crashed';
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_KEY, String(best));
      bestEl.textContent = best;
    }
    overlayText.innerHTML = `You skidded off.<br>Score: ${score} &mdash; tap to retry`;
    overlay.classList.remove('hidden');
  }

  function spawnSpark() {
    for (let i = 0; i < 10; i++) {
      particles.push({
        x: ANCHOR.x, y: ANCHOR.y,
        vx: (Math.random() - 0.5) * 140,
        vy: (Math.random() - 0.5) * 140,
        life: 0.4 + Math.random() * 0.2
      });
    }
  }

  function attemptTurn() {
    if (state !== 'playing') return;
    const d = distToCorner();
    if (d <= TURN_TOLERANCE && d >= -6) {
      heading += path.turns[segIndex] * Math.PI / 2;
      segIndex += 1;
      carDist = 0;
      score += 1;
      scoreEl.textContent = score;
      speed = Math.min(MAX_SPEED, BASE_SPEED + score * 4);
      spawnSpark();
    } else {
      crash();
    }
  }

  function startOrRetry() {
    if (state === 'ready' || state === 'crashed') {
      reset();
      state = 'playing';
      overlay.classList.add('hidden');
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'playing') attemptTurn();
    else startOrRetry();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'playing') attemptTurn();
      else startOrRetry();
    }
  });

  function drawRoad() {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const start = Math.max(0, segIndex - 1);
    const end = Math.min(path.points.length - 2, segIndex + 3);
    for (let i = start; i <= end; i++) {
      const a = worldToScreen(path.points[i].x, path.points[i].y);
      const b = worldToScreen(path.points[i + 1].x, path.points[i + 1].y);

      ctx.strokeStyle = '#2a2d34';
      ctx.lineWidth = ROAD_WIDTH;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = ROAD_WIDTH - 10;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawTurnMarker() {
    if (state !== 'playing') return;
    const cornerIdx = segIndex + 1;
    if (cornerIdx >= path.points.length) return;
    const d = distToCorner();
    if (d > 170) return;
    const corner = worldToScreen(path.points[cornerIdx].x, path.points[cornerIdx].y);
    const inWindow = d <= TURN_TOLERANCE && d >= -6;
    const t = Math.max(0, Math.min(1, 1 - d / 170));
    ctx.beginPath();
    ctx.arc(corner.x, corner.y, 14 + (inWindow ? 4 * Math.sin(flashT * 20) : 0), 0, Math.PI * 2);
    ctx.strokeStyle = inWindow ? '#ff5a43' : `rgba(255,176,32,${0.25 + t * 0.6})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawCar() {
    ctx.save();
    ctx.translate(ANCHOR.x, ANCHOR.y);
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fillStyle = '#ffb020';
    ctx.fill();
    ctx.fillStyle = '#ff5a43';
    ctx.fillRect(-6, 8, 4, 3);
    ctx.fillRect(2, 8, 4, 3);
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillStyle = '#ffb020';
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  let lastT = null;
  function frame(t) {
    if (lastT === null) lastT = t;
    const dt = Math.min(0.033, (t - lastT) / 1000);
    lastT = t;
    flashT += dt;

    ctx.clearRect(0, 0, W, H);

    if (state === 'playing') {
      carDist += speed * dt;
      if (carDist > segLength(segIndex) + 40) {
        crash(); // missed the corner entirely
      }
    }

    drawRoad();
    drawTurnMarker();
    drawCar();
    drawParticles(dt);

    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
})();
