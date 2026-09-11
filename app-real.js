import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const viewer = $('#viewer');
const loading = $('#loading');
const progress = $('#progress');
const title = $('#partTitle');
const kicker = $('#partKicker');
const desc = $('#partDesc');
const specs = $('#specs');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04080f);
scene.fog = new THREE.FogExp2(0x050a12, 0.055);

const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
camera.position.set(7.8, 4.1, 8.4);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.55;
controls.minDistance = 4.2;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.58;

scene.add(new THREE.HemisphereLight(0xbfe7ff, 0x101217, 4.0));
const key = new THREE.DirectionalLight(0xffffff, 6.5); key.position.set(5, 7, 6); key.castShadow = true; scene.add(key);
const rimA = new THREE.DirectionalLight(0x32b7ff, 5.5); rimA.position.set(-6, 3, -5); scene.add(rimA);
const rimB = new THREE.DirectionalLight(0xff6a3d, 3.6); rimB.position.set(5, 2, -5); scene.add(rimB);
const top = new THREE.PointLight(0xeaf7ff, 18, 20, 1.7); top.position.set(0, 6, 0); scene.add(top);

const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 96), new THREE.MeshStandardMaterial({ color: 0x0b121a, metalness: .28, roughness: .7 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -1.45;
floor.receiveShadow = true;
scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(3.25, 3.33, 128), new THREE.MeshBasicMaterial({ color: 0x168fd0, transparent: true, opacity: .85, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2;
ring.position.y = -1.438;
scene.add(ring);

let model = null;
let modelBox = null;
let selected = 'engine';
let xray = false;
let exploded = false;
let originalTransforms = new Map();
let bodyMaterials = [];
let pickMeshes = [];
let hotspots = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const info = {
  engine: ['POWERTRAIN / 01', 'Engine', 'The engine converts fuel energy into rotational force that drives the vehicle. Explore the real 3D model and inspect the front powertrain area.', ['SYSTEM', 'Powertrain', 'FUNCTION', 'Creates torque']],
  transmission: ['DRIVETRAIN / 02', 'Transmission', 'The transmission changes gear ratios and transfers engine torque toward the driven wheels.', ['SYSTEM', 'Drivetrain', 'FUNCTION', 'Gear ratio control']],
  suspension: ['CHASSIS / 03', 'Suspension', 'Springs, dampers and links keep the tires controlled while isolating the body from road impacts.', ['SYSTEM', 'Chassis', 'FUNCTION', 'Wheel control']],
  brakes: ['CHASSIS / 04', 'Braking System', 'Brake discs and calipers convert kinetic energy into heat to slow the vehicle.', ['SYSTEM', 'Chassis', 'FUNCTION', 'Deceleration']],
  steering: ['CHASSIS / 05', 'Steering', 'The steering system turns driver input into controlled front-wheel angle.', ['SYSTEM', 'Chassis', 'FUNCTION', 'Direction control']],
  cooling: ['THERMAL / 06', 'Cooling System', 'The cooling circuit moves heat away from the engine and keeps operating temperatures stable.', ['SYSTEM', 'Thermal', 'FUNCTION', 'Heat rejection']],
  exhaust: ['POWERTRAIN / 07', 'Exhaust System', 'The exhaust system routes combustion gases away from the engine while controlling noise and emissions.', ['SYSTEM', 'Powertrain', 'FUNCTION', 'Gas flow']],
  body: ['STRUCTURE / 08', 'Body Structure', 'The body shell provides the vehicle shape, crash structure and mounting points for major systems.', ['SYSTEM', 'Structure', 'FUNCTION', 'Protection & rigidity']],
  interior: ['CABIN / 09', 'Interior', 'The cabin integrates the seats, controls, instrumentation and driver interface.', ['SYSTEM', 'Cabin', 'FUNCTION', 'Human interface']]
};

function setPanel(id) {
  selected = info[id] ? id : 'body';
  const d = info[selected];
  kicker.textContent = d[0];
  title.textContent = d[1];
  desc.textContent = d[2];
  specs.innerHTML = `<div><span>${d[3][0]}</span><strong>${d[3][1]}</strong></div><div><span>${d[3][2]}</span><strong>${d[3][3]}</strong></div>`;
  document.querySelectorAll('.system').forEach((b) => b.classList.toggle('active', b.dataset.part === selected));
}

function fromB64(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function gunzip(bytes) {
  if (!('DecompressionStream' in window)) throw new Error('This browser does not support model decompression.');
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return await new Response(stream).arrayBuffer();
}

function fitModel(root) {
  root.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(root);
  const size = b.getSize(new THREE.Vector3());
  const center = b.getCenter(new THREE.Vector3());
  const scale = 6.2 / Math.max(size.x, size.y, size.z);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root);
  const c2 = b2.getCenter(new THREE.Vector3());
  root.position.sub(c2);
  root.position.y -= b2.min.y + 1.18;
  root.rotation.y = -0.42;
  root.updateMatrixWorld(true);
  modelBox = new THREE.Box3().setFromObject(root);
  const s = modelBox.getSize(new THREE.Vector3());
  controls.target.set(0, Math.max(.2, s.y * .18), 0);
  camera.position.set(Math.max(6.4, s.x * 1.25), Math.max(3.0, s.y * .82), Math.max(7.2, s.z * 1.2));
}

function classifyMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    pickMeshes.push(o);
    originalTransforms.set(o, { p: o.position.clone(), q: o.quaternion.clone() });
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      const n = `${m.name || ''} ${o.name || ''}`.toLowerCase();
      if (/paint gloss red|paint metallic|paint gloss black|matte black/.test(n)) bodyMaterials.push(m);
      if (/glass/.test(n)) {
        m.transparent = true;
        m.opacity = .24;
        m.depthWrite = false;
        if ('roughness' in m) m.roughness = .08;
      }
      if ('metalness' in m && /(steel|alum|metal|carbon)/.test(n)) m.metalness = Math.max(m.metalness || 0, .65);
      m.needsUpdate = true;
    });
  });
  bodyMaterials = [...new Set(bodyMaterials)];
}

function addHotspot(id, rel, color = 0x22b7ff) {
  const s = modelBox.getSize(new THREE.Vector3());
  const min = modelBox.min;
  const p = new THREE.Vector3(min.x + s.x * rel[0], min.y + s.y * rel[1], min.z + s.z * rel[2]);
  const g = new THREE.Group();
  g.position.copy(p);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.055, 18, 12), new THREE.MeshBasicMaterial({ color }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.105, 18, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, depthWrite: false }));
  g.add(core, halo);
  g.userData.part = id;
  core.userData.part = id;
  halo.userData.part = id;
  scene.add(g);
  hotspots.push(g, core, halo);
}

function buildHotspots() {
  addHotspot('engine', [.5, .46, .17]);
  addHotspot('transmission', [.5, .27, .43]);
  addHotspot('suspension', [.16, .28, .24]);
  addHotspot('brakes', [.08, .22, .22]);
  addHotspot('steering', [.47, .57, .56]);
  addHotspot('cooling', [.5, .4, .08]);
  addHotspot('exhaust', [.55, .18, .73], 0xff7046);
  addHotspot('interior', [.52, .64, .52]);
  addHotspot('body', [.72, .62, .5]);
}

function focusPart(id) {
  if (!modelBox) return;
  const map = {
    engine: [.5,.45,.18], transmission:[.5,.3,.43], suspension:[.16,.28,.25], brakes:[.08,.22,.22], steering:[.48,.58,.55], cooling:[.5,.4,.08], exhaust:[.55,.18,.74], interior:[.52,.65,.52], body:[.7,.58,.5]
  };
  const rel = map[id] || [.5,.5,.5];
  const s = modelBox.getSize(new THREE.Vector3());
  const t = new THREE.Vector3(modelBox.min.x+s.x*rel[0], modelBox.min.y+s.y*rel[1], modelBox.min.z+s.z*rel[2]);
  controls.target.copy(t);
  const dir = camera.position.clone().sub(t).normalize();
  camera.position.copy(t.clone().add(dir.multiplyScalar(4.6)));
  controls.autoRotate = false;
  $('#autoBtn').classList.remove('active');
}

function toggleXray() {
  xray = !xray;
  bodyMaterials.forEach((m) => {
    m.transparent = xray;
    m.opacity = xray ? .17 : 1;
    m.depthWrite = !xray;
    if ('roughness' in m) m.roughness = xray ? .12 : Math.max(m.roughness || .22, .16);
    m.needsUpdate = true;
  });
  $('#xrayBtn').classList.toggle('active', xray);
}

function toggleExplode() {
  exploded = !exploded;
  if (!model || !modelBox) return;
  const c = modelBox.getCenter(new THREE.Vector3());
  model.traverse((o) => {
    if (!o.isMesh || !originalTransforms.has(o)) return;
    const orig = originalTransforms.get(o);
    if (!exploded) { o.position.copy(orig.p); return; }
    const world = new THREE.Vector3(); o.getWorldPosition(world);
    const dir = world.sub(c).normalize();
    o.position.copy(orig.p).add(dir.multiplyScalar(.18));
  });
  $('#explodeBtn').classList.toggle('active', exploded);
}

function resize() {
  const r = viewer.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / Math.max(1, r.height);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);

canvas.addEventListener('pointerdown', () => controls.autoRotate = false);
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX-r.left)/r.width)*2-1;
  pointer.y = -((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(pointer, camera);
  canvas.style.cursor = raycaster.intersectObjects(hotspots, true).length ? 'pointer' : 'grab';
});
canvas.addEventListener('click', (e) => {
  const r = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX-r.left)/r.width)*2-1;
  pointer.y = -((e.clientY-r.top)/r.height)*2+1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hotspots, true)[0];
  if (hit) {
    let o = hit.object;
    while (o && !o.userData.part) o = o.parent;
    if (o?.userData.part) { setPanel(o.userData.part); focusPart(o.userData.part); }
  }
});

document.querySelectorAll('.system').forEach((b) => b.addEventListener('click', () => { setPanel(b.dataset.part); focusPart(b.dataset.part); }));
$('#xrayBtn').addEventListener('click', toggleXray);
$('#explodeBtn').addEventListener('click', toggleExplode);
$('#resetBtn').addEventListener('click', () => { controls.target.set(0,.45,0); camera.position.set(7.8,4.1,8.4); controls.autoRotate = false; });
$('#autoBtn').addEventListener('click', (e) => { controls.autoRotate = !controls.autoRotate; e.currentTarget.classList.toggle('active', controls.autoRotate); });

async function loadCar() {
  try {
    progress.textContent = 'Assembling uploaded 3D model…';
    if (!window.__CARMINI || window.__CARMINI.length < 1000) throw new Error('3D model data is incomplete.');
    const zipped = fromB64(window.__CARMINI);
    progress.textContent = 'Decompressing geometry…';
    const buffer = await gunzip(zipped);
    progress.textContent = 'Building materials and lighting…';
    const loader = new GLTFLoader();
    const gltf = await new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
    model = gltf.scene;
    classifyMaterials(model);
    scene.add(model);
    fitModel(model);
    modelBox = new THREE.Box3().setFromObject(model);
    buildHotspots();
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 650);
    setPanel('engine');
  } catch (err) {
    console.error(err);
    progress.textContent = 'Could not load the 3D car model.';
    loading.classList.add('error');
  }
}

function animate() {
  requestAnimationFrame(animate);
  hotspots.forEach((o, i) => { if (o.isMesh && o.geometry?.type === 'SphereGeometry' && i % 3 === 2) o.scale.setScalar(1 + Math.sin(performance.now()*.003+i)*.08); });
  controls.update();
  renderer.render(scene, camera);
}
resize();
loadCar();
animate();
