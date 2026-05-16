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

  // Follow camera – low angle like Mario Kart
  camera = new BABYLON.FollowCamera('cam', new BABYLON.Vector3(0, 4, -14), scene);
  camera.radius = 11;
  camera.heightOffset = 3.5;
  camera.rotationOffset = 180;
  camera.cameraAcceleration = 0.06;
  camera.maxCameraSpeed = 22;
  camera.fov = 1.1;

  mmCtx = document.getElementById('mm').getContext('2d');

  const tracks = [buildCubicleCanyon, buildOpenOffice, buildExecutiveSuite];
  tracks[currentTrack](scene, shadows);

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

// ── Fluorescent ceiling light ─────────────────────────────────────────────────
function fluorescentLight(x,z,scene) {
  const fix = BABYLON.MeshBuilder.CreateBox('fl'+x+z,{width:0.18,height:0.04,depth:1.4},scene);
  fix.position.set(x, 3.18, z);
  const mat = pbr(1,1,0.9,0,0.05,scene); fix.material=mat;
  const pl = new BABYLON.PointLight('pl'+x+z, new BABYLON.Vector3(x,3,z), scene);
  pl.intensity=0.55; pl.range=9;
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

// ── Office floor tiles ────────────────────────────────────────────────────────
function officeTiles(w,d,cx,cz,scene,col) {
  const mat=pbr(...col,0.05,0.35,scene);
  const floor=BABYLON.MeshBuilder.CreateBox('offl',{width:w,height:0.08,depth:d},scene);
  floor.position.set(cx,-0.04,cz); floor.material=mat; floor.receiveShadows=true;
  return floor;
}

// ── Suspended ceiling ─────────────────────────────────────────────────────────
function suspendedCeiling(w,d,cx,cz,h,scene) {
  const ceil=BABYLON.MeshBuilder.CreateBox('ceil',{width:w,height:0.15,depth:d},scene);
  ceil.position.set(cx,h+0.075,cz);
  ceil.material=pbr(0.94,0.94,0.92,0,0.95,scene);
  // Grid lines
  for (let x=cx-w/2; x<cx+w/2; x+=2) {
    const gl=BABYLON.MeshBuilder.CreateBox('cgl'+x,{width:0.05,height:0.1,depth:d},scene);
    gl.position.set(x,h+0.04,cz); gl.material=pbr(0.75,0.75,0.75,0.5,0.6,scene);
  }
  for (let z=cz-d/2; z<cz+d/2; z+=2) {
    const gl=BABYLON.MeshBuilder.CreateBox('cgz'+z,{width:w,height:0.1,depth:0.05},scene);
    gl.position.set(cx,h+0.04,z); gl.material=pbr(0.75,0.75,0.75,0.5,0.6,scene);
  }
}

// ── Outer walls ───────────────────────────────────────────────────────────────
function outerWalls(minX,maxX,minZ,maxZ,h,scene,wallMat,windowMat) {
  const W=maxX-minX, D=maxZ-minZ;
  // N/S walls with windows
  [[0,minZ,W],[0,maxZ,W]].forEach(([x,z,w],si)=>{
    const wall=BABYLON.MeshBuilder.CreateBox('ow'+si,{width:w,height:h,depth:0.3},scene);
    wall.position.set(x,h/2,z); wall.material=wallMat; wall.receiveShadows=true;
    // Window panels
    for (let wx=minX+3; wx<maxX-2; wx+=5) {
      const win=BABYLON.MeshBuilder.CreateBox('win'+si+wx,{width:3,height:h*0.55,depth:0.05},scene);
      win.position.set(wx,h*0.55,z+(si===0?0.16:-0.16)); win.material=windowMat;
    }
  });
  // E/W walls
  [[minX,0,D],[maxX,0,D]].forEach(([x,z,d],si)=>{
    const wall=BABYLON.MeshBuilder.CreateBox('ow2'+si,{width:0.3,height:h,depth:d},scene);
    wall.position.set(x,h/2,z); wall.material=wallMat;
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

  const wallMat= pbr(0.9,0.9,0.88,0,0.85,scene);
  const winMat = pbr(0.55,0.75,0.88,0.05,0.08,scene);
  const carpMat= pbr(0.42,0.46,0.5,0,0.99,scene);

  // Room
  officeTiles(80,84, 0,0, scene,[0.88,0.88,0.86]);
  suspendedCeiling(80,84, 0,0, 3.2,scene);
  outerWalls(-40,40,-42,42, 3.2,scene,wallMat,winMat);
  baseboard(-40,40,-42,42,scene,pbr(0.72,0.68,0.6,0,0.8,scene));

  // Carpet runner in office areas
  const carp=BABYLON.MeshBuilder.CreateBox('carp',{width:10,height:0.01,depth:84},scene);
  carp.position.set(0,0.01,0); carp.material=carpMat;

  // Lights grid
  for (let x=-24; x<=24; x+=12) for (let z=-36; z<=36; z+=8) fluorescentLight(x,z,scene);

  // ── Track (Mario-Kart loop around cubicle rows) ──
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

  // Checkpoints at each raw waypoint
  cpData = rawPts.map((p,i)=>({x:p.x,z:p.z,finish:i===0}));

  // ── Office furniture (outside track) ──
  // Left cubicle farm
  for (let row=0; row<3; row++) {
    for (let col=0; col<5; col++) {
      const cx=-12-row*6, cz=-20+col*10;
      cubicleWall(cx+1,cz, 3.5, 0, scene);
      cubicleWall(cx,cz+1.75, 3.5, Math.PI/2, scene);
      officeDesk(cx-0.5,cz, 0, scene);
    }
  }
  // Right cubicle farm
  for (let row=0; row<3; row++) {
    for (let col=0; col<5; col++) {
      const cx=12+row*6, cz=-20+col*10;
      cubicleWall(cx-1,cz, 3.5, 0, scene);
      cubicleWall(cx,cz+1.75, 3.5, Math.PI/2, scene);
      officeDesk(cx+0.5,cz, 0, scene);
    }
  }

  // Plants, cabinets, coolers dotted around
  [[-36,-38],[36,-38],[-36,38],[36,38],[-36,0],[36,0]].forEach(([x,z])=>plant(x,z,scene));
  [[-35,-25],[35,-25],[-35,25],[35,25]].forEach(([x,z])=>cabinet(x,z,0,scene));
  [[-38,10],[38,-10]].forEach(([x,z])=>waterCooler(x,z,scene));

  // Motivational poster on N wall
  const poster=BABYLON.MeshBuilder.CreateBox('poster',{width:1.8,height:1.2,depth:0.03},scene);
  poster.position.set(-8,1.8,-41.8);
  poster.material=pbr(0.2,0.45,0.75,0,0.7,scene);

  spawnRacers(scene, 0, -34, shadows);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK 1 – OPEN OFFICE CHAOS
// ═══════════════════════════════════════════════════════════════════════════════
function buildOpenOffice(scene, shadows) {
  scene.fogColor = new BABYLON.Color3(0.9,0.92,0.88);
  scene.clearColor= new BABYLON.Color4(0.9,0.92,0.88,1);

  const conc  = pbr(0.52,0.52,0.5, 0,0.95,scene);
  const wallM = pbr(0.96,0.95,0.92,0,0.88,scene);
  const glass = pbr(0.6,0.8,0.9,0.05,0.08,scene);

  // Room (bigger, open)
  officeTiles(90,100,0,0,scene,[0.52,0.52,0.5]);
  suspendedCeiling(90,100,0,0, 3.8,scene);
  outerWalls(-45,45,-50,50,3.8,scene,wallM,glass);
  baseboard(-45,45,-50,50,scene,pbr(0.7,0.68,0.62,0,0.8,scene));

  // Exposed duct runs on ceiling
  for (let z=-45; z<=45; z+=12) {
    const duct=BABYLON.MeshBuilder.CreateBox('duct'+z,{width:0.7,height:0.45,depth:90},scene);
    duct.position.set(-16,3.6,z); duct.material=pbr(0.45,0.45,0.47,0.6,0.4,scene);
    const d2=duct.clone('d2'+z); d2.position.x=16;
  }

  for (let x=-36; x<=36; x+=9) for (let z=-44; z<=44; z+=9) fluorescentLight(x,z,scene);

  // Snaking track through open space
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

  // Standing desk clusters (beside track, not blocking)
  const deskPos=[[-18,-30],[18,-30],[-18,-10],[18,-10],[-18,10],[18,10],[-18,28],[18,28],[0,-18],[0,18],[0,0]];
  deskPos.forEach(([x,z])=>officeDesk(x,z,Math.random()*Math.PI*2,scene));

  // Whiteboards as scenic dividers
  const wbMat=pbr(0.97,0.97,0.96,0,0.5,scene);
  [[-6,-36,true],[6,10,true],[-6,28,false],[8,-15,false]].forEach(([x,z,vert],i)=>{
    const wb=BABYLON.MeshBuilder.CreateBox('wb'+i,{width:vert?0.08:3,height:1.8,depth:vert?3:0.08},scene);
    wb.position.set(x,0.9,z); wb.material=wbMat;
    const frame=BABYLON.MeshBuilder.CreateBox('wbf'+i,{width:vert?0.12:3.2,height:1.85,depth:vert?3.2:0.12},scene);
    frame.position.set(x,0.9,z); frame.material=pbr(0.15,0.15,0.15,0.5,0.5,scene);
  });

  // Bean bags
  const bb=pbr(0.78,0.22,0.45,0,0.9,scene);
  [[-40,35],[40,-35],[-40,-35],[40,35]].forEach(([x,z])=>{
    const bag=BABYLON.MeshBuilder.CreateSphere('bb'+x,{diameter:1.1},scene); bag.position.set(x,0.55,z); bag.material=bb; bag.scaling.y=0.7;
  });

  [[-42,-42],[42,-42],[-42,42],[42,42],[-42,0],[42,0]].forEach(([x,z])=>plant(x,z,scene));
  waterCooler(-42,20,scene); waterCooler(42,-20,scene);

  spawnRacers(scene, 0,-42, shadows);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACK 2 – EXECUTIVE SUITE
// ═══════════════════════════════════════════════════════════════════════════════
function buildExecutiveSuite(scene, shadows) {
  scene.fogColor = new BABYLON.Color3(0.14,0.11,0.09);
  scene.clearColor= new BABYLON.Color4(0.12,0.09,0.07,1);
  scene.fogStart=35; scene.fogEnd=80;

  const marble = pbr(0.86,0.83,0.78,0.25,0.28,scene);
  const mah    = pbr(0.32,0.16,0.08,0.1, 0.4, scene);
  const gold   = pbr(0.83,0.67,0.2, 0.95,0.18,scene);
  const darkW  = pbr(0.2, 0.16,0.12,0,   0.75,scene);
  const glass  = pbr(0.5, 0.72,0.84,0.1, 0.06,scene);
  const carp   = pbr(0.32,0.22,0.42,0,   0.99,scene);

  officeTiles(62,92, 0,0, scene, [0.84,0.81,0.76]);
  suspendedCeiling(62,92, 0,0, 4.0, scene);
  outerWalls(-31,31,-46,46, 4.0, scene, darkW, glass);

  // Gold trim
  const trimMat=gold;
  [-31,31].forEach(x=>{
    const v=BABYLON.MeshBuilder.CreateBox('vt'+x,{width:0.12,height:4,depth:92},scene); v.position.set(x,2,0); v.material=trimMat;
  });
  [-46,46].forEach(z=>{
    const h=BABYLON.MeshBuilder.CreateBox('ht'+z,{width:62,height:0.12,depth:0.18},scene); h.position.set(0,0.06,z); h.material=trimMat;
    const ht2=h.clone('ht2'+z); ht2.position.y=3.88;
  });

  // Carpet runner
  const runner=BABYLON.MeshBuilder.CreateBox('runner',{width:4,height:0.01,depth:92},scene);
  runner.position.set(0,0.01,0); runner.material=carp;

  // Chandeliers
  [[0,-30],[0,0],[0,30]].forEach(([x,z])=>{
    const chain=BABYLON.MeshBuilder.CreateCylinder('chain'+z,{height:1.2,diameter:0.03},scene);
    chain.position.set(x,3.4,z); chain.material=gold;
    const bowl=BABYLON.MeshBuilder.CreateSphere('bowl'+z,{diameter:1.0},scene);
    bowl.position.set(x,2.7,z); bowl.material=pbr(0.88,0.92,0.98,0.1,0.05,scene); bowl.scaling.y=0.5;
    const pl=new BABYLON.PointLight('cpl'+z,new BABYLON.Vector3(x,2.5,z),scene);
    pl.intensity=1.2; pl.range=18; pl.diffuse=new BABYLON.Color3(1,0.9,0.72);
  });

  // Marble pillars lining the room
  [[-22,-36],[-22,-18],[-22,0],[-22,18],[-22,36],[22,-36],[22,-18],[22,0],[22,18],[22,36]].forEach(([x,z])=>{
    const p=BABYLON.MeshBuilder.CreateCylinder('pil'+x+z,{height:4,diameter:1.1},scene);
    p.position.set(x,2,z); p.material=marble;
    const cap=BABYLON.MeshBuilder.CreateCylinder('cap'+x+z,{height:0.2,diameter:1.3},scene);
    cap.position.set(x,4.1,z); cap.material=gold;
    const base=cap.clone('base'+x+z); base.position.y=0.1;
    shadows.addShadowCaster(p,true);
  });

  // Boardroom table
  const bt=BABYLON.MeshBuilder.CreateBox('bt',{width:5.5,height:0.12,depth:12},scene);
  bt.position.set(0,0.82,0); bt.material=mah;
  shadows.addShadowCaster(bt,true);
  // Table legs
  [[-2.4,-5.2],[-2.4,5.2],[2.4,-5.2],[2.4,5.2]].forEach(([x,z])=>{
    const tl=BABYLON.MeshBuilder.CreateCylinder('tl'+x,{height:0.82,diameter:0.25},scene);
    tl.position.set(x,0.41,z); tl.material=mah;
  });

  // Boardroom chairs around table
  const bcMat=pbr(0.08,0.06,0.05,0.2,0.7,scene);
  for (let z=-4.5; z<=4.5; z+=2) {
    [[-3.8,z],[3.8,z]].forEach(([x,zz])=>{
      const bc=BABYLON.MeshBuilder.CreateBox('bc'+x+zz,{width:0.55,height:0.08,depth:0.55},scene);
      bc.position.set(x,0.9,zz); bc.material=bcMat;
      const bcb=BABYLON.MeshBuilder.CreateBox('bcb'+x+zz,{width:0.52,height:0.7,depth:0.08},scene);
      bcb.position.set(x,1.25,zz-(x<0?-0.25:0.25)); bcb.material=bcMat;
    });
  }

  // Executive desks in side alcoves
  [[-27,-38],[27,-38],[-27,38],[27,38]].forEach(([x,z],i)=>{
    officeDesk(x,z,x<0?Math.PI/2:-Math.PI/2,scene);
    // Trophy
    const tr=BABYLON.MeshBuilder.CreateCylinder('tr'+i,{height:0.55,diameterTop:0.1,diameterBottom:0.2},scene);
    tr.position.set(x+0.5,1.1,z); tr.material=gold;
  });

  // Narrow winding track with tight corners
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

  [[-28,0],[28,0],[-28,-20],[28,20]].forEach(([x,z])=>plant(x,z,scene));
  waterCooler(-28,15,scene);

  spawnRacers(scene, 0, -38, shadows);
}
