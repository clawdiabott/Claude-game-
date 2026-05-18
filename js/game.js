// ── Chair GP – game.js ────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const engine = new BABYLON.Engine(canvas, true);

// ── State ─────────────────────────────────────────────────────────────────────
let scene, camera;
let playerRoot, aiRoot;
let playerLegs = {}, aiLegs = {};
let legPhase = 0, aiLegPhase = 0;
let currentTrack = 0;
let gameRunning = false, raceFinished = false;
let raceStart = 0, lapStart = 0;
let playerLap = 1, aiLap = 1;
let playerCP = 0, aiCP = 0;
let passedCPs = [];
let bestLap = Infinity;
let totalLaps = 3;
let keys = {};
let playerSpeed = 0, aiSpeed = 0;
let playerOnRoad = true;
let trackCenterLine = [];   // smooth spline points
let cpData = [];
let aiWPIdx = 0;
let mmCtx;

// ── Menu ──────────────────────────────────────────────────────────────────────
function selTrack(i) {
  currentTrack = i;
  document.querySelectorAll('.tc').forEach(c => c.classList.remove('sel'));
  document.querySelector(`[data-t="${i}"]`).classList.add('sel');
}
function startGame() {
  document.getElementById('menu').style.display = 'none';
  initScene();
  countdown();
}
function restartRace() {
  document.getElementById('fin').style.display = 'none';
  engine.stopRenderLoop(); scene.dispose(); initScene(); countdown();
}
function backMenu() {
  document.getElementById('fin').style.display = 'none';
  engine.stopRenderLoop(); scene.dispose();
  document.getElementById('menu').style.display = 'flex';
  ['hud','pos-box','spd-box','mm-wrap'].forEach(id => document.getElementById(id).style.display = 'none');
}
function showHUD() {
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('pos-box').style.display = 'block';
  document.getElementById('spd-box').style.display = 'block';
  document.getElementById('mm-wrap').style.display = 'block';
}
function countdown() {
  gameRunning = false;
  const el = document.getElementById('cd');
  const num = document.getElementById('cdn');
  el.style.opacity = '1';
  let c = 3; num.textContent = c; num.style.color = '#fff';
  const t = setInterval(() => {
    c--;
    if (c > 0) { num.textContent = c; }
    else if (c === 0) { num.textContent = 'GO!'; num.style.color = '#00ff88'; }
    else {
      clearInterval(t); el.style.opacity = '0';
      gameRunning = true;
      raceStart = lapStart = performance.now();
    }
  }, 1000);
}

// ── Scene ─────────────────────────────────────────────────────────────────────
function initScene() {
  playerSpeed = 0; aiSpeed = 0; legPhase = 0; aiLegPhase = 0;
  playerLap = 1; aiLap = 1; playerCP = 0; aiCP = 0;
  passedCPs = []; bestLap = Infinity; raceFinished = false;
  playerLegs = {}; aiLegs = {}; trackCenterLine = []; cpData = []; aiWPIdx = 0;

  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.55, 0.6, 0.65, 1);
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogStart = 55; scene.fogEnd = 110;

  // Lighting – office interior feel
  const amb = new BABYLON.HemisphericLight('amb', new BABYLON.Vector3(0,1,0), scene);
  amb.intensity = 0.55;
  amb.diffuse = new BABYLON.Color3(0.95, 0.92, 0.88);
  amb.groundColor = new BABYLON.Color3(0.3, 0.3, 0.35);

  const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.5,-1,-0.3), scene);
  dir.intensity = 0.75;
  dir.position = new BABYLON.Vector3(20, 40, 20);
  const shadows = new BABYLON.ShadowGenerator(2048, dir);
  shadows.useBlurExponentialShadowMap = true;

  // Follow camera – behind and above player, well below ceiling
  camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0, 4, -14), scene);
  camera.radius = 13;
  camera.heightOffset = 4.2;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.06;
  camera.maxCameraSpeed = 22;
  camera.maxZ = 300;
  camera.fov = 1.05;

  mmCtx = document.getElementById('mm').getContext('2d');

  const tracks = [buildCubicleCanyon, buildOpenOffice, buildExecutiveSuite];
  tracks[currentTrack](scene, shadows);

  // Post-processing: bloom + contrast + slight vignette
  if (BABYLON.DefaultRenderingPipeline) {
    const pipeline = new BABYLON.DefaultRenderingPipeline('pp', true, scene, [camera]);
    pipeline.bloomEnabled = true;
    pipeline.bloomThreshold = 0.72;
    pipeline.bloomWeight = 0.28;
    pipeline.bloomKernel = 64;
    pipeline.bloomScale = 0.5;
    pipeline.imageProcessingEnabled = true;
    pipeline.imageProcessing.contrast = 1.18;
    pipeline.imageProcessing.exposure = 1.05;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.2;
    pipeline.imageProcessing.vignetteColor = new BABYLON.Color4(0,0,0,0);
    pipeline.imageProcessing.toneMappingEnabled = true;
    pipeline.fxaaEnabled = true;
    pipeline.samples = 4;
  }

  showHUD();
  updateHUD(0,1);

  window.onkeydown = e => { keys[e.code] = true; if(e.code==='Space') e.preventDefault(); };
  window.onkeyup   = e => { keys[e.code] = false; };

  engine.runRenderLoop(() => {
    const dt = engine.getDeltaTime() / 1000;
    if (gameRunning && !raceFinished) {
      updatePlayer(dt);
      updateAI(dt);
      updateHUD(performance.now() - raceStart, playerLap);
      drawMinimap();
      updatePosition();
    }
    scene.render();
  });
  window.onresize = () => engine.resize();
}

// ── Road mesh from centerline points ──────────────────────────────────────────
function buildRoad(rawPts, w, scene) {
  // Catmull-Rom smooth
  const curve = BABYLON.Curve3.CreateCatmullRomSpline(rawPts, 12, true);
  const pts = curve.getPoints();
  trackCenterLine = pts;

  const pos = [], idx = [], uvs = [], nrm = [];

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const n = pts[(i + 1) % pts.length];
    const tang = n.subtract(p);
    tang.y = 0;
    if (tang.length() < 0.0001) tang.x = 0.001;
    tang.normalize();
    const right = new BABYLON.Vector3(tang.z, 0, -tang.x);

    const L = p.add(right.scale(-w * 0.5));
    const R = p.add(right.scale( w * 0.5));

    pos.push(L.x, 0.02, L.z, R.x, 0.02, R.z);
    uvs.push(0, i * 0.25, 1, i * 0.25);
    nrm.push(0,1,0, 0,1,0);
    if (i < pts.length - 1) {
      const b = i * 2;
      idx.push(b, b+2, b+1, b+1, b+2, b+3);
    }
  }
  const last = (pts.length - 1) * 2;
  idx.push(last, 0, last+1, last+1, 0, 1);

  const mesh = new BABYLON.Mesh('road', scene);
  const vd = new BABYLON.VertexData();
  vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uvs;
  vd.applyToMesh(mesh);
  mesh.receiveShadows = true;

  // Road material – dark asphalt
  const rm = new BABYLON.PBRMaterial('roadmat', scene);
  rm.albedoColor = new BABYLON.Color3(0.18, 0.18, 0.19);
  rm.metallic = 0; rm.roughness = 0.95;
  mesh.material = rm;

  // Center dashed line
  buildRoadMarkings(pts, w, scene);
  // Barriers
  buildBarriers(pts, w, scene);

  return pts;
}

function buildRoadMarkings(pts, w, scene) {
  const dashMat = new BABYLON.PBRMaterial('dash', scene);
  dashMat.albedoColor = new BABYLON.Color3(0.95, 0.9, 0.1);
  dashMat.metallic = 0; dashMat.roughness = 0.8;

  const edgeMat = new BABYLON.PBRMaterial('edge', scene);
  edgeMat.albedoColor = new BABYLON.Color3(0.95, 0.95, 0.95);
  edgeMat.metallic = 0; edgeMat.roughness = 0.8;

  for (let i = 0; i < pts.length; i += 6) {
    const p = pts[i];
    const n = pts[Math.min(i+3, pts.length-1)];
    const mid = p.add(n).scale(0.5);
    const tang = n.subtract(p); tang.y = 0; tang.normalize();
    const right = new BABYLON.Vector3(tang.z, 0, -tang.x);
    const len = BABYLON.Vector3.Distance(p, n) + 0.01;
    const angle = Math.atan2(tang.x, tang.z);

    // Center dash
    const dash = BABYLON.MeshBuilder.CreateBox('d'+i, {width:0.18, height:0.01, depth:len*0.5}, scene);
    dash.position.set(mid.x, 0.03, mid.z);
    dash.rotation.y = angle;
    dash.material = dashMat;

    // Edge lines
    [-1,1].forEach(side => {
      const ep = mid.add(right.scale(side * (w*0.5 - 0.25)));
      const el = BABYLON.MeshBuilder.CreateBox('el'+i+side, {width:0.12, height:0.01, depth:len*1.05}, scene);
      el.position.set(ep.x, 0.03, ep.z);
      el.rotation.y = angle;
      el.material = edgeMat;
    });
  }
}

function buildBarriers(pts, w, scene) {
  const redMat = new BABYLON.PBRMaterial('bR', scene);
  redMat.albedoColor = new BABYLON.Color3(0.85, 0.1, 0.1);
  redMat.metallic = 0.1; redMat.roughness = 0.5;

  const whtMat = new BABYLON.PBRMaterial('bW', scene);
  whtMat.albedoColor = new BABYLON.Color3(0.95, 0.95, 0.95);
  whtMat.metallic = 0.1; whtMat.roughness = 0.5;

  const half = w * 0.5 + 0.4;

  for (let i = 0; i < pts.length; i += 4) {
    const p = pts[i];
    const n = pts[Math.min(i+2, pts.length-1)];
    const mid = p.add(n).scale(0.5);
    const tang = n.subtract(p); tang.y = 0; tang.normalize();
    const right = new BABYLON.Vector3(tang.z, 0, -tang.x);
    const len = BABYLON.Vector3.Distance(p, n) + 0.05;
    const angle = Math.atan2(tang.x, tang.z);
    const mat = (i/4) % 2 === 0 ? redMat : whtMat;

    [-1, 1].forEach(side => {
      const bp = mid.add(right.scale(side * half));
      const b = BABYLON.MeshBuilder.CreateBox('bar'+i+side, {width:0.3, height:0.55, depth:len}, scene);
      b.position.set(bp.x, 0.28, bp.z);
      b.rotation.y = angle;
      b.material = mat;
      b.receiveShadows = true;
    });
  }
}

// ── Is player on road? ────────────────────────────────────────────────────────
function onRoad(pos, roadHalfWidth) {
  if (!trackCenterLine.length) return true;
  let best = Infinity;
  for (let i = 0; i < trackCenterLine.length; i++) {
    const p = trackCenterLine[i];
    const d = Math.sqrt((pos.x-p.x)**2 + (pos.z-p.z)**2);
    if (d < best) best = d;
  }
  return best < roadHalfWidth;
}

// ── Office chair mesh ─────────────────────────────────────────────────────────
function pbr(r,g,b,met,rou,scene) {
  const m = new BABYLON.PBRMaterial('m'+Math.random(), scene);
  m.albedoColor = new BABYLON.Color3(r,g,b);
  m.metallic = met; m.roughness = rou; return m;
}

function createWorkerChair(id, scene, seatColor, shirtHex) {
  const root = new BABYLON.TransformNode(id, scene);
  const refs = {};

  const seatMat  = pbr(...seatColor, 0.05, 0.85, scene);
  const armMat   = pbr(0.12,0.12,0.12, 0.4, 0.5, scene);
  const metalMat = pbr(0.65,0.65,0.67, 0.9, 0.25, scene);
  const skinMat  = pbr(0.92,0.76,0.62, 0,   0.95, scene);
  const shirtMat = pbr(...shirtHex,   0,   0.85, scene);
  const pantsMat = pbr(0.18,0.18,0.28, 0,   0.9, scene);
  const shoeMat  = pbr(0.1, 0.1, 0.1,  0.2, 0.8, scene);
  const hairMat  = pbr(0.2, 0.15,0.1,  0,   1,   scene);
  const wheelMat = pbr(0.15,0.15,0.15, 0.3, 0.7, scene);

  const mk = (name, opt) => { const b = BABYLON.MeshBuilder.CreateBox(name+id, opt, scene); b.parent=root; b.receiveShadows=true; return b; };
  const cyl = (name, opt) => { const c = BABYLON.MeshBuilder.CreateCylinder(name+id, opt, scene); c.parent=root; return c; };
  const sph = (name, opt) => { const s = BABYLON.MeshBuilder.CreateSphere(name+id, opt, scene); s.parent=root; return s; };

  // ── Chair ──
  // Seat base
  const seat = mk('seat', {width:0.92,height:0.1,depth:0.9}); seat.position.y=0.5; seat.material=seatMat;
  const cushion = mk('cush', {width:0.82,height:0.07,depth:0.8}); cushion.position.y=0.56; cushion.material=seatMat;

  // Backrest
  const back = mk('back', {width:0.88,height:0.78,depth:0.09}); back.position.set(0,0.96,-0.41); back.material=seatMat;
  const backPad = mk('bpad', {width:0.78,height:0.66,depth:0.06}); backPad.position.set(0,0.97,-0.38); backPad.material=seatMat;

  // Armrests
  [-0.52,0.52].forEach((x,i) => {
    const vp = mk('avp'+i, {width:0.06,height:0.22,depth:0.06}); vp.position.set(x,0.56,0.18); vp.material=armMat;
    const ar = mk('ar'+i,  {width:0.06,height:0.06,depth:0.6});  ar.position.set(x,0.67,0.02); ar.material=armMat;
    const pad = mk('arp'+i,{width:0.1, height:0.04,depth:0.55}); pad.position.set(x,0.7,0.02);  pad.material=seatMat;
  });

  // Central column
  const col = cyl('col', {height:0.48,diameter:0.07}); col.position.y=0.25; col.material=metalMat;
  // Pneumatic cylinder highlight
  const pneu = cyl('pneu', {height:0.22,diameter:0.05}); pneu.position.y=0.4; pneu.material=pbr(0.8,0.8,0.82,0.9,0.2,scene);

  // Star base (5 arms)
  for (let i=0; i<5; i++) {
    const a = (i/5)*Math.PI*2;
    const arm = mk('barm'+i, {width:0.05,height:0.04,depth:0.38}); arm.position.set(Math.sin(a)*0.19,0.03,Math.cos(a)*0.19); arm.rotation.y=a; arm.material=metalMat;
    const whl = cyl('whl'+i, {height:0.055,diameter:0.11}); whl.rotation.x=Math.PI/2; whl.position.set(Math.sin(a)*0.37,0.055,Math.cos(a)*0.37); whl.material=wheelMat;
  }

  // ── Worker ──
  // Torso
  const torso = mk('torso', {width:0.48,height:0.52,depth:0.28}); torso.position.y=1.14; torso.material=shirtMat;
  // Collar
  const collar = mk('collar', {width:0.22,height:0.1,depth:0.2}); collar.position.y=1.42; collar.material=shirtMat;
  // Neck
  const neck = mk('neck', {width:0.14,height:0.12,depth:0.14}); neck.position.y=1.52; neck.material=skinMat;
  // Head
  const head = sph('head', {diameter:0.34, segments:10}); head.position.y=1.72; head.material=skinMat;
  // Hair
  const hair = sph('hair', {diameter:0.35, segments:8}); hair.position.y=1.83; hair.material=hairMat; hair.scaling.y=0.55;
  // Face features (eyes as dark spots)
  [-0.07,0.07].forEach((x,i) => {
    const eye = sph('eye'+i, {diameter:0.04}); eye.position.set(x,1.73,0.155); eye.material=pbr(0.05,0.05,0.08,0,0.9,scene);
  });

  // Upper arms
  [-0.32,0.32].forEach((x,i) => {
    const ua = mk('ua'+i, {width:0.12,height:0.36,depth:0.12}); ua.position.set(x,1.12,0.04); ua.rotation.z=x<0?0.35:-0.35; ua.material=shirtMat;
  });

  // Lower arms / hands on armrests
  [-0.5,0.5].forEach((x,i) => {
    const la = mk('la'+i, {width:0.1,height:0.28,depth:0.1}); la.position.set(x,0.82,0.05); la.rotation.z=x<0?0.1:-0.1; la.material=skinMat;
    const hand = sph('hand'+i, {diameter:0.1}); hand.position.set(x*1.0,0.7,0.22); hand.material=skinMat;
  });

  // ── Legs (these will be animated) ──
  // The thighs sit on the seat, lower legs hang down, feet scoot
  [-0.16,0.16].forEach((x,i) => {
    const side = i===0 ? 'L' : 'R';

    // Thigh (pivot from hip)
    const thigh = new BABYLON.TransformNode('thigh'+side+id, scene);
    thigh.parent = root;
    thigh.position.set(x, 0.52, 0.22);

    const thighMesh = mk('thighM'+side, {width:0.16,height:0.36,depth:0.16});
    thighMesh.parent = thigh;
    thighMesh.position.y = -0.18;
    thighMesh.material = pantsMat;

    // Knee / lower leg (pivot from knee)
    const knee = new BABYLON.TransformNode('knee'+side+id, scene);
    knee.parent = thigh;
    knee.position.y = -0.36;

    const shinMesh = mk('shin'+side, {width:0.13,height:0.34,depth:0.13});
    shinMesh.parent = knee;
    shinMesh.position.y = -0.17;
    shinMesh.material = pantsMat;

    // Foot
    const foot = mk('foot'+side, {width:0.12,height:0.08,depth:0.22});
    foot.parent = knee;
    foot.position.set(0,-0.36,0.06);
    foot.material = shoeMat;

    refs['thigh'+side] = thigh;
    refs['knee'+side] = knee;
  });

  return { root, refs };
}

// ── Leg animation (called per frame) ─────────────────────────────────────────
function animateLegs(refs, phase, speed) {
  const mag = Math.min(Math.abs(speed) / 15, 1);
  const kick = Math.sin(phase) * 0.75 * mag;
  const kneeFlare = Math.max(kick * 0.4, 0);

  if (refs.thighL) {
    refs.thighL.rotation.x = kick;
    refs.kneeL.rotation.x  = Math.abs(kick) * 0.5;
  }
  if (refs.thighR) {
    refs.thighR.rotation.x = -kick;
    refs.kneeR.rotation.x  = Math.abs(kick) * 0.5;
  }
}

// ── Player update ─────────────────────────────────────────────────────────────
function updatePlayer(dt) {
  if (!playerRoot) return;

  const fwd  = keys['KeyW'] || keys['ArrowUp'];
  const back = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right= keys['KeyD'] || keys['ArrowRight'];
  const brake= keys['Space'];

  const maxSpd = 16;
  const accel  = 14;
  const turn   = 2.3;
  const drag   = 0.87;

  if (fwd)   playerSpeed = Math.min(playerSpeed + accel * dt, maxSpd);
  else if (back) playerSpeed = Math.max(playerSpeed - accel * dt * 0.7, -maxSpd * 0.4);
  else playerSpeed *= drag;

  if (brake) playerSpeed *= 0.7;

  // Off-road penalty
  playerOnRoad = onRoad(playerRoot.position, 4.5);
  document.getElementById('offroad').style.display = playerOnRoad ? 'none' : 'block';
  const spdCap = playerOnRoad ? maxSpd : maxSpd * 0.35;
  if (Math.abs(playerSpeed) > spdCap) playerSpeed *= 0.92;

  if (Math.abs(playerSpeed) > 0.4) {
    const dir = playerSpeed > 0 ? 1 : -1;
    if (left)  playerRoot.rotation.y -= turn * dt * dir;
    if (right) playerRoot.rotation.y += turn * dt * dir;
  }

  const angle = playerRoot.rotation.y;
  const nx = playerRoot.position.x + Math.sin(angle) * playerSpeed * dt;
  const nz = playerRoot.position.z + Math.cos(angle) * playerSpeed * dt;
  playerRoot.position.x = nx;
  playerRoot.position.z = nz;
  playerRoot.position.y = 0;

  // Kick legs
  if (Math.abs(playerSpeed) > 0.3) legPhase += Math.abs(playerSpeed) * dt * 2.8;
  animateLegs(playerLegs, legPhase, playerSpeed);

  // Body tilt into turn
  const tilt = ((left ? 1 : 0) - (right ? 1 : 0)) * 0.08 * Math.min(Math.abs(playerSpeed)/8,1);
  playerRoot.rotation.z = tilt;

  camera.lockedTarget = playerRoot;

  // Reset
  if (keys['KeyR']) {
    const sp = trackCenterLine[0] || new BABYLON.Vector3(0,0,0);
    playerRoot.position.copyFrom(new BABYLON.Vector3(sp.x-1.5, 0, sp.z));
    playerRoot.rotation.y = 0; playerSpeed = 0;
  }

  checkPlayerCheckpoints();
}

// ── AI update ─────────────────────────────────────────────────────────────────
function updateAI(dt) {
  if (!aiRoot || !cpData.length) return;
  const target = new BABYLON.Vector3(cpData[aiWPIdx].x, 0, cpData[aiWPIdx].z);
  const diff = target.subtract(aiRoot.position); diff.y = 0;
  const dist = diff.length();

  if (dist < 4) {
    aiWPIdx = (aiWPIdx + 1) % cpData.length;
    if (aiWPIdx === 0) aiLap++;
    if (!raceFinished && aiLap > totalLaps) finishRace(false);
  }

  const want = Math.atan2(diff.x, diff.z);
  let dA = want - aiRoot.rotation.y;
  while (dA > Math.PI)  dA -= Math.PI*2;
  while (dA < -Math.PI) dA += Math.PI*2;
  aiRoot.rotation.y += dA * 2.8 * dt;

  const topSpeeds = [13.5, 14.8, 15.8];
  const top = topSpeeds[currentTrack];
  aiSpeed = Math.min(aiSpeed + 9 * dt, top);

  aiRoot.position.x += Math.sin(aiRoot.rotation.y) * aiSpeed * dt;
  aiRoot.position.z += Math.cos(aiRoot.rotation.y) * aiSpeed * dt;
  aiRoot.position.y = 0;

  aiLegPhase += Math.abs(aiSpeed) * dt * 2.8;
  animateLegs(aiLegs, aiLegPhase, aiSpeed);
}

// ── Checkpoints ───────────────────────────────────────────────────────────────
function checkPlayerCheckpoints() {
  if (!playerRoot) return;
  cpData.forEach((cp, idx) => {
    const d = Math.sqrt((playerRoot.position.x-cp.x)**2 + (playerRoot.position.z-cp.z)**2);
    if (d < 4.5 && !passedCPs.includes(idx)) {
      passedCPs.push(idx);
      playerCP = idx;
    }
    if (cp.finish && d < 4.5 && passedCPs.length >= cpData.length) {
      passedCPs = [];
      playerLap++;
      const lt = performance.now() - lapStart;
      lapStart = performance.now();
      if (lt < bestLap) { bestLap = lt; document.getElementById('h-best').textContent = fmt(bestLap); }
      if (playerLap > totalLaps && !raceFinished) finishRace(true);
    }
  });
}

function finishRace(won) {
  raceFinished = true; gameRunning = false;
  const total = performance.now() - raceStart;
  document.getElementById('fi').textContent    = won ? '🏆' : '😅';
  document.getElementById('ft').textContent    = won ? 'YOU WIN!' : 'SO CLOSE!';
  document.getElementById('ftime').textContent = 'Total: ' + fmt(total);
  document.getElementById('fin').style.display = 'flex';
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function updateHUD(ms, lap) {
  document.getElementById('h-time').textContent = fmt(ms);
  document.getElementById('h-lap').textContent  = Math.min(lap,totalLaps)+' / '+totalLaps;
  const kmh = Math.abs(Math.round(playerSpeed * 3.6));
  document.getElementById('sn').textContent = kmh + ' km/h';
  document.getElementById('sf').style.width = Math.min(kmh/62*100,100)+'%';
}
function updatePosition() {
  const pp = (playerLap-1)*200 + playerCP;
  const ap = (aiLap-1)*200 + aiWPIdx;
  document.getElementById('pos-n').textContent = pp >= ap ? '1' : '2';
}
function fmt(ms) {
  if (!ms || ms===Infinity) return '--:--.--';
  const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000), c=Math.floor((ms%1000)/10);
  return `${m}:${String(s).padStart(2,'0')}.${String(c).padStart(2,'0')}`;
}

// ── Minimap ───────────────────────────────────────────────────────────────────
function drawMinimap() {
  if (!mmCtx || !playerRoot) return;
  const W=150, H=150, ctx=mmCtx;
  ctx.fillStyle='#111'; ctx.fillRect(0,0,W,H);

  const sc=2.2, ox=W/2, oy=H/2;
  ctx.strokeStyle='#2a2a3a'; ctx.lineWidth=6;
  if (trackCenterLine.length>1) {
    ctx.beginPath();
    trackCenterLine.forEach((p,i) => {
      const x=ox+p.x*sc/4, y=oy+p.z*sc/4;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    });
    ctx.closePath(); ctx.stroke();
  }

  if (aiRoot) {
    ctx.fillStyle='#ff6b35';
    ctx.beginPath(); ctx.arc(ox+aiRoot.position.x*sc/4, oy+aiRoot.position.z*sc/4, 4,0,Math.PI*2); ctx.fill();
  }
  ctx.fillStyle='#00d4ff';
  ctx.beginPath(); ctx.arc(ox+playerRoot.position.x*sc/4, oy+playerRoot.position.z*sc/4, 5,0,Math.PI*2); ctx.fill();
}

// ── Box helpers ───────────────────────────────────────────────────────────────
function box(w,h,d, x,y,z, mat, scene) {
  const b = BABYLON.MeshBuilder.CreateBox('b'+Math.random(),{width:w,height:h,depth:d},scene);
  b.position.set(x,y,z); b.material=mat; b.receiveShadows=true; return b;
}
function cyl(h,dia, x,y,z, mat, scene) {
  const c = BABYLON.MeshBuilder.CreateCylinder('c'+Math.random(),{height:h,diameter:dia},scene);
  c.position.set(x,y,z); c.material=mat; c.receiveShadows=true; return c;
}
function sph(dia, x,y,z, mat, scene) {
  const s = BABYLON.MeshBuilder.CreateSphere('s'+Math.random(),{diameter:dia},scene);
  s.position.set(x,y,z); s.material=mat; return s;
}

// ── Spawn utility ─────────────────────────────────────────────────────────────
function spawnRacers(scene, sx, sz, shadows) {
  const pw = scene._options && scene._options.playerColor || [0.1,0.3,0.8];
  const aw = [0.8,0.2,0.1];

  // Player – blue chair, white shirt
  const p = createWorkerChair('P', scene, [0.12,0.28,0.82], [0.9,0.9,0.9]);
  playerRoot = p.root; playerLegs = p.refs;
  playerRoot.position.set(sx-1.8, 0, sz);

  // AI – red chair, yellow shirt
  const a = createWorkerChair('A', scene, [0.78,0.12,0.08], [0.9,0.75,0.1]);
  aiRoot = a.root; aiLegs = a.refs;
  aiRoot.position.set(sx+1.8, 0, sz);

  // Cast shadows for all child meshes
  [playerRoot, aiRoot].forEach(root => {
    scene.meshes.filter(m=>m.parent===root||m.parent?.parent===root).forEach(m=>{
      shadows.addShadowCaster(m, true);
    });
  });

  camera.lockedTarget = playerRoot;
}

// ── Start/Finish line ─────────────────────────────────────────────────────────
function startFinishLine(cx, cz, angle, scene) {
  const w1 = pbr(1,1,1,0,0.6,scene), w2 = pbr(0.05,0.05,0.05,0,0.6,scene);
  for (let i=-4; i<=4; i++) {
    const t = BABYLON.MeshBuilder.CreateBox('sf'+i,{width:0.85,height:0.01,depth:1.6},scene);
    t.position.set(cx + Math.sin(angle+Math.PI/2)*i, 0.02, cz + Math.cos(angle+Math.PI/2)*i);
    t.rotation.y = angle;
    t.material = i%2===0 ? w1 : w2;
  }
}

// ── Fluorescent ceiling light (hangs high, never blocks camera) ──────────────
function fluorescentLight(x,z,scene,h) {
  const ch = h || 6.5;
  // Recessed housing
  const housing = BABYLON.MeshBuilder.CreateBox('flh'+x+z,{width:0.55,height:0.06,depth:1.5},scene);
  housing.position.set(x, ch, z);
  housing.material = pbr(0.3,0.3,0.3,0.5,0.5,scene);
  // Tube glow
  const tube = BABYLON.MeshBuilder.CreateBox('flt'+x+z,{width:0.14,height:0.04,depth:1.38},scene);
  tube.position.set(x, ch-0.02, z);
  tube.material = pbr(1,1,0.92,0,0.02,scene);
  // Hanging wire
  const wire = BABYLON.MeshBuilder.CreateCylinder('flw'+x+z,{height:0.5,diameter:0.015},scene);
  wire.position.set(x, ch+0.28, z);
  wire.material = pbr(0.1,0.1,0.1,0.5,0.5,scene);
  // Point light
  const pl = new BABYLON.PointLight('pl'+x+z, new BABYLON.Vector3(x,ch-0.3,z), scene);
  pl.intensity=0.65; pl.range=11;
  pl.diffuse = new BABYLON.Color3(1,0.97,0.88);
}

// ── Desk with monitor ─────────────────────────────────────────────────────────
function officeDesk(x,z,ry,scene) {
  const wood  = pbr(0.55,0.42,0.3, 0.05,0.75,scene);
  const metal = pbr(0.6,0.6,0.6,   0.8, 0.3, scene);
  const black = pbr(0.07,0.07,0.09, 0.5,0.4, scene);
  const screen= pbr(0.05,0.35,0.55, 0,  0.1, scene);

  const g = new BABYLON.TransformNode('desk'+x+z, scene);
  g.position.set(x,0,z); g.rotation.y=ry;

  const top = BABYLON.MeshBuilder.CreateBox('dt',{width:1.6,height:0.05,depth:0.8},scene); top.parent=g; top.position.y=0.78; top.material=wood;
  [-0.7,0.7,-0.7,0.7].forEach((lx,i)=>{
    const lz=i<2?0.35:-0.35;
    const leg=BABYLON.MeshBuilder.CreateBox('dl'+i,{width:0.05,height:0.78,depth:0.05},scene); leg.parent=g; leg.position.set(lx,0.39,lz); leg.material=metal;
  });
  // Monitor
  const mon=BABYLON.MeshBuilder.CreateBox('mon',{width:0.6,height:0.42,depth:0.04},scene); mon.parent=g; mon.position.set(0,1.08,-0.12); mon.material=black;
  const scr=BABYLON.MeshBuilder.CreateBox('scr',{width:0.54,height:0.36,depth:0.01},scene); scr.parent=g; scr.position.set(0,1.08,-0.11); scr.material=screen;
  const stand=BABYLON.MeshBuilder.CreateBox('mst',{width:0.06,height:0.18,depth:0.06},scene); stand.parent=g; stand.position.set(0,0.87,-0.12); stand.material=black;
  // Keyboard
  const kb=BABYLON.MeshBuilder.CreateBox('kb',{width:0.42,height:0.02,depth:0.16},scene); kb.parent=g; kb.position.set(0,0.82,0.12); kb.material=black;
  // Coffee mug
  const mug=BABYLON.MeshBuilder.CreateCylinder('mug',{height:0.12,diameter:0.08},scene); mug.parent=g; mug.position.set(0.55,0.84,0.1); mug.material=pbr(0.7,0.2,0.2,0,0.8,scene);
}

// ── Cubicle wall panel ────────────────────────────────────────────────────────
function cubicleWall(x,z,w,ry,scene) {
  const frame = pbr(0.55,0.5,0.45, 0.1,0.8,scene);
  const fabric= pbr(0.45,0.48,0.52, 0,0.95,scene);
  const g=new BABYLON.TransformNode('cw'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const panel=BABYLON.MeshBuilder.CreateBox('cp',{width:w,height:1.55,depth:0.08},scene); panel.parent=g; panel.position.y=0.78; panel.material=fabric;
  const ft=BABYLON.MeshBuilder.CreateBox('ft',{width:w,height:0.06,depth:0.09},scene); ft.parent=g; ft.position.y=1.58; ft.material=frame;
  const fb=BABYLON.MeshBuilder.CreateBox('fb',{width:w,height:0.06,depth:0.09},scene); fb.parent=g; fb.position.y=0.03; fb.material=frame;
  [-w/2,w/2].forEach((px,i)=>{
    const fe=BABYLON.MeshBuilder.CreateBox('fe'+i,{width:0.06,height:1.6,depth:0.09},scene); fe.parent=g; fe.position.set(px,0.8,0); fe.material=frame;
  });
}

// ── Potted plant ──────────────────────────────────────────────────────────────
function plant(x,z,scene) {
  const pot=BABYLON.MeshBuilder.CreateCylinder('pot'+x,{height:0.32,diameterTop:0.28,diameterBottom:0.22},scene);
  pot.position.set(x,0.16,z); pot.material=pbr(0.55,0.35,0.22,0,0.9,scene);
  const leaves=BABYLON.MeshBuilder.CreateSphere('lv'+x,{diameter:0.65},scene);
  leaves.position.set(x,0.68,z); leaves.material=pbr(0.15,0.5,0.2,0,0.9,scene); leaves.scaling.y=1.2;
}

// ── Filing cabinet ────────────────────────────────────────────────────────────
function cabinet(x,z,ry,scene) {
  const mat=pbr(0.45,0.52,0.58,0.4,0.5,scene);
  const b=BABYLON.MeshBuilder.CreateBox('cab'+x,{width:0.46,height:1.1,depth:0.6},scene);
  b.position.set(x,0.55,z); b.rotation.y=ry; b.material=mat;
  [-0.22,0.22].forEach((dy,i)=>{
    const h=BABYLON.MeshBuilder.CreateBox('ch'+i+x,{width:0.12,height:0.02,depth:0.06},scene);
    h.position.set(x,0.55+dy,z-0.32+Math.cos(ry)*0.31); h.material=pbr(0.7,0.68,0.2,0.9,0.2,scene);
  });
}

// ── Water cooler ─────────────────────────────────────────────────────────────
function waterCooler(x,z,scene) {
  const body=BABYLON.MeshBuilder.CreateBox('wc'+x,{width:0.38,height:1.0,depth:0.38},scene); body.position.set(x,0.5,z); body.material=pbr(0.92,0.92,0.92,0.1,0.6,scene);
  const bottle=BABYLON.MeshBuilder.CreateCylinder('wb'+x,{height:0.55,diameter:0.28},scene); bottle.position.set(x,1.28,z); bottle.material=pbr(0.6,0.82,0.9,0.05,0.15,scene);
}

// ── Printer / Copier machine ──────────────────────────────────────────────────
function printer(x,z,ry,scene) {
  const g=new BABYLON.TransformNode('prn'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const body=BABYLON.MeshBuilder.CreateBox('pb',{width:0.7,height:0.55,depth:0.55},scene); body.parent=g; body.position.y=0.5; body.material=pbr(0.88,0.88,0.86,0.1,0.5,scene);
  const top=BABYLON.MeshBuilder.CreateBox('pt',{width:0.72,height:0.05,depth:0.57},scene); top.parent=g; top.position.y=0.8; top.material=pbr(0.3,0.3,0.3,0.3,0.5,scene);
  const tray=BABYLON.MeshBuilder.CreateBox('ptr',{width:0.5,height:0.02,depth:0.38},scene); tray.parent=g; tray.position.set(0,0.35,0.28); tray.rotation.x=-0.15; tray.material=pbr(0.5,0.5,0.5,0.2,0.6,scene);
  const panel=BABYLON.MeshBuilder.CreateBox('pnl',{width:0.18,height:0.12,depth:0.03},scene); panel.parent=g; panel.position.set(0.22,0.65,-0.28); panel.material=pbr(0.05,0.25,0.45,0,0.1,scene);
}

// ── Bookshelf ─────────────────────────────────────────────────────────────────
function bookshelf(x,z,ry,scene) {
  const g=new BABYLON.TransformNode('bs'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const wood=pbr(0.5,0.38,0.25,0.05,0.7,scene);
  // Frame
  const back=BABYLON.MeshBuilder.CreateBox('bk',{width:1.5,height:2.1,depth:0.06},scene); back.parent=g; back.position.y=1.05; back.material=wood;
  [-0.72,0.72].forEach((px,i)=>{
    const side=BABYLON.MeshBuilder.CreateBox('bs'+i,{width:0.06,height:2.1,depth:0.36},scene); side.parent=g; side.position.set(px,1.05,0.15); side.material=wood;
  });
  [0,0.52,1.04,1.58,2.1].forEach((py,i)=>{
    const shelf=BABYLON.MeshBuilder.CreateBox('sh'+i,{width:1.44,height:0.04,depth:0.36},scene); shelf.parent=g; shelf.position.set(0,py,0.15); shelf.material=wood;
  });
  // Books (colourful spines)
  const bookColors=[[0.7,0.15,0.15],[0.15,0.4,0.7],[0.2,0.6,0.25],[0.65,0.55,0.12],[0.55,0.18,0.55],[0.15,0.5,0.5]];
  for (let row=0; row<4; row++) {
    let bx=-0.62;
    for (let b=0; b<7; b++) {
      const bw=0.06+Math.random()*0.06, bh=0.38+Math.random()*0.1;
      const bk=BABYLON.MeshBuilder.CreateBox('bk'+row+b,{width:bw,height:bh,depth:0.28},scene);
      bk.parent=g; bk.position.set(bx+bw/2, row*0.52+bh/2+0.06, 0.04);
      bk.material=pbr(...bookColors[b%bookColors.length],0,0.9,scene);
      bx+=bw+0.01;
    }
  }
}

// ── Break-room coffee station ─────────────────────────────────────────────────
function coffeeStation(x,z,ry,scene) {
  const g=new BABYLON.TransformNode('cof'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const wood=pbr(0.5,0.38,0.25,0.05,0.7,scene);
  const black=pbr(0.08,0.08,0.09,0.4,0.5,scene);
  // Counter
  const counter=BABYLON.MeshBuilder.CreateBox('cc',{width:1.6,height:0.86,depth:0.6},scene); counter.parent=g; counter.position.y=0.43; counter.material=wood;
  const top=BABYLON.MeshBuilder.CreateBox('ct',{width:1.62,height:0.04,depth:0.62},scene); top.parent=g; top.position.y=0.88; top.material=pbr(0.72,0.68,0.62,0.15,0.3,scene);
  // Coffee machine
  const cm=BABYLON.MeshBuilder.CreateBox('cm',{width:0.3,height:0.44,depth:0.28},scene); cm.parent=g; cm.position.set(-0.5,1.1,-0.12); cm.material=black;
  const cmtop=BABYLON.MeshBuilder.CreateBox('cmt',{width:0.28,height:0.12,depth:0.26},scene); cmtop.parent=g; cmtop.position.set(-0.5,1.34,-0.12); cmtop.material=pbr(0.55,0.22,0.08,0.1,0.6,scene);
  // Cup
  const cup=BABYLON.MeshBuilder.CreateCylinder('cup',{height:0.1,diameter:0.07},scene); cup.parent=g; cup.position.set(-0.5,0.95,-0.15); cup.material=pbr(0.95,0.95,0.95,0,0.8,scene);
  // Microwave
  const mw=BABYLON.MeshBuilder.CreateBox('mw',{width:0.52,height:0.32,depth:0.34},scene); mw.parent=g; mw.position.set(0.4,1.08,-0.1); mw.material=pbr(0.85,0.85,0.83,0.1,0.5,scene);
  const mwdoor=BABYLON.MeshBuilder.CreateBox('mwd',{width:0.36,height:0.28,depth:0.02},scene); mwdoor.parent=g; mwdoor.position.set(0.3,1.08,-0.27); mwdoor.material=pbr(0.15,0.45,0.6,0,0.08,scene);
  // Fridge underneath
  const fridge=BABYLON.MeshBuilder.CreateBox('fr',{width:0.58,height:0.82,depth:0.56},scene); fridge.parent=g; fridge.position.set(0.55,0.41,0.02); fridge.material=pbr(0.88,0.88,0.86,0.3,0.4,scene);
  const fhandle=BABYLON.MeshBuilder.CreateBox('frh',{width:0.04,height:0.28,depth:0.04},scene); fhandle.parent=g; fhandle.position.set(0.27,0.6,-0.29); fhandle.material=pbr(0.6,0.6,0.6,0.8,0.2,scene);
}

// ── Motivational poster on wall ───────────────────────────────────────────────
function wallPoster(x,y,z,ry,w,h,col,scene) {
  const frame=BABYLON.MeshBuilder.CreateBox('pf'+x+z,{width:w+0.06,height:h+0.06,depth:0.04},scene);
  frame.position.set(x,y,z); frame.rotation.y=ry; frame.material=pbr(0.12,0.12,0.12,0.3,0.6,scene);
  const print=BABYLON.MeshBuilder.CreateBox('pp'+x+z,{width:w,height:h,depth:0.03},scene);
  print.position.set(x,y,z+(ry===0?0.02:-0.02)); print.rotation.y=ry; print.material=pbr(...col,0,0.6,scene);
}

// ── Wall clock ────────────────────────────────────────────────────────────────
function wallClock(x,y,z,ry,scene) {
  const face=BABYLON.MeshBuilder.CreateCylinder('clf'+x,{height:0.04,diameter:0.38},scene);
  face.position.set(x,y,z); face.rotation.x=Math.PI/2; face.rotation.y=ry; face.material=pbr(0.96,0.96,0.94,0,0.5,scene);
  const rim=BABYLON.MeshBuilder.CreateCylinder('clr'+x,{height:0.05,diameter:0.42},scene);
  rim.position.set(x,y,z); rim.rotation.x=Math.PI/2; rim.rotation.y=ry; rim.material=pbr(0.15,0.15,0.15,0.5,0.4,scene);
  // Hour hand
  const hr=BABYLON.MeshBuilder.CreateBox('clh'+x,{width:0.03,height:0.12,depth:0.02},scene);
  hr.position.set(x+Math.sin(ry)*0.02,y+0.04,z-Math.cos(ry)*0.02); hr.rotation.y=ry; hr.material=pbr(0.1,0.1,0.1,0,0.8,scene);
  // Minute hand
  const mn=BABYLON.MeshBuilder.CreateBox('clm'+x,{width:0.02,height:0.16,depth:0.02},scene);
  mn.position.set(x+Math.sin(ry)*0.02,y+0.04,z-Math.cos(ry)*0.02); mn.rotation.y=ry+0.8; mn.material=pbr(0.1,0.1,0.1,0,0.8,scene);
}

// ── Notice / cork board ────────────────────────────────────────────────────────
function noticeboard(x,y,z,ry,scene) {
  const frame=BABYLON.MeshBuilder.CreateBox('nbf'+x,{width:1.22,height:0.82,depth:0.05},scene);
  frame.position.set(x,y,z); frame.rotation.y=ry; frame.material=pbr(0.4,0.28,0.15,0.1,0.8,scene);
  const board=BABYLON.MeshBuilder.CreateBox('nbb'+x,{width:1.1,height:0.7,depth:0.04},scene);
  board.position.set(x,y,z+(ry===0?0.03:-0.03)); board.rotation.y=ry; board.material=pbr(0.62,0.44,0.26,0,0.97,scene);
  // Pinned notes (small coloured squares)
  const noteC=[[0.9,0.9,0.2],[0.2,0.7,0.9],[0.9,0.4,0.2],[0.7,0.9,0.3]];
  for (let i=0;i<6;i++) {
    const nx=x+(Math.random()-0.5)*0.8, ny=y+(Math.random()-0.5)*0.5;
    const note=BABYLON.MeshBuilder.CreateBox('nbn'+x+i,{width:0.18,height:0.14,depth:0.02},scene);
    note.position.set(nx,ny,z+(ry===0?0.06:-0.06)); note.rotation.y=ry; note.rotation.z=(Math.random()-0.5)*0.3;
    note.material=pbr(...noteC[i%noteC.length],0,0.8,scene);
  }
}

// ── Fire extinguisher ────────────────────────────────────────────────────────
function fireExt(x,z,scene) {
  const body=BABYLON.MeshBuilder.CreateCylinder('fe'+x+z,{height:0.52,diameter:0.16},scene);
  body.position.set(x,0.26,z); body.material=pbr(0.8,0.1,0.08,0.2,0.5,scene);
  const top=BABYLON.MeshBuilder.CreateCylinder('fet'+x+z,{height:0.06,diameter:0.18},scene);
  top.position.set(x,0.55,z); top.material=pbr(0.6,0.6,0.6,0.8,0.3,scene);
  const nozzle=BABYLON.MeshBuilder.CreateCylinder('fen'+x+z,{height:0.14,diameter:0.04},scene);
  nozzle.position.set(x+0.08,0.62,z); nozzle.rotation.z=Math.PI/4; nozzle.material=pbr(0.15,0.15,0.15,0.5,0.4,scene);
}

// ── Trash bin ────────────────────────────────────────────────────────────────
function trashBin(x,z,scene) {
  const bin=BABYLON.MeshBuilder.CreateCylinder('tb'+x+z,{height:0.4,diameterTop:0.28,diameterBottom:0.22},scene);
  bin.position.set(x,0.2,z); bin.material=pbr(0.25,0.25,0.25,0.2,0.7,scene);
  const lid=BABYLON.MeshBuilder.CreateCylinder('tbl'+x+z,{height:0.04,diameter:0.3},scene);
  lid.position.set(x,0.42,z); lid.material=pbr(0.2,0.2,0.2,0.3,0.6,scene);
}

// ── Reception desk ────────────────────────────────────────────────────────────
function receptionDesk(x,z,ry,scene) {
  const g=new BABYLON.TransformNode('rec'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const wood=pbr(0.45,0.35,0.25,0.05,0.6,scene);
  const top2=pbr(0.82,0.8,0.76,0.2,0.25,scene);
  // Main curved shape faked with 3 boxes
  const front=BABYLON.MeshBuilder.CreateBox('rf',{width:2.8,height:1.05,depth:0.18},scene); front.parent=g; front.position.set(0,0.52,-0.5); front.material=wood;
  const leftW=BABYLON.MeshBuilder.CreateBox('rl',{width:0.18,height:1.05,depth:1.0},scene); leftW.parent=g; leftW.position.set(-1.31,0.52,0); leftW.material=wood;
  const rightW=BABYLON.MeshBuilder.CreateBox('rr',{width:0.18,height:1.05,depth:1.0},scene); rightW.parent=g; rightW.position.set(1.31,0.52,0); rightW.material=wood;
  const counter=BABYLON.MeshBuilder.CreateBox('rc',{width:2.8,height:0.06,depth:1.1},scene); counter.parent=g; counter.position.set(0,1.08,0); counter.material=top2;
  // Monitor on desk
  const mon=BABYLON.MeshBuilder.CreateBox('rm',{width:0.55,height:0.38,depth:0.04},scene); mon.parent=g; mon.position.set(-0.7,1.46,-0.1); mon.material=pbr(0.06,0.06,0.07,0.5,0.4,scene);
  const scr=BABYLON.MeshBuilder.CreateBox('rs',{width:0.48,height:0.32,depth:0.02},scene); scr.parent=g; scr.position.set(-0.7,1.46,-0.09); scr.material=pbr(0.05,0.3,0.5,0,0.08,scene);
  // Phone
  const phone=BABYLON.MeshBuilder.CreateBox('rph',{width:0.18,height:0.04,depth:0.26},scene); phone.parent=g; phone.position.set(0.5,1.12,0.1); phone.material=pbr(0.1,0.1,0.12,0.3,0.5,scene);
}

// ── Coat rack ────────────────────────────────────────────────────────────────
function coatRack(x,z,scene) {
  const pole=BABYLON.MeshBuilder.CreateCylinder('cr'+x+z,{height:1.7,diameter:0.04},scene);
  pole.position.set(x,0.85,z); pole.material=pbr(0.4,0.3,0.2,0.2,0.7,scene);
  const base=BABYLON.MeshBuilder.CreateCylinder('crb'+x+z,{height:0.05,diameter:0.55},scene);
  base.position.set(x,0.025,z); base.material=pbr(0.3,0.22,0.15,0.1,0.8,scene);
  // Hooks
  for (let i=0;i<4;i++) {
    const ha=i/4*Math.PI*2;
    const hook=BABYLON.MeshBuilder.CreateBox('crh'+x+i,{width:0.04,height:0.04,depth:0.14},scene);
    hook.position.set(x+Math.sin(ha)*0.06,1.62,z+Math.cos(ha)*0.06); hook.rotation.y=ha; hook.material=pbr(0.6,0.5,0.3,0.4,0.5,scene);
  }
  // A jacket hanging
  const jacket=BABYLON.MeshBuilder.CreateBox('crj'+x,{width:0.28,height:0.38,depth:0.05},scene);
  jacket.position.set(x+0.06,1.38,z+0.06); jacket.rotation.y=0.5; jacket.material=pbr(0.15,0.2,0.45,0,0.9,scene);
}

// ── Vending machine ───────────────────────────────────────────────────────────
function vendingMachine(x,z,ry,scene) {
  const g=new BABYLON.TransformNode('vm'+x+z,scene); g.position.set(x,0,z); g.rotation.y=ry;
  const body=BABYLON.MeshBuilder.CreateBox('vmb',{width:0.72,height:1.75,depth:0.55},scene); body.parent=g; body.position.y=0.875; body.material=pbr(0.12,0.38,0.18,0.1,0.5,scene);
  const glass=BABYLON.MeshBuilder.CreateBox('vmg',{width:0.54,height:1.0,depth:0.04},scene); glass.parent=g; glass.position.set(0,1.08,-0.28); glass.material=pbr(0.55,0.75,0.85,0.05,0.06,scene);
  const panel=BABYLON.MeshBuilder.CreateBox('vmp',{width:0.24,height:0.36,depth:0.04},scene); glass.parent=g; panel.parent=g; panel.position.set(0,0.5,-0.28); panel.material=pbr(0.2,0.2,0.22,0.3,0.4,scene);
}

// ── Office floor tiles ────────────────────────────────────────────────────────
function officeTiles(w,d,cx,cz,scene,col) {
  const mat=pbr(...col,0.05,0.35,scene);
  const floor=BABYLON.MeshBuilder.CreateBox('offl',{width:w,height:0.08,depth:d},scene);
  floor.position.set(cx,-0.04,cz); floor.material=mat; floor.receiveShadows=true;
  return floor;
}

// ── Ceiling tee-bar grid only – no solid panel, camera never blocked ─────────
function suspendedCeiling(w,d,cx,cz,scene) {
  const h = 7.2;
  const gridMat = pbr(0.62,0.62,0.60,0.3,0.65,scene);
  for (let x=cx-w/2+2; x<cx+w/2; x+=4) {
    const gl=BABYLON.MeshBuilder.CreateBox('cglx'+x+cx,{width:0.05,height:0.1,depth:d},scene);
    gl.position.set(x,h,cz); gl.material=gridMat;
  }
  for (let z=cz-d/2+2; z<cz+d/2; z+=4) {
    const gl=BABYLON.MeshBuilder.CreateBox('cglz'+z+cx,{width:w,height:0.1,depth:0.05},scene);
    gl.position.set(cx,h,z); gl.material=gridMat;
  }
}

// ── Outer walls at full height (7 units) with windows ────────────────────────
function outerWalls(minX,maxX,minZ,maxZ,scene,wallMat,windowMat) {
  const h=7.0, W=maxX-minX, D=maxZ-minZ;
  // N/S solid walls
  [[0,minZ,W],[0,maxZ,W]].forEach(([x,z,w],si)=>{
    const wall=BABYLON.MeshBuilder.CreateBox('ow'+si,{width:w,height:h,depth:0.35},scene);
    wall.position.set(x,h/2,z); wall.material=wallMat; wall.receiveShadows=true;
    // Full-height window columns (floor-to-ceiling)
    for (let wx=minX+4; wx<maxX-3; wx+=5) {
      const win=BABYLON.MeshBuilder.CreateBox('win'+si+wx,{width:3.2,height:h*0.7,depth:0.06},scene);
      win.position.set(wx,h*0.55,z+(si===0?0.2:-0.2)); win.material=windowMat;
      // Window frame
      const wf=BABYLON.MeshBuilder.CreateBox('wf'+si+wx,{width:3.4,height:h*0.72,depth:0.08},scene);
      wf.position.set(wx,h*0.55,z+(si===0?0.19:-0.19)); wf.material=pbr(0.75,0.72,0.68,0,0.8,scene);
    }
  });
  // E/W walls
  [[minX,0,D],[maxX,0,D]].forEach(([x,z,d],si)=>{
    const wall=BABYLON.MeshBuilder.CreateBox('ow2'+si,{width:0.35,height:h,depth:d},scene);
    wall.position.set(x,h/2,z); wall.material=wallMat;
    for (let wz=minZ+4; wz<maxZ-3; wz+=6) {
      const win=BABYLON.MeshBuilder.CreateBox('winE'+si+wz,{width:0.06,height:h*0.65,depth:3.0},scene);
      win.position.set(x+(si===0?0.2:-0.2),h*0.52,wz); win.material=windowMat;
    }
  });
}

// ── Baseboard trim ────────────────────────────────────────────────────────────
function baseboard(minX,maxX,minZ,maxZ,scene,mat) {
  const W=maxX-minX, D=maxZ-minZ;
  [[0,minZ,W,true],[0,maxZ,W,true],[minX,0,D,false],[maxX,0,D,false]].forEach(([x,z,l,horiz])=>{
    const b=BABYLON.MeshBuilder.CreateBox('bb'+x+z,horiz?{width:l,height:0.12,depth:0.06}:{width:0.06,height:0.12,depth:l},scene);
    b.position.set(x,0.06,z); b.material=mat;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK 0 – CUBICLE CANYON
// ═══════════════════════════════════════════════════════════════════════════════
function buildCubicleCanyon(scene, shadows) {
  scene.fogColor = new BABYLON.Color3(0.87,0.9,0.88);
  scene.clearColor= new BABYLON.Color4(0.87,0.9,0.88,1);

  const wallMat= pbr(0.92,0.91,0.88,0,0.85,scene);
  const winMat = pbr(0.55,0.75,0.88,0.05,0.06,scene);
  const carpMat= pbr(0.42,0.46,0.5,0,0.99,scene);

  officeTiles(80,84, 0,0, scene,[0.88,0.88,0.86]);
  suspendedCeiling(80,84, 0,0, scene);
  outerWalls(-40,40,-42,42, scene,wallMat,winMat);
  baseboard(-40,40,-42,42,scene,pbr(0.72,0.68,0.6,0,0.8,scene));

  // Carpet strips between cubicle rows
  const carp=BABYLON.MeshBuilder.CreateBox('carp',{width:8,height:0.01,depth:84},scene);
  carp.position.set(0,0.01,0); carp.material=carpMat;

  // Lights at 6.5 height
  for (let x=-28; x<=28; x+=10) for (let z=-38; z<=38; z+=8) fluorescentLight(x,z,scene,6.5);

  // Track
  const rawPts = [
    new BABYLON.Vector3(0,0,-36),
    new BABYLON.Vector3(-28,0,-30),
    new BABYLON.Vector3(-30,0,-10),
    new BABYLON.Vector3(-30,0,10),
    new BABYLON.Vector3(-28,0,30),
    new BABYLON.Vector3(0,0,36),
    new BABYLON.Vector3(28,0,30),
    new BABYLON.Vector3(30,0,10),
    new BABYLON.Vector3(30,0,-10),
    new BABYLON.Vector3(28,0,-30),
  ];
  buildRoad(rawPts, 8, scene);
  startFinishLine(0,-36,0,scene);
  cpData = rawPts.map((p,i)=>({x:p.x,z:p.z,finish:i===0}));

  // ── Left cubicle farm ──
  for (let row=0; row<3; row++) {
    for (let col=0; col<5; col++) {
      const cx=-12-row*5.5, cz=-20+col*10;
      cubicleWall(cx+1,cz, 3.5, 0, scene);
      cubicleWall(cx,cz+1.75, 3.5, Math.PI/2, scene);
      officeDesk(cx-0.6,cz, 0, scene);
      if (col%2===0) trashBin(cx-1.5,cz+1.5,scene);
    }
  }
  // ── Right cubicle farm ──
  for (let row=0; row<3; row++) {
    for (let col=0; col<5; col++) {
      const cx=12+row*5.5, cz=-20+col*10;
      cubicleWall(cx-1,cz, 3.5, 0, scene);
      cubicleWall(cx,cz+1.75, 3.5, Math.PI/2, scene);
      officeDesk(cx+0.6,cz, Math.PI, scene);
      if (col%3===0) cabinet(cx+1.5,cz-1,0,scene);
    }
  }

  // Reception near start
  receptionDesk(0,-38.5,0,scene);
  coatRack(-4,-40,scene);
  coatRack(4,-40,scene);

  // Break room corner (NE)
  coffeeStation(34,36,Math.PI/2,scene);
  vendingMachine(36,30,-Math.PI/2,scene);
  waterCooler(36,40,scene);
  waterCooler(-36,40,scene);

  // Bookshelves along centre wall
  bookshelf(-2,-32,0,scene);
  bookshelf(2,-32,Math.PI,scene);
  bookshelf(-2,32,0,scene);
  bookshelf(2,32,Math.PI,scene);

  // Printers
  printer(-8,-38,0,scene);
  printer(8,-38,Math.PI,scene);
  printer(-8,38,0,scene);

  // Plants
  [[-36,-40],[36,-40],[-36,40],[36,40],[-36,0],[36,0],[-36,-20],[36,20]].forEach(([x,z])=>plant(x,z,scene));

  // Wall clocks & posters
  wallClock(-39.7,4.2,-10,Math.PI/2,scene);
  wallClock(39.7,4.2,10,-Math.PI/2,scene);
  wallPoster(-25,3.5,-41.7,0, 1.4,0.9,[0.2,0.45,0.75],scene);
  wallPoster(0,3.5,-41.7,0,  1.4,0.9,[0.6,0.18,0.18],scene);
  wallPoster(25,3.5,-41.7,0, 1.4,0.9,[0.18,0.5,0.25],scene);
  noticeboard(-15,3.2,-41.7,0,scene);
  noticeboard(15,3.2,-41.7,0,scene);

  // Fire extinguishers
  [[-39,35],[-39,-35],[39,35],[39,-35]].forEach(([x,z])=>fireExt(x,z,scene));

  // Filing cabinets clusters
  [[-36,-28],[36,-28],[-36,28],[36,28]].forEach(([x,z])=>{
    cabinet(x,z,0,scene); cabinet(x+0.6,z,0,scene);
  });

  spawnRacers(scene, 0, -34, shadows);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK 1 – OPEN OFFICE CHAOS
// ═══════════════════════════════════════════════════════════════════════════════
function buildOpenOffice(scene, shadows) {
  scene.fogColor = new BABYLON.Color3(0.9,0.92,0.88);
  scene.clearColor= new BABYLON.Color4(0.9,0.92,0.88,1);

  const wallM = pbr(0.96,0.95,0.92,0,0.88,scene);
  const glass = pbr(0.6,0.8,0.9,0.05,0.06,scene);
  const concMat = pbr(0.52,0.52,0.50,0,0.95,scene);

  officeTiles(90,100,0,0,scene,[0.52,0.52,0.5]);
  suspendedCeiling(90,100,0,0,scene);
  outerWalls(-45,45,-50,50,scene,wallM,glass);
  baseboard(-45,45,-50,50,scene,pbr(0.7,0.68,0.62,0,0.8,scene));

  // Exposed ductwork at ceiling height
  const ductMat=pbr(0.45,0.45,0.47,0.6,0.4,scene);
  for (let x=-18; x<=18; x+=18) {
    const duct=BABYLON.MeshBuilder.CreateBox('duct'+x,{width:0.75,height:0.5,depth:100},scene);
    duct.position.set(x,6.7,0); duct.material=ductMat;
  }
  // Cross ducts
  for (let z=-40; z<=40; z+=20) {
    const duct=BABYLON.MeshBuilder.CreateBox('dz'+z,{width:90,height:0.4,depth:0.6},scene);
    duct.position.set(0,6.8,z); duct.material=ductMat;
  }

  for (let x=-36; x<=36; x+=9) for (let z=-44; z<=44; z+=9) fluorescentLight(x,z,scene,6.5);

  const rawPts = [
    new BABYLON.Vector3(0,0,-44),
    new BABYLON.Vector3(-32,0,-38),
    new BABYLON.Vector3(-38,0,-20),
    new BABYLON.Vector3(-32,0,0),
    new BABYLON.Vector3(-38,0,20),
    new BABYLON.Vector3(-30,0,40),
    new BABYLON.Vector3(0,0,44),
    new BABYLON.Vector3(30,0,40),
    new BABYLON.Vector3(38,0,20),
    new BABYLON.Vector3(32,0,0),
    new BABYLON.Vector3(38,0,-20),
    new BABYLON.Vector3(32,0,-38),
  ];
  buildRoad(rawPts, 9, scene);
  startFinishLine(0,-44,0,scene);
  cpData = rawPts.map((p,i)=>({x:p.x,z:p.z,finish:i===0}));

  // Standing desk islands
  const deskPos=[[-18,-30],[18,-30],[-18,-10],[18,-10],[-18,10],[18,10],[-18,28],[18,28],[0,-18],[0,18],[0,0]];
  deskPos.forEach(([x,z])=>officeDesk(x,z,Math.random()*Math.PI*2,scene));

  // Whiteboard partitions (scenic, off-track)
  const wbMat=pbr(0.97,0.97,0.96,0,0.5,scene);
  const wbFrm=pbr(0.15,0.15,0.15,0.5,0.5,scene);
  [[-6,-36,true],[6,10,true],[-6,28,false],[8,-15,false]].forEach(([x,z,vert],i)=>{
    const wb=BABYLON.MeshBuilder.CreateBox('wb'+i,{width:vert?0.08:3,height:2.0,depth:vert?3:0.08},scene);
    wb.position.set(x,1.0,z); wb.material=wbMat;
    const frame=BABYLON.MeshBuilder.CreateBox('wbf'+i,{width:vert?0.12:3.2,height:2.05,depth:vert?3.2:0.12},scene);
    frame.position.set(x,1.0,z); frame.material=wbFrm;
    // Marker tray at bottom of whiteboard
    const tray=BABYLON.MeshBuilder.CreateBox('wbt'+i,{width:vert?0.1:3.0,height:0.04,depth:0.1},scene);
    tray.position.set(x,0.04,z+(vert?0:0.07)); tray.material=wbFrm;
  });

  // Bean bag lounge corners
  const bbMat=pbr(0.78,0.22,0.45,0,0.9,scene);
  const bbMat2=pbr(0.22,0.6,0.78,0,0.9,scene);
  [[-40,35],[40,-35],[-40,-35],[40,35]].forEach(([x,z],i)=>{
    const bag=BABYLON.MeshBuilder.CreateSphere('bb'+x,{diameter:1.1},scene);
    bag.position.set(x,0.55,z); bag.material=i%2===0?bbMat:bbMat2; bag.scaling.y=0.7;
    const bag2=BABYLON.MeshBuilder.CreateSphere('bb2'+x,{diameter:0.9},scene);
    bag2.position.set(x+1.0,0.45,z+0.5); bag2.material=i%2===0?bbMat2:bbMat; bag2.scaling.y=0.7;
    // Low coffee table
    const ct=BABYLON.MeshBuilder.CreateBox('ct'+x,{width:0.6,height:0.3,depth:0.6},scene);
    ct.position.set(x+0.5,0.15,z-0.5); ct.material=pbr(0.5,0.38,0.25,0.05,0.7,scene);
  });

  // Break room NW corner
  coffeeStation(-40,-44,Math.PI/2,scene);
  vendingMachine(-42,-38,-Math.PI/2,scene);
  vendingMachine(-42,-46,-Math.PI/2,scene);

  // Printers SE
  printer(40,44,-Math.PI/2,scene);
  printer(40,38,-Math.PI/2,scene);

  // Reception
  receptionDesk(0,-47,0,scene);
  coatRack(-5,-48,scene); coatRack(5,-48,scene);

  // Plants all around perimeter
  [[-42,-42],[42,-42],[-42,42],[42,42],[-42,0],[42,0],[-25,-48],[25,-48],[-25,48],[25,48]].forEach(([x,z])=>plant(x,z,scene));

  // Bookshelves on interior walls
  bookshelf(-8,-48,0,scene); bookshelf(-2,-48,0,scene); bookshelf(4,-48,0,scene);
  bookshelf(-8,48,Math.PI,scene); bookshelf(-2,48,Math.PI,scene);

  // Wall art & clocks
  wallPoster(-30,4,-49.7,0,1.6,1.0,[0.15,0.45,0.72],scene);
  wallPoster(10,4,-49.7,0,1.6,1.0,[0.72,0.28,0.18],scene);
  wallPoster(30,4,49.7,Math.PI,1.6,1.0,[0.22,0.58,0.32],scene);
  noticeboard(-44.7,4,-20,Math.PI/2,scene);
  noticeboard(-44.7,4,20,Math.PI/2,scene);
  wallClock(-44.7,5,0,Math.PI/2,scene);
  wallClock(44.7,5,0,-Math.PI/2,scene);

  // Fire extinguishers
  [[-44,44],[-44,-44],[44,44],[44,-44]].forEach(([x,z])=>fireExt(x,z,scene));

  // Trash bins near desks
  [[-20,-32],[20,-32],[-20,22],[20,22],[0,-20]].forEach(([x,z])=>trashBin(x,z,scene));

  waterCooler(-42,28,scene); waterCooler(42,-28,scene); waterCooler(0,48,scene);

  spawnRacers(scene, 0,-42, shadows);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK 2 – EXECUTIVE SUITE
// ═══════════════════════════════════════════════════════════════════════════════
function buildExecutiveSuite(scene, shadows) {
  scene.fogColor = new BABYLON.Color3(0.14,0.11,0.09);
  scene.clearColor= new BABYLON.Color4(0.12,0.09,0.07,1);
  scene.fogStart=40; scene.fogEnd=90;

  const marble = pbr(0.86,0.83,0.78,0.25,0.28,scene);
  const mah    = pbr(0.32,0.16,0.08,0.1, 0.4, scene);
  const gold   = pbr(0.83,0.67,0.2, 0.95,0.18,scene);
  const darkW  = pbr(0.2, 0.16,0.12,0,   0.75,scene);
  const glass  = pbr(0.5, 0.72,0.84,0.1, 0.06,scene);
  const carp   = pbr(0.32,0.22,0.42,0,   0.99,scene);

  officeTiles(62,92, 0,0, scene, [0.84,0.81,0.76]);
  suspendedCeiling(62,92, 0,0, scene);
  outerWalls(-31,31,-46,46, scene, darkW, glass);

  // Gold vertical trim pilasters on walls
  [-31,31].forEach(x=>{
    const v=BABYLON.MeshBuilder.CreateBox('vt'+x,{width:0.14,height:7,depth:92},scene); v.position.set(x,3.5,0); v.material=gold;
  });
  // Gold base and crown moulding
  [-46,46].forEach(z=>{
    const base=BABYLON.MeshBuilder.CreateBox('ht'+z,{width:62,height:0.15,depth:0.22},scene); base.position.set(0,0.075,z); base.material=gold;
    const crown=base.clone('cr'+z); crown.position.y=6.88;
    const mid=base.clone('md'+z); mid.position.y=3.5; mid.scaling.y=0.5;
  });

  // Carpet runner
  const runner=BABYLON.MeshBuilder.CreateBox('runner',{width:4,height:0.01,depth:92},scene);
  runner.position.set(0,0.01,0); runner.material=carp;

  // Chandeliers (drop from true ceiling at 7)
  [[0,-30],[0,0],[0,30]].forEach(([x,z])=>{
    const chain=BABYLON.MeshBuilder.CreateCylinder('chain'+z,{height:2.8,diameter:0.025},scene);
    chain.position.set(x,5.6,z); chain.material=gold;
    const bowl=BABYLON.MeshBuilder.CreateSphere('bowl'+z,{diameter:1.1},scene);
    bowl.position.set(x,4.0,z); bowl.material=pbr(0.88,0.92,0.98,0.1,0.04,scene); bowl.scaling.y=0.5;
    // Crystal drops
    for (let i=0;i<8;i++) {
      const a=i/8*Math.PI*2;
      const drop=BABYLON.MeshBuilder.CreateBox('drop'+z+i,{width:0.03,height:0.22,depth:0.03},scene);
      drop.position.set(x+Math.sin(a)*0.42,3.75,z+Math.cos(a)*0.42); drop.material=pbr(0.88,0.93,1,0.02,0.04,scene);
    }
    const pl=new BABYLON.PointLight('cpl'+z,new BABYLON.Vector3(x,3.5,z),scene);
    pl.intensity=1.5; pl.range=22; pl.diffuse=new BABYLON.Color3(1,0.9,0.72);
  });

  // Marble pillars with ornate caps
  [[-22,-36],[-22,-18],[-22,0],[-22,18],[-22,36],[22,-36],[22,-18],[22,0],[22,18],[22,36]].forEach(([x,z])=>{
    const p=BABYLON.MeshBuilder.CreateCylinder('pil'+x+z,{height:7,diameter:1.1},scene);
    p.position.set(x,3.5,z); p.material=marble;
    const cap=BABYLON.MeshBuilder.CreateCylinder('cap'+x+z,{height:0.28,diameter:1.35},scene);
    cap.position.set(x,7.14,z); cap.material=gold;
    const pilbase=BABYLON.MeshBuilder.CreateCylinder('plb'+x+z,{height:0.22,diameter:1.3},scene);
    pilbase.position.set(x,0.11,z); pilbase.material=gold;
    shadows.addShadowCaster(p,true);
  });

  // Grand boardroom table with leather insert
  const bt=BABYLON.MeshBuilder.CreateBox('bt',{width:5.5,height:0.12,depth:12},scene);
  bt.position.set(0,0.82,0); bt.material=mah; shadows.addShadowCaster(bt,true);
  const leather=BABYLON.MeshBuilder.CreateBox('lth',{width:4.8,height:0.02,depth:11.0},scene);
  leather.position.set(0,0.89,0); leather.material=pbr(0.12,0.18,0.1,0,0.95,scene);
  // Gold edge inlay
  const inlay=BABYLON.MeshBuilder.CreateBox('inl',{width:5.3,height:0.015,depth:11.7},scene);
  inlay.position.set(0,0.885,0); inlay.material=gold;
  [[-2.4,-5.2],[-2.4,5.2],[2.4,-5.2],[2.4,5.2]].forEach(([x,z])=>{
    const tl=BABYLON.MeshBuilder.CreateCylinder('tl'+x,{height:0.82,diameter:0.28},scene);
    tl.position.set(x,0.41,z); tl.material=mah;
  });
  // Water carafes on table
  [[-1,0],[1,-3],[0,3]].forEach(([x,z])=>{
    const car=BABYLON.MeshBuilder.CreateCylinder('car'+x+z,{height:0.28,diameterTop:0.06,diameterBottom:0.1},scene);
    car.position.set(x,1.0,z); car.material=pbr(0.7,0.88,0.95,0.05,0.1,scene);
  });

  // Executive chairs around boardroom table (proper with backs)
  const bcMat=pbr(0.08,0.06,0.05,0.2,0.7,scene);
  const bcCush=pbr(0.12,0.09,0.07,0.1,0.85,scene);
  for (let z=-4.5; z<=4.5; z+=2) {
    [[-3.8,z,Math.PI/2],[3.8,z,-Math.PI/2]].forEach(([x,zz,ry])=>{
      const g=new BABYLON.TransformNode('bch'+x+zz,scene); g.position.set(x,0,zz); g.rotation.y=ry;
      const seat=BABYLON.MeshBuilder.CreateBox('bcs',{width:0.62,height:0.08,depth:0.62},scene); seat.parent=g; seat.position.y=0.88; seat.material=bcCush;
      const back=BABYLON.MeshBuilder.CreateBox('bcb',{width:0.6,height:0.72,depth:0.07},scene); back.parent=g; back.position.set(0,1.24,-0.28); back.material=bcMat;
      const col=BABYLON.MeshBuilder.CreateCylinder('bcc',{height:0.88,diameter:0.06},scene); col.parent=g; col.position.y=0.44; col.material=pbr(0.6,0.6,0.6,0.8,0.25,scene);
    });
  }
  // Head-of-table chairs
  [[0,-7],[0,7]].forEach(([x,z],i)=>{
    const g=new BABYLON.TransformNode('hch'+i,scene); g.position.set(x,0,z); g.rotation.y=i===0?0:Math.PI;
    const seat=BABYLON.MeshBuilder.CreateBox('hcs',{width:0.72,height:0.08,depth:0.72},scene); seat.parent=g; seat.position.y=0.88; seat.material=bcCush;
    const back=BABYLON.MeshBuilder.CreateBox('hcb',{width:0.7,height:0.85,depth:0.07},scene); back.parent=g; back.position.set(0,1.32,-0.33); back.material=bcMat;
    const col=BABYLON.MeshBuilder.CreateCylinder('hcc',{height:0.88,diameter:0.07},scene); col.parent=g; col.position.y=0.44; col.material=pbr(0.6,0.6,0.6,0.8,0.25,scene);
  });

  // Executive desks with credenzas
  [[-27,-38],[27,-38],[-27,38],[27,38]].forEach(([x,z],i)=>{
    officeDesk(x,z,x<0?Math.PI/2:-Math.PI/2,scene);
    // Credenza (side cabinet)
    const cred=BABYLON.MeshBuilder.CreateBox('cred'+i,{width:1.8,height:0.75,depth:0.5},scene);
    cred.position.set(x+(x<0?1.5:-1.5),0.375,z); cred.material=mah;
    const credtop=BABYLON.MeshBuilder.CreateBox('crdt'+i,{width:1.82,height:0.04,depth:0.52},scene);
    credtop.position.set(x+(x<0?1.5:-1.5),0.77,z); credtop.material=pbr(0.84,0.8,0.75,0.2,0.28,scene);
    // Trophy on credenza
    const tr=BABYLON.MeshBuilder.CreateCylinder('tr'+i,{height:0.62,diameterTop:0.12,diameterBottom:0.24},scene);
    tr.position.set(x+(x<0?1.8:-1.8),1.12,z); tr.material=gold;
    const trball=BABYLON.MeshBuilder.CreateSphere('trb'+i,{diameter:0.18},scene);
    trball.position.set(x+(x<0?1.8:-1.8),1.5,z); trball.material=gold;
    // Framed art on adjacent wall section
    wallPoster(x<0?-30.6:-30.6, 4.0, z, x<0?Math.PI/2:-Math.PI/2, 1.2, 0.9, [0.55,0.42,0.28], scene);
  });

  // Wall art & plaques
  wallPoster(0,4.5,-45.7,0,2.0,1.3,[0.28,0.2,0.12],scene);
  wallPoster(-18,4.5,-45.7,0,1.4,0.9,[0.45,0.35,0.18],scene);
  wallPoster(18,4.5,-45.7,0,1.4,0.9,[0.35,0.22,0.12],scene);
  wallClock(0,5.5,-45.7,0,scene);
  wallClock(0,5.5,45.7,Math.PI,scene);

  // Notice board / awards wall
  noticeboard(-29.5,4,30,Math.PI/2,scene);
  noticeboard(-29.5,4,10,Math.PI/2,scene);

  // Fire extinguishers (subtle, in corners)
  [[-29,44],[-29,-44],[29,44],[29,-44]].forEach(([x,z])=>fireExt(x,z,scene));

  // Plants in ornate positions
  [[-28,38],[28,38],[-28,-38],[28,-38],[-28,0],[28,0]].forEach(([x,z])=>plant(x,z,scene));
  waterCooler(-28,22,scene);

  // Narrow winding track
  const rawPts = [
    new BABYLON.Vector3(0,0,-40),
    new BABYLON.Vector3(-18,0,-38),
    new BABYLON.Vector3(-20,0,-24),
    new BABYLON.Vector3(-18,0,-10),
    new BABYLON.Vector3(-20,0,5),
    new BABYLON.Vector3(-18,0,20),
    new BABYLON.Vector3(-20,0,35),
    new BABYLON.Vector3(0,0,40),
    new BABYLON.Vector3(20,0,35),
    new BABYLON.Vector3(18,0,20),
    new BABYLON.Vector3(20,0,5),
    new BABYLON.Vector3(18,0,-10),
    new BABYLON.Vector3(20,0,-24),
    new BABYLON.Vector3(18,0,-38),
  ];
  buildRoad(rawPts, 7, scene);
  startFinishLine(0,-40,0,scene);
  cpData = rawPts.map((p,i)=>({x:p.x,z:p.z,finish:i===0}));

  spawnRacers(scene, 0, -38, shadows);
}
