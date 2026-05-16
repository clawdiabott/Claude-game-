// ─── Office Chair Racing – game.js ───────────────────────────────────────────

const canvas = document.getElementById('renderCanvas');
const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });

// ─── Global state ────────────────────────────────────────────────────────────
let scene, camera, physicsPlugin;
let playerChair, aiChair;
let currentTrack = 0;
let gameRunning = false;
let raceStartTime = 0;
let lapStartTime = 0;
let playerLap = 1;
let aiLap = 1;
let playerCheckpoint = 0;
let aiCheckpoint = 0;
let bestLapTime = Infinity;
let totalLaps = 3;
let raceFinished = false;
let keys = {};
let aiWaypoints = [];
let aiWaypointIndex = 0;
let checkpointMeshes = [];
let playerCheckpointsPassed = [];
let aiSpeed = 0;
let playerSpeed = 0;
let minimapCtx, minimapCanvas;
let trackLayout = [];

// ─── Menu ────────────────────────────────────────────────────────────────────
function selectTrack(idx) {
  currentTrack = idx;
  document.querySelectorAll('.track-card').forEach(c => c.classList.remove('selected'));
  document.querySelector(`[data-track="${idx}"]`).classList.add('selected');
}

function startGame() {
  document.getElementById('menu').style.display = 'none';
  initScene();
  runCountdown();
}

function restartRace() {
  document.getElementById('finish-screen').style.display = 'none';
  engine.stopRenderLoop();
  scene.dispose();
  initScene();
  runCountdown();
}

function backToMenu() {
  document.getElementById('finish-screen').style.display = 'none';
  engine.stopRenderLoop();
  scene.dispose();
  document.getElementById('menu').style.display = 'flex';
}

function runCountdown() {
  gameRunning = false;
  const el = document.getElementById('countdown');
  const num = document.getElementById('countdown-num');
  el.style.opacity = '1';
  let count = 3;
  num.textContent = count;

  const tick = setInterval(() => {
    count--;
    if (count > 0) {
      num.textContent = count;
    } else if (count === 0) {
      num.textContent = 'GO!';
      num.style.color = '#00ff88';
    } else {
      clearInterval(tick);
      el.style.opacity = '0';
      num.style.color = '#fff';
      gameRunning = true;
      raceStartTime = performance.now();
      lapStartTime = performance.now();
    }
  }, 1000);
}

// ─── Scene init ──────────────────────────────────────────────────────────────
function initScene() {
  playerLap = 1; aiLap = 1;
  playerCheckpoint = 0; aiCheckpoint = 0;
  bestLapTime = Infinity; raceFinished = false;
  playerCheckpointsPassed = [];
  aiWaypointIndex = 0;
  aiSpeed = 0; playerSpeed = 0;
  updateHUD(0, 1);

  scene = new BABYLON.Scene(engine);
  scene.enablePhysics(new BABYLON.Vector3(0, -20, 0), new BABYLON.CannonJSPlugin());
  scene.gravity = new BABYLON.Vector3(0, -20, 0);
  scene.collisionsEnabled = true;
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogStart = 60;
  scene.fogEnd = 120;

  // Camera (follows player)
  camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0, 5, -12), scene);
  camera.radius = 12;
  camera.heightOffset = 5;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.05;
  camera.maxCameraSpeed = 20;

  // Lighting
  const ambient = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0, 1, 0), scene);
  ambient.intensity = 0.6;
  ambient.groundColor = new BABYLON.Color3(0.3, 0.3, 0.4);

  const sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-1, -2, -1), scene);
  sun.intensity = 0.8;
  sun.position = new BABYLON.Vector3(30, 50, 30);

  const shadowGen = new BABYLON.ShadowGenerator(1024, sun);
  shadowGen.useBlurExponentialShadowMap = true;

  // Build selected track
  const tracks = [buildCubicleCanyonTrack, buildOpenOfficeTrack, buildExecutiveSuiteTrack];
  tracks[currentTrack](scene, shadowGen);

  // Minimap
  minimapCanvas = document.getElementById('minimap');
  minimapCtx = minimapCanvas.getContext('2d');

  // Input
  keys = {};
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });

  // Render loop
  engine.runRenderLoop(() => {
    if (gameRunning && !raceFinished) {
      updatePlayer();
      updateAI();
      updateHUD(performance.now() - raceStartTime, playerLap);
      updateMinimap();
      updatePosition();
      checkReset();
    }
    scene.render();
  });

  window.addEventListener('resize', () => engine.resize());
}

// ─── Player update ───────────────────────────────────────────────────────────
function updatePlayer() {
  if (!playerChair) return;
  const dt = engine.getDeltaTime() / 1000;
  const maxSpeed = 18;
  const accel = 12;
  const turnSpeed = 2.2;
  const drag = 0.88;
  const brakeForce = 0.6;

  const fwd = keys['KeyW'] || keys['ArrowUp'];
  const back = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];
  const brake = keys['Space'];

  // Speed
  if (fwd) playerSpeed = Math.min(playerSpeed + accel * dt, maxSpeed);
  else if (back) playerSpeed = Math.max(playerSpeed - accel * dt, -maxSpeed * 0.5);
  else playerSpeed *= drag;

  if (brake) playerSpeed *= brakeForce;

  // Turn
  if (Math.abs(playerSpeed) > 0.5) {
    const dir = playerSpeed > 0 ? 1 : -1;
    if (left) playerChair.rotation.y -= turnSpeed * dt * dir;
    if (right) playerChair.rotation.y += turnSpeed * dt * dir;
  }

  // Move
  const angle = playerChair.rotation.y;
  const vx = Math.sin(angle) * playerSpeed * dt;
  const vz = Math.cos(angle) * playerSpeed * dt;

  const newPos = playerChair.position.add(new BABYLON.Vector3(vx, 0, vz));
  if (!checkWallCollision(newPos)) {
    playerChair.position.copyFrom(newPos);
  } else {
    playerSpeed *= -0.3;
  }

  // Keep grounded
  playerChair.position.y = 0.25;

  camera.lockedTarget = playerChair;
}

// ─── AI update ───────────────────────────────────────────────────────────────
function updateAI() {
  if (!aiChair || aiWaypoints.length === 0) return;
  const dt = engine.getDeltaTime() / 1000;

  const target = aiWaypoints[aiWaypointIndex];
  const diff = target.subtract(aiChair.position);
  diff.y = 0;
  const dist = diff.length();

  if (dist < 3) {
    aiWaypointIndex = (aiWaypointIndex + 1) % aiWaypoints.length;
    // count AI checkpoints/laps
    if (aiWaypointIndex === 0) aiLap++;
  }

  // Steer toward waypoint
  const desiredAngle = Math.atan2(diff.x, diff.z);
  let angleDiff = desiredAngle - aiChair.rotation.y;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  aiChair.rotation.y += angleDiff * 3 * dt;

  // Speed varies by track difficulty
  const speeds = [13, 14.5, 15.5];
  const maxAI = speeds[currentTrack];
  aiSpeed = Math.min(aiSpeed + 8 * dt, maxAI);

  const angle = aiChair.rotation.y;
  const vx = Math.sin(angle) * aiSpeed * dt;
  const vz = Math.cos(angle) * aiSpeed * dt;
  const newPos = aiChair.position.add(new BABYLON.Vector3(vx, 0, vz));
  if (!checkWallCollision(newPos)) {
    aiChair.position.copyFrom(newPos);
  }
  aiChair.position.y = 0.25;
}

// ─── Wall collision ───────────────────────────────────────────────────────────
function checkWallCollision(pos) {
  for (const seg of trackLayout) {
    if (seg.type === 'wall') {
      const dx = pos.x - seg.cx;
      const dz = pos.z - seg.cz;
      const hw = seg.hw + 0.8;
      const hd = seg.hd + 0.8;
      if (Math.abs(dx) < hw && Math.abs(dz) < hd) return true;
    }
    if (seg.type === 'bounds') {
      if (pos.x < seg.minX + 0.8 || pos.x > seg.maxX - 0.8 ||
          pos.z < seg.minZ + 0.8 || pos.z > seg.maxZ - 0.8) return true;
    }
  }
  return false;
}

// ─── Checkpoint / lap logic ───────────────────────────────────────────────────
function registerCheckpoint(mesh, idx, isFinish) {
  scene.registerBeforeRender(() => {
    if (!playerChair || raceFinished) return;

    // Player
    const pd = BABYLON.Vector3.Distance(playerChair.position, mesh.position);
    if (pd < 4 && !playerCheckpointsPassed.includes(idx)) {
      playerCheckpointsPassed.push(idx);

      if (isFinish && playerCheckpointsPassed.length >= checkpointMeshes.length) {
        playerLap++;
        playerCheckpointsPassed = [];
        const lapTime = performance.now() - lapStartTime;
        lapStartTime = performance.now();
        if (lapTime < bestLapTime) bestLapTime = lapTime;
        document.getElementById('hud-best').textContent = formatTime(bestLapTime);

        if (playerLap > totalLaps) {
          finishRace(true, performance.now() - raceStartTime);
        }
      }
    }
  });
}

function finishRace(playerWon, totalMs) {
  raceFinished = true;
  gameRunning = false;
  const screen = document.getElementById('finish-screen');
  document.getElementById('finish-emoji').textContent = playerWon ? '🏆' : '😅';
  document.getElementById('finish-title').textContent = playerWon ? 'YOU WIN!' : 'SO CLOSE!';
  document.getElementById('finish-time').textContent = 'Total: ' + formatTime(totalMs);
  screen.style.display = 'flex';
}

function checkReset() {
  if (keys['KeyR']) {
    if (playerChair) {
      playerChair.position.copyFrom(getStartPosition());
      playerChair.rotation.y = 0;
      playerSpeed = 0;
    }
  }

  // AI wins
  if (!raceFinished && aiLap > totalLaps) {
    finishRace(false, performance.now() - raceStartTime);
  }
}

function getStartPosition() {
  return new BABYLON.Vector3(0, 0.25, -30);
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function updateHUD(ms, lap) {
  document.getElementById('hud-time').textContent = formatTime(ms);
  document.getElementById('hud-lap').textContent = Math.min(lap, totalLaps) + ' / ' + totalLaps;
  const kmh = Math.abs(Math.round(playerSpeed * 3.6));
  document.getElementById('speed-num').textContent = kmh + ' km/h';
  document.getElementById('speed-fill').style.width = Math.min(kmh / 65 * 100, 100) + '%';
}

function updatePosition() {
  const playerProgress = (playerLap - 1) * 100 + (playerCheckpoint / Math.max(checkpointMeshes.length, 1)) * 100;
  const aiProgress = (aiLap - 1) * 100 + (aiWaypointIndex / Math.max(aiWaypoints.length, 1)) * 100;
  const pos = playerProgress >= aiProgress ? 1 : 2;
  document.getElementById('pos-num').textContent = pos;
}

function formatTime(ms) {
  if (!ms || ms === Infinity) return '--:--.--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// ─── Minimap ─────────────────────────────────────────────────────────────────
function updateMinimap() {
  if (!minimapCtx || !playerChair) return;
  const ctx = minimapCtx;
  const W = 140, H = 140;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  const scale = 1.4;
  const ox = W / 2, oy = H / 2;

  // Draw track segments
  ctx.fillStyle = '#2a2a3a';
  for (const seg of trackLayout) {
    if (seg.type === 'floor') {
      const x = ox + seg.cx * scale / 4;
      const y = oy + seg.cz * scale / 4;
      ctx.fillRect(x - seg.hw * scale / 4, y - seg.hd * scale / 4, seg.hw * scale / 2, seg.hd * scale / 2);
    }
  }

  // AI dot
  if (aiChair) {
    const ax = ox + aiChair.position.x * scale / 4;
    const ay = oy + aiChair.position.z * scale / 4;
    ctx.fillStyle = '#ff6b35';
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Player dot
  const px = ox + playerChair.position.x * scale / 4;
  const py = oy + playerChair.position.z * scale / 4;
  ctx.fillStyle = '#00d4ff';
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
}

// ─── Material helpers ─────────────────────────────────────────────────────────
function mat(name, r, g, b, scene, metallic = 0, roughness = 0.8) {
  const m = new BABYLON.PBRMaterial(name, scene);
  m.albedoColor = new BABYLON.Color3(r, g, b);
  m.metallic = metallic;
  m.roughness = roughness;
  return m;
}

function box(name, w, h, d, x, y, z, scene, material) {
  const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  b.position.set(x, y, z);
  b.material = material;
  b.receiveShadows = true;
  return b;
}

// ─── Office Chair mesh ────────────────────────────────────────────────────────
function createChairMesh(name, scene, color) {
  const root = new BABYLON.TransformNode(name, scene);

  // Seat
  const seatMat = mat(name + '_seat', color.r, color.g, color.b, scene, 0.1, 0.7);
  const seat = BABYLON.MeshBuilder.CreateBox('seat', { width: 0.9, height: 0.12, depth: 0.9 }, scene);
  seat.position.y = 0.56;
  seat.material = seatMat;
  seat.parent = root;

  // Back rest
  const back = BABYLON.MeshBuilder.CreateBox('back', { width: 0.85, height: 0.8, depth: 0.1 }, scene);
  back.position.set(0, 1.0, -0.4);
  back.material = seatMat;
  back.parent = root;

  // Cushion
  const cushMat = mat(name + '_cush', color.r * 0.7, color.g * 0.7, color.b * 0.7, scene, 0, 0.9);
  const cushion = BABYLON.MeshBuilder.CreateBox('cush', { width: 0.8, height: 0.08, depth: 0.8 }, scene);
  cushion.position.y = 0.64;
  cushion.material = cushMat;
  cushion.parent = root;

  // Arm rests
  const armMat = mat(name + '_arm', 0.15, 0.15, 0.15, scene, 0.3, 0.6);
  [-0.5, 0.5].forEach(side => {
    const arm = BABYLON.MeshBuilder.CreateBox('arm', { width: 0.08, height: 0.08, depth: 0.7 }, scene);
    arm.position.set(side, 0.72, 0);
    arm.material = armMat;
    arm.parent = root;
    const vpost = BABYLON.MeshBuilder.CreateBox('vpost', { width: 0.06, height: 0.2, depth: 0.06 }, scene);
    vpost.position.set(side, 0.62, 0.2);
    vpost.material = armMat;
    vpost.parent = root;
  });

  // Central column
  const colMat = mat(name + '_col', 0.6, 0.6, 0.6, scene, 0.9, 0.3);
  const col = BABYLON.MeshBuilder.CreateCylinder('col', { height: 0.5, diameter: 0.08 }, scene);
  col.position.y = 0.25;
  col.material = colMat;
  col.parent = root;

  // Base star
  const baseMat = mat(name + '_base', 0.2, 0.2, 0.2, scene, 0.8, 0.4);
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const spoke = BABYLON.MeshBuilder.CreateBox('spoke', { width: 0.06, height: 0.04, depth: 0.4 }, scene);
    spoke.position.set(Math.sin(angle) * 0.2, 0.04, Math.cos(angle) * 0.2);
    spoke.rotation.y = angle;
    spoke.material = baseMat;
    spoke.parent = root;

    const wheel = BABYLON.MeshBuilder.CreateCylinder('wheel', { height: 0.06, diameter: 0.12 }, scene);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(Math.sin(angle) * 0.38, 0.06, Math.cos(angle) * 0.38);
    wheel.material = baseMat;
    wheel.parent = root;
  }

  // Worker character (simplified)
  const skinMat = mat(name + '_skin', 0.9, 0.75, 0.6, scene, 0, 0.9);
  const shirtColors = [
    [0.2, 0.3, 0.7], [0.7, 0.2, 0.2], [0.2, 0.6, 0.3], [0.5, 0.2, 0.6]
  ];
  const sc = shirtColors[Math.floor(Math.random() * shirtColors.length)];
  const shirtMat = mat(name + '_shirt', sc[0], sc[1], sc[2], scene, 0, 0.8);
  const pantsMat = mat(name + '_pants', 0.15, 0.15, 0.25, scene, 0, 0.9);

  // Torso
  const torso = BABYLON.MeshBuilder.CreateBox('torso', { width: 0.5, height: 0.55, depth: 0.3 }, scene);
  torso.position.y = 1.2;
  torso.material = shirtMat;
  torso.parent = root;

  // Head
  const head = BABYLON.MeshBuilder.CreateSphere('head', { diameter: 0.35 }, scene);
  head.position.y = 1.7;
  head.material = skinMat;
  head.parent = root;

  // Hair
  const hairMat = mat(name + '_hair', 0.2, 0.15, 0.1, scene, 0, 1);
  const hair = BABYLON.MeshBuilder.CreateSphere('hair', { diameter: 0.36, slice: 0.5 }, scene);
  hair.position.y = 1.85;
  hair.material = hairMat;
  hair.parent = root;

  // Arms gripping
  [-0.38, 0.38].forEach((side, idx) => {
    const arm = BABYLON.MeshBuilder.CreateBox('arm', { width: 0.14, height: 0.4, depth: 0.14 }, scene);
    arm.position.set(side, 1.05, 0);
    arm.rotation.z = side < 0 ? 0.3 : -0.3;
    arm.material = shirtMat;
    arm.parent = root;

    const hand = BABYLON.MeshBuilder.CreateSphere('hand', { diameter: 0.16 }, scene);
    hand.position.set(side * 1.1, 0.85, 0.2);
    hand.material = skinMat;
    hand.parent = root;
  });

  // Legs
  [-0.18, 0.18].forEach(side => {
    const leg = BABYLON.MeshBuilder.CreateBox('leg', { width: 0.18, height: 0.35, depth: 0.18 }, scene);
    leg.position.set(side, 0.8, 0.15);
    leg.material = pantsMat;
    leg.parent = root;

    const shoe = BABYLON.MeshBuilder.CreateBox('shoe', { width: 0.16, height: 0.1, depth: 0.25 }, scene);
    shoe.position.set(side, 0.62, 0.25);
    shoe.material = mat(name + '_shoe', 0.1, 0.1, 0.1, scene, 0.2, 0.8);
    shoe.parent = root;
  });

  return root;
}

// ─── Floor tile helper ────────────────────────────────────────────────────────
function createFloor(name, w, d, x, z, scene, material) {
  const f = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: 0.2, depth: d }, scene);
  f.position.set(x, -0.1, z);
  f.material = material;
  f.receiveShadows = true;
  trackLayout.push({ type: 'floor', cx: x, cz: z, hw: w / 2, hd: d / 2 });
  return f;
}

function createWall(name, w, h, d, x, y, z, scene, material) {
  const wall = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
  wall.position.set(x, y, z);
  wall.material = material;
  wall.receiveShadows = true;
  trackLayout.push({ type: 'wall', cx: x, cz: z, hw: w / 2, hd: d / 2 });
  return wall;
}

// ─── TRACK 0: Cubicle Canyon ──────────────────────────────────────────────────
function buildCubicleCanyonTrack(scene, shadowGen) {
  trackLayout = [];
  checkpointMeshes = [];
  aiWaypoints = [];

  scene.fogColor = new BABYLON.Color3(0.85, 0.9, 1.0);
  scene.clearColor = new BABYLON.Color4(0.85, 0.9, 1.0, 1);

  const floorMat = mat('floor', 0.75, 0.75, 0.78, scene, 0, 0.95);
  const wallMat = mat('wall', 0.88, 0.88, 0.9, scene, 0, 0.8);
  const cubMat = mat('cub', 0.6, 0.55, 0.5, scene, 0, 0.9);
  const ceilMat = mat('ceil', 0.95, 0.95, 0.95, scene, 0, 1);
  const accentMat = mat('accent', 0.2, 0.5, 0.9, scene, 0.1, 0.7);

  // Track is a figure-8 style loop through cubicle rows
  // Outer bounds
  trackLayout.push({ type: 'bounds', minX: -35, maxX: 35, minZ: -42, maxZ: 42 });

  // Floor sections
  createFloor('f1', 70, 84, 0, 0, scene, floorMat);

  // Ceiling
  const ceil = BABYLON.MeshBuilder.CreateBox('ceil', { width: 70, height: 0.3, depth: 84 }, scene);
  ceil.position.set(0, 3.5, 0);
  ceil.material = ceilMat;

  // Outer walls
  createWall('wN', 70, 4, 0.5, 0, 2, -42, scene, wallMat);
  createWall('wS', 70, 4, 0.5, 0, 2, 42, scene, wallMat);
  createWall('wE', 0.5, 4, 84, 0, 2, 35, scene, wallMat);
  createWall('wW', 0.5, 4, 84, 0, 2, -35, scene, wallMat);

  // Cubicle dividers – create rows
  const divH = 1.5;
  // Row 1 (left corridor)
  for (let z = -36; z < 36; z += 6) {
    createWall('cd' + z, 8, divH, 0.15, -18, divH / 2, z, scene, cubMat);
    // Desk inside cubicle
    const desk = BABYLON.MeshBuilder.CreateBox('desk', { width: 1.8, height: 0.6, depth: 0.9 }, scene);
    desk.position.set(-20, 0.3, z + 1);
    desk.material = mat('desk', 0.6, 0.48, 0.38, scene, 0, 0.9);
    // Monitor
    const mon = BABYLON.MeshBuilder.CreateBox('mon', { width: 0.6, height: 0.5, depth: 0.05 }, scene);
    mon.position.set(-20.3, 0.85, z + 1.2);
    mon.material = mat('mon', 0.1, 0.1, 0.1, scene, 0.5, 0.4);
  }

  // Row 2 (right corridor)
  for (let z = -33; z < 36; z += 6) {
    createWall('cd2_' + z, 8, divH, 0.15, 18, divH / 2, z, scene, cubMat);
    const desk = BABYLON.MeshBuilder.CreateBox('desk2', { width: 1.8, height: 0.6, depth: 0.9 }, scene);
    desk.position.set(20, 0.3, z + 1);
    desk.material = mat('desk2', 0.6, 0.48, 0.38, scene, 0, 0.9);
  }

  // Center dividing wall with openings
  createWall('cmid1', 0.3, 3, 15, 0, 1.5, -28, scene, wallMat);
  createWall('cmid2', 0.3, 3, 15, 0, 1.5, -8, scene, wallMat);
  createWall('cmid3', 0.3, 3, 15, 0, 1.5, 13, scene, wallMat);
  createWall('cmid4', 0.3, 3, 15, 0, 1.5, 33, scene, wallMat);

  // Obstacle: filing cabinets
  const cabinetMat = mat('cab', 0.4, 0.5, 0.6, scene, 0.4, 0.5);
  const cabPositions = [[-10, 5], [10, -10], [-5, 20], [5, -25], [-12, -15], [12, 15]];
  cabPositions.forEach(([x, z], i) => {
    const cab = BABYLON.MeshBuilder.CreateBox('cab' + i, { width: 0.8, height: 1.3, depth: 0.5 }, scene);
    cab.position.set(x, 0.65, z);
    cab.material = cabinetMat;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 0.9, hd: 0.7 });
    shadowGen.addShadowCaster(cab);
  });

  // Accent strips on floor (race line markers)
  const linePositions = [0, -20, -35, 15, 30];
  linePositions.forEach((z, i) => {
    const line = BABYLON.MeshBuilder.CreateBox('line' + i, { width: 8, height: 0.01, depth: 0.15 }, scene);
    line.position.set(0, 0.01, z);
    line.material = accentMat;
  });

  // Overhead fluorescent lights
  for (let z = -36; z <= 36; z += 8) {
    const light = BABYLON.MeshBuilder.CreateBox('light' + z, { width: 0.2, height: 0.05, depth: 1.2 }, scene);
    light.position.set(-8, 3.45, z);
    light.material = mat('light', 1, 1, 0.9, scene, 0, 0.1);
    const light2 = light.clone('light2' + z);
    light2.position.set(8, 3.45, z);
  }

  // Plants as decorations/obstacles
  const plantMat = mat('plant', 0.15, 0.5, 0.2, scene, 0, 1);
  const potMat = mat('pot', 0.6, 0.4, 0.3, scene, 0, 0.8);
  [[-28, -10], [28, 15], [-28, 30], [28, -30]].forEach(([x, z], i) => {
    const pot = BABYLON.MeshBuilder.CreateCylinder('pot' + i, { height: 0.4, diameterTop: 0.4, diameterBottom: 0.3 }, scene);
    pot.position.set(x, 0.2, z);
    pot.material = potMat;
    const plant = BABYLON.MeshBuilder.CreateSphere('plant' + i, { diameter: 0.8 }, scene);
    plant.position.set(x, 0.8, z);
    plant.material = plantMat;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 0.6, hd: 0.6 });
  });

  // Start/Finish line
  const sfMat = mat('sf', 1, 1, 1, scene, 0, 0.5);
  for (let i = -5; i <= 5; i += 1) {
    const tile = BABYLON.MeshBuilder.CreateBox('sftile' + i, { width: 0.9, height: 0.01, depth: 1.5 }, scene);
    tile.position.set(i, 0.01, -30);
    tile.material = i % 2 === 0 ? sfMat : mat('sfb', 0, 0, 0, scene);
  }

  // Checkpoints (invisible trigger volumes)
  const cpPositions = [
    { x: 0, z: -30, finish: true },
    { x: -14, z: -10, finish: false },
    { x: -14, z: 20, finish: false },
    { x: 0, z: 38, finish: false },
    { x: 14, z: 20, finish: false },
    { x: 14, z: -10, finish: false },
  ];

  cpPositions.forEach((cp, idx) => {
    const mesh = BABYLON.MeshBuilder.CreateBox('cp' + idx, { width: 10, height: 3, depth: 1 }, scene);
    mesh.position.set(cp.x, 1.5, cp.z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    checkpointMeshes.push(mesh);
    registerCheckpoint(mesh, idx, cp.finish);
  });

  // AI waypoints (match checkpoint path)
  aiWaypoints = cpPositions.map(cp => new BABYLON.Vector3(cp.x, 0.25, cp.z));
  aiWaypointIndex = 0;

  // Spawn player and AI
  spawnChairs(scene, shadowGen, 0, -30, 2, -30);
}

// ─── TRACK 1: Open Office Chaos ───────────────────────────────────────────────
function buildOpenOfficeTrack(scene, shadowGen) {
  trackLayout = [];
  checkpointMeshes = [];
  aiWaypoints = [];

  scene.fogColor = new BABYLON.Color3(0.9, 0.92, 0.85);
  scene.clearColor = new BABYLON.Color4(0.9, 0.92, 0.85, 1);

  const concMat = mat('conc', 0.55, 0.55, 0.52, scene, 0, 0.95);
  const wallMat = mat('wall', 0.96, 0.96, 0.94, scene, 0, 0.9);
  const woodMat = mat('wood', 0.55, 0.42, 0.3, scene, 0, 0.8);
  const glassMat = mat('glass', 0.6, 0.8, 0.9, scene, 0.1, 0.1);

  trackLayout.push({ type: 'bounds', minX: -40, maxX: 40, minZ: -50, maxZ: 50 });

  // Polished concrete floor
  createFloor('f1', 80, 100, 0, 0, scene, concMat);

  // Outer glass walls (modern open office)
  createWall('wN', 80, 5, 0.4, 0, 2.5, -50, scene, glassMat);
  createWall('wS', 80, 5, 0.4, 0, 2.5, 50, scene, glassMat);
  createWall('wE', 0.4, 5, 100, 0, 2.5, 40, scene, glassMat);
  createWall('wW', 0.4, 5, 100, 0, 2.5, -40, scene, glassMat);

  // Standing desks cluster – scattered obstacles
  const deskPositions = [
    [-20, -35], [20, -35], [-20, -15], [20, -15],
    [-20, 5], [20, 5], [-20, 25], [20, 25],
    [0, -25], [0, 15],
    [-10, -45], [10, -45], [-10, 40], [10, 40],
  ];
  deskPositions.forEach(([x, z], i) => {
    const h = 0.9 + Math.random() * 0.3;
    const desk = BABYLON.MeshBuilder.CreateBox('sd' + i, { width: 1.6, height: h, depth: 0.7 }, scene);
    desk.position.set(x, h / 2, z);
    desk.material = woodMat;
    shadowGen.addShadowCaster(desk);
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 1.2, hd: 0.8 });

    // Monitor on desk
    const mon = BABYLON.MeshBuilder.CreateBox('mon' + i, { width: 0.55, height: 0.4, depth: 0.05 }, scene);
    mon.position.set(x, h + 0.2, z - 0.1);
    mon.material = mat('mon', 0.05, 0.05, 0.05, scene, 0.6, 0.3);
  });

  // Whiteboards as dividers
  const wbMat = mat('wb', 0.97, 0.97, 0.97, scene, 0, 0.5);
  const wbFrameMat = mat('wbf', 0.2, 0.2, 0.2, scene, 0.5, 0.5);
  [[-5, -40, true], [5, -5, true], [-5, 35, true], [5, 10, false]].forEach(([x, z, vert], i) => {
    const wb = BABYLON.MeshBuilder.CreateBox('wb' + i, {
      width: vert ? 0.1 : 3, height: 1.8, depth: vert ? 3 : 0.1
    }, scene);
    wb.position.set(x, 0.9, z);
    wb.material = wbMat;
    const frame = BABYLON.MeshBuilder.CreateBox('wbf' + i, {
      width: vert ? 0.15 : 3.2, height: 1.85, depth: vert ? 3.2 : 0.15
    }, scene);
    frame.position.set(x, 0.9, z);
    frame.material = wbFrameMat;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: vert ? 0.5 : 2, hd: vert ? 2 : 0.5 });
  });

  // Bean bag / lounge area obstacles
  const bbMat = mat('bb', 0.8, 0.2, 0.4, scene, 0, 0.9);
  [[-30, 40], [30, -40], [-30, -20], [30, 20]].forEach(([x, z], i) => {
    const bb = BABYLON.MeshBuilder.CreateSphere('bb' + i, { diameter: 1.2 }, scene);
    bb.position.set(x, 0.6, z);
    bb.material = bbMat;
    bb.scaling.y = 0.6;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 0.8, hd: 0.8 });
  });

  // Exposed ductwork on ceiling
  const ductMat = mat('duct', 0.5, 0.5, 0.5, scene, 0.7, 0.4);
  for (let z = -45; z <= 45; z += 10) {
    const duct = BABYLON.MeshBuilder.CreateBox('duct' + z, { width: 0.6, height: 0.4, depth: 10 }, scene);
    duct.position.set(-15, 4.2, z);
    duct.material = ductMat;
    const duct2 = duct.clone('duct2' + z);
    duct2.position.set(15, 4.2, z);
  }

  // Start/finish
  const sfMat = mat('sf', 1, 1, 1, scene);
  for (let i = -6; i <= 6; i++) {
    const t = BABYLON.MeshBuilder.CreateBox('sft' + i, { width: 0.9, height: 0.01, depth: 1.5 }, scene);
    t.position.set(i, 0.01, -38);
    t.material = i % 2 === 0 ? sfMat : mat('sfb', 0.1, 0.1, 0.1, scene);
  }

  // Checkpoints
  const cpData = [
    { x: 0, z: -38, finish: true },
    { x: -28, z: -30, finish: false },
    { x: -28, z: 0, finish: false },
    { x: -28, z: 35, finish: false },
    { x: 0, z: 45, finish: false },
    { x: 28, z: 35, finish: false },
    { x: 28, z: 0, finish: false },
    { x: 28, z: -30, finish: false },
  ];

  cpData.forEach((cp, idx) => {
    const mesh = BABYLON.MeshBuilder.CreateBox('cp' + idx, { width: 12, height: 4, depth: 1 }, scene);
    mesh.position.set(cp.x, 2, cp.z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    checkpointMeshes.push(mesh);
    registerCheckpoint(mesh, idx, cp.finish);
  });

  aiWaypoints = cpData.map(cp => new BABYLON.Vector3(cp.x, 0.25, cp.z));

  spawnChairs(scene, shadowGen, 0, -38, 2, -38);
}

// ─── TRACK 2: Executive Suite ─────────────────────────────────────────────────
function buildExecutiveSuiteTrack(scene, shadowGen) {
  trackLayout = [];
  checkpointMeshes = [];
  aiWaypoints = [];

  scene.fogColor = new BABYLON.Color3(0.15, 0.12, 0.1);
  scene.clearColor = new BABYLON.Color4(0.15, 0.12, 0.1, 1);
  scene.fogStart = 40;
  scene.fogEnd = 90;

  const mahoganyMat = mat('mah', 0.35, 0.18, 0.1, scene, 0.1, 0.4);
  const marbleMat = mat('marble', 0.88, 0.86, 0.82, scene, 0.2, 0.3);
  const goldMat = mat('gold', 0.83, 0.68, 0.21, scene, 0.9, 0.2);
  const darkWallMat = mat('dwall', 0.22, 0.18, 0.15, scene, 0, 0.7);
  const carpetMat = mat('carpet', 0.35, 0.25, 0.45, scene, 0, 0.99);

  trackLayout.push({ type: 'bounds', minX: -30, maxX: 30, minZ: -45, maxZ: 45 });

  createFloor('f1', 60, 90, 0, 0, scene, marbleMat);

  // Dark paneled walls
  createWall('wN', 60, 5, 0.5, 0, 2.5, -45, scene, darkWallMat);
  createWall('wS', 60, 5, 0.5, 0, 2.5, 45, scene, darkWallMat);
  createWall('wE', 0.5, 5, 90, 0, 2.5, 30, scene, darkWallMat);
  createWall('wW', 0.5, 5, 90, 0, 2.5, -30, scene, darkWallMat);

  // Gold trim baseboards
  [-45, 45].forEach(z => {
    const trim = BABYLON.MeshBuilder.CreateBox('trimN' + z, { width: 60, height: 0.15, depth: 0.2 }, scene);
    trim.position.set(0, 0.08, z - (z < 0 ? -0.3 : 0.3));
    trim.material = goldMat;
  });

  // Boardroom table (big obstacle)
  const table = BABYLON.MeshBuilder.CreateBox('btable', { width: 6, height: 0.15, depth: 14 }, scene);
  table.position.set(0, 0.8, 0);
  table.material = mahoganyMat;
  shadowGen.addShadowCaster(table);
  trackLayout.push({ type: 'wall', cx: 0, cz: 0, hw: 3.5, hd: 7.5 });

  // Boardroom chairs around table
  const bcMat = mat('bchair', 0.1, 0.08, 0.06, scene, 0.2, 0.7);
  const chairPositions = [];
  for (let z = -5; z <= 5; z += 2.5) {
    chairPositions.push([-4.5, z], [4.5, z]);
  }
  chairPositions.push([0, -8.5], [0, 8.5]);
  chairPositions.forEach(([x, z], i) => {
    const bc = BABYLON.MeshBuilder.CreateBox('bc' + i, { width: 0.6, height: 1.0, depth: 0.6 }, scene);
    bc.position.set(x, 0.5, z);
    bc.material = bcMat;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 0.5, hd: 0.5 });
  });

  // Executive desks (side offices)
  [[-22, -30], [22, -30], [-22, 30], [22, 30]].forEach(([x, z], i) => {
    const d = BABYLON.MeshBuilder.CreateBox('exdesk' + i, { width: 4, height: 0.8, depth: 2 }, scene);
    d.position.set(x, 0.4, z);
    d.material = mahoganyMat;
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 2.5, hd: 1.5 });

    // Trophy on desk
    const trophy = BABYLON.MeshBuilder.CreateCylinder('trophy' + i, { height: 0.6, diameterTop: 0.15, diameterBottom: 0.25 }, scene);
    trophy.position.set(x + 1, 1.1, z);
    trophy.material = goldMat;

    // Nameplate
    const plate = BABYLON.MeshBuilder.CreateBox('plate' + i, { width: 0.6, height: 0.05, depth: 0.2 }, scene);
    plate.position.set(x - 0.5, 0.83, z - 0.8);
    plate.material = goldMat;
  });

  // Carpet runner down corridor
  const carpetL = BABYLON.MeshBuilder.CreateBox('carpL', { width: 3, height: 0.01, depth: 60 }, scene);
  carpetL.position.set(-14, 0.01, 0);
  carpetL.material = carpetMat;
  const carpetR = carpetL.clone('carpR');
  carpetR.position.set(14, 0.01, 0);

  // Pillars
  const pillarMat = mat('pil', 0.75, 0.72, 0.68, scene, 0.3, 0.4);
  [[-20, -20], [20, -20], [-20, 20], [20, 20], [-20, 0], [20, 0]].forEach(([x, z], i) => {
    const pil = BABYLON.MeshBuilder.CreateCylinder('pil' + i, { height: 5, diameter: 0.9 }, scene);
    pil.position.set(x, 2.5, z);
    pil.material = pillarMat;
    shadowGen.addShadowCaster(pil);
    trackLayout.push({ type: 'wall', cx: x, cz: z, hw: 0.8, hd: 0.8 });

    // Gold cap
    const cap = BABYLON.MeshBuilder.CreateCylinder('cap' + i, { height: 0.2, diameter: 1.1 }, scene);
    cap.position.set(x, 5, z);
    cap.material = goldMat;
  });

  // Crystal chandeliers
  const crystalMat = mat('crys', 0.9, 0.95, 1.0, scene, 0.0, 0.0);
  [[-10, -30], [10, -30], [-10, 30], [10, 30], [0, 0]].forEach(([x, z], i) => {
    const ch = BABYLON.MeshBuilder.CreateSphere('ch' + i, { diameter: 0.8 }, scene);
    ch.position.set(x, 4.5, z);
    ch.material = crystalMat;
    ch.scaling.y = 1.5;
    const pl = new BABYLON.PointLight('pl' + i, new BABYLON.Vector3(x, 4, z), scene);
    pl.intensity = 0.5;
    pl.diffuse = new BABYLON.Color3(1.0, 0.92, 0.75);
    pl.range = 15;
  });

  // Start/finish line
  const sfMat = mat('sf', 0.9, 0.9, 0.9, scene);
  for (let i = -4; i <= 4; i++) {
    const t = BABYLON.MeshBuilder.CreateBox('sft' + i, { width: 0.9, height: 0.01, depth: 1.5 }, scene);
    t.position.set(i, 0.01, -38);
    t.material = i % 2 === 0 ? sfMat : goldMat;
  }

  // Checkpoints – tighter course
  const cpData = [
    { x: 0, z: -38, finish: true },
    { x: -20, z: -35, finish: false },
    { x: -20, z: -10, finish: false },
    { x: -20, z: 15, finish: false },
    { x: -20, z: 38, finish: false },
    { x: 0, z: 42, finish: false },
    { x: 20, z: 38, finish: false },
    { x: 20, z: 15, finish: false },
    { x: 20, z: -10, finish: false },
    { x: 20, z: -35, finish: false },
  ];

  cpData.forEach((cp, idx) => {
    const mesh = BABYLON.MeshBuilder.CreateBox('cp' + idx, { width: 8, height: 4, depth: 1 }, scene);
    mesh.position.set(cp.x, 2, cp.z);
    mesh.isVisible = false;
    mesh.isPickable = false;
    checkpointMeshes.push(mesh);
    registerCheckpoint(mesh, idx, cp.finish);
  });

  aiWaypoints = cpData.map(cp => new BABYLON.Vector3(cp.x, 0.25, cp.z));

  spawnChairs(scene, shadowGen, 0, -38, 2, -38);
}

// ─── Spawn chairs ────────────────────────────────────────────────────────────
function spawnChairs(scene, shadowGen, px, pz, ax, az) {
  // Player chair (blue)
  playerChair = createChairMesh('player', scene, { r: 0.15, g: 0.4, b: 0.85 });
  playerChair.position.set(px - 1.5, 0.25, pz);
  playerChair.rotation.y = 0;

  // AI chair (red/orange)
  aiChair = createChairMesh('ai', scene, { r: 0.9, g: 0.3, b: 0.1 });
  aiChair.position.set(ax + 1.5, 0.25, az);
  aiChair.rotation.y = 0;

  // Shadows for all child meshes
  [playerChair, aiChair].forEach(root => {
    scene.meshes.forEach(m => {
      if (m.parent === root) {
        shadowGen.addShadowCaster(m);
        m.receiveShadows = true;
      }
    });
  });

  camera.lockedTarget = playerChair;
}
