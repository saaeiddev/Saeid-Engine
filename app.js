import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('#scene');
const viewer = document.querySelector('#viewer');
const loading = document.querySelector('#loading');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080a0e, 0.035);

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 120);
camera.position.set(9.2, 4.4, 10.3);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .055;
controls.target.set(0, .65, 0);
controls.minDistance = 6;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI * .53;
controls.autoRotateSpeed = .65;

scene.add(new THREE.HemisphereLight(0xdde8ff, 0x1a110d, 2.3));
const key = new THREE.DirectionalLight(0xffffff, 5.4); key.position.set(5, 8, 7); key.castShadow = true; key.shadow.mapSize.set(2048,2048); scene.add(key);
const rim = new THREE.PointLight(0xff532d, 34, 16, 1.8); rim.position.set(-4,2.5,-4); scene.add(rim);
const cool = new THREE.PointLight(0x68d7ff, 23, 14, 1.7); cool.position.set(4,3,-3); scene.add(cool);

const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshStandardMaterial({color:0x0c0f14,roughness:.78,metalness:.15,transparent:true,opacity:.97}));
floor.rotation.x = -Math.PI/2; floor.position.y = -.76; floor.receiveShadow = true; scene.add(floor);
const ring = new THREE.Mesh(new THREE.RingGeometry(4.3,4.34,128), new THREE.MeshBasicMaterial({color:0x653124,transparent:true,opacity:.62,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=-.73; scene.add(ring);

const car = new THREE.Group(); car.rotation.y = -.48; scene.add(car);
const pickables = []; const parts = new Map(); const baseTransforms = new Map();

const info = {
  engine:{kicker:'POWERTRAIN / 01',title:'Twin-Turbo V8 Engine',text:'The engine turns fuel energy into mechanical rotation. Air and fuel are compressed, ignited and converted into crankshaft torque through the piston and connecting-rod assembly.',spec:[['LAYOUT','V8'],['CYCLE','4-Stroke'],['BOOST','Twin Turbo'],['OUTPUT','Crank Torque']]},
  pistons:{kicker:'ENGINE INTERNALS',title:'Pistons & Connecting Rods',text:'Pistons travel inside the cylinders. Combustion pressure pushes them downward while connecting rods transfer that linear force to the rotating crankshaft.',spec:[['MOTION','Reciprocating'],['MATERIAL','Forged Alloy'],['SEAL','Piston Rings'],['LINK','Connecting Rod']]},
  crankshaft:{kicker:'ENGINE INTERNALS',title:'Crankshaft',text:'The crankshaft converts the up-and-down piston motion into smooth rotational motion that can be transferred through the flywheel to the transmission.',spec:[['ROLE','Rotation'],['SUPPORT','Main Bearings'],['BALANCE','Counterweights'],['LINK','Flywheel']]},
  transmission:{kicker:'DRIVETRAIN / 02',title:'Transmission',text:'The gearbox changes the ratio between engine speed and wheel speed. Lower gears multiply torque; higher gears improve efficiency at road speed.',spec:[['TYPE','8-Speed'],['INPUT','Engine Torque'],['OUTPUT','Drive Shaft'],['CONTROL','Electronic']]},
  brakes:{kicker:'CHASSIS / 03',title:'Disc Brakes',text:'Brake calipers squeeze high-friction pads against rotating discs, converting the vehicle’s kinetic energy into heat to slow each wheel.',spec:[['TYPE','Ventilated Disc'],['ACTUATION','Hydraulic'],['CONTROL','ABS'],['ENERGY','Heat']]},
  suspension:{kicker:'CHASSIS / 04',title:'Independent Suspension',text:'Springs support the vehicle while dampers control oscillation. Independent geometry allows each wheel to follow the road with less disturbance to the chassis.',spec:[['FRONT','Double Wishbone'],['REAR','Multi-Link'],['SPRING','Coil'],['DAMPING','Adaptive']]},
  steering:{kicker:'CHASSIS / 05',title:'Rack & Pinion Steering',text:'The steering rack turns steering-wheel input into left/right movement at the tie rods, controlling front-wheel angle and vehicle direction.',spec:[['TYPE','Rack & Pinion'],['ASSIST','Electric'],['LINK','Tie Rods'],['GEOMETRY','Ackermann']]},
  exhaust:{kicker:'ENGINE / 06',title:'Exhaust System',text:'Exhaust gases leave the cylinders through headers, flow through catalytic treatment and silencers, then exit through the rear outlets.',spec:[['FLOW','Headers → Tailpipe'],['CONTROL','Catalyst'],['SOUND','Mufflers'],['SENSOR','O₂ / Lambda']]},
  turbo:{kicker:'AIR SYSTEM',title:'Turbochargers',text:'Turbochargers use exhaust-gas energy to spin a turbine connected to a compressor, forcing more air into the engine so more fuel can be burned efficiently.',spec:[['DRIVE','Exhaust Gas'],['COMPRESS','Intake Air'],['CONTROL','Wastegate'],['BENEFIT','Power Density']]},
  radiator:{kicker:'COOLING',title:'Radiator & Cooling Loop',text:'Coolant absorbs engine heat and carries it to the radiator, where airflow removes that heat before the coolant returns to the engine.',spec:[['FLUID','Coolant'],['PUMP','Mechanical/Electric'],['CONTROL','Thermostat'],['ROLE','Heat Rejection']]},
  tires:{kicker:'ROAD CONTACT',title:'Performance Tires',text:'Tires are the car’s only contact patches with the road. Their compound, pressure and temperature strongly influence braking, cornering and acceleration.',spec:[['CONSTRUCTION','Radial'],['GRIP','High Performance'],['LOAD','Vehicle Weight'],['ROLE','Traction']]}
};

const mats = {
  body:new THREE.MeshPhysicalMaterial({color:0x232a34,metalness:.82,roughness:.2,clearcoat:1,clearcoatRoughness:.08}),
  bodyGlass:new THREE.MeshPhysicalMaterial({color:0xbfdcff,metalness:.05,roughness:.08,transmission:.78,transparent:true,opacity:.28,thickness:.25,ior:1.45,side:THREE.DoubleSide}),
  darkGlass:new THREE.MeshPhysicalMaterial({color:0x10151c,metalness:.1,roughness:.08,transmission:.32,transparent:true,opacity:.58,thickness:.35}),
  metal:new THREE.MeshStandardMaterial({color:0x89929d,metalness:.92,roughness:.27}),
  darkMetal:new THREE.MeshStandardMaterial({color:0x222832,metalness:.88,roughness:.33}),
  engine:new THREE.MeshStandardMaterial({color:0x3c454f,metalness:.88,roughness:.28}),
  accent:new THREE.MeshStandardMaterial({color:0xe24b2e,metalness:.56,roughness:.27,emissive:0x2a0702,emissiveIntensity:.5}),
  rubber:new THREE.MeshStandardMaterial({color:0x090a0c,roughness:.77,metalness:.02}),
  brake:new THREE.MeshStandardMaterial({color:0xd35032,metalness:.56,roughness:.3}),
  disc:new THREE.MeshStandardMaterial({color:0x858b91,metalness:.9,roughness:.3}),
  pipe:new THREE.MeshStandardMaterial({color:0x666d74,metalness:.9,roughness:.26}),
  cyan:new THREE.MeshStandardMaterial({color:0x7fdfff,metalness:.32,roughness:.2,emissive:0x0c4158,emissiveIntensity:.9}),
};

function roundedBox(w,h,d,r=.14,segments=5){
  const shape=new THREE.Shape(); const x=-w/2,y=-h/2;
  shape.moveTo(x+r,y); shape.lineTo(x+w-r,y); shape.quadraticCurveTo(x+w,y,x+w,y+r); shape.lineTo(x+w,y+h-r); shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h); shape.lineTo(x+r,y+h); shape.quadraticCurveTo(x,y+h,x,y+h-r); shape.lineTo(x,y+r); shape.quadraticCurveTo(x,y,x+r,y);
  const g=new THREE.ExtrudeGeometry(shape,{depth:d,bevelEnabled:true,bevelSegments:segments,steps:1,bevelSize:r*.55,bevelThickness:r*.55}); g.center(); return g;
}
function mesh(geo,mat,pos=[0,0,0],rot=[0,0,0],parent=car){ const m=new THREE.Mesh(geo,mat); m.position.set(...pos); const rr=rot.length===3?rot:[0,0,0]; m.rotation.set(...rr); m.castShadow=m.receiveShadow=true; parent.add(m); return m; }
function register(obj,id,label=id){ obj.userData.part=id; obj.userData.label=label; pickables.push(obj); if(!parts.has(id)) parts.set(id,[]); parts.get(id).push(obj); }
function saveBase(obj, explode=[0,0,0]){baseTransforms.set(obj,{pos:obj.position.clone(),explode:new THREE.Vector3(...explode)});}

const chassis=mesh(roundedBox(6.9,.22,3.08,.16),mats.darkMetal,[0,-.12,0]);
mesh(roundedBox(5.4,.28,2.82,.18),mats.darkMetal,[-.2,.15,0]);
const hood=mesh(roundedBox(2.05,.18,2.72,.14),mats.bodyGlass,[2.02,1.09,0],[0,0,-.02]); register(hood,'engine','Transparent engine cover'); saveBase(hood,[0,.9,0]);
const cabin=mesh(roundedBox(2.45,1.15,2.54,.24),mats.darkGlass,[-.38,1.18,0]); cabin.rotation.z=.02;
const roof=mesh(roundedBox(2.45,.14,2.56,.14),mats.body,[-.52,1.8,0]);
const trunk=mesh(roundedBox(1.45,.36,2.72,.17),mats.body,[-2.45,.79,0]);
const frontBumper=mesh(roundedBox(.46,.58,2.84,.18),mats.body,[3.28,.38,0]);
const rearBumper=mesh(roundedBox(.42,.55,2.82,.18),mats.body,[-3.26,.39,0]);
const sillL=mesh(roundedBox(4.1,.32,.2,.08),mats.body,[-.45,.35,1.47]); const sillR=sillL.clone(); sillR.position.z=-1.47; car.add(sillR);
for(const z of [-1.38,1.38]){ mesh(roundedBox(6.05,.5,.16,.07),mats.body,[0,.72,z]); }
for(const z of [-.93,.93]){ mesh(roundedBox(.2,.18,.72,.07),new THREE.MeshStandardMaterial({color:0xf3fbff,emissive:0xbde8ff,emissiveIntensity:3}),[3.5,.72,z]); mesh(roundedBox(.18,.17,.65,.07),new THREE.MeshStandardMaterial({color:0xff3a24,emissive:0xff1200,emissiveIntensity:3}),[-3.48,.72,z]); }

const wheelPositions=[[2.17,.02,1.54],[2.17,.02,-1.54],[-2.12,.02,1.54],[-2.12,.02,-1.54]];
wheelPositions.forEach((p,i)=>{
  const g=new THREE.Group(); g.position.set(...p); car.add(g);
  const tire=mesh(new THREE.TorusGeometry(.67,.19,22,48),mats.rubber,[0,0,0],[0,0,0],g); register(tire,'tires','Tire');
  const rim=mesh(new THREE.CylinderGeometry(.47,.47,.18,32),mats.metal,[0,0,0],[Math.PI/2,0,0],g); register(rim,'brakes','Wheel hub');
  const disc=mesh(new THREE.CylinderGeometry(.34,.34,.07,32),mats.disc,[0,0,0],[Math.PI/2,0,0],g); register(disc,'brakes','Brake disc');
  const caliper=mesh(roundedBox(.12,.33,.24,.04),mats.brake,[.14,.02,zSign(p[2])*.03],i<2?[0,0,0]:[0,0,0],g); register(caliper,'brakes','Brake caliper');
  const strut=mesh(new THREE.CylinderGeometry(.055,.055,.82,16),mats.metal,[0,.58,-p[2]*.18],[0,0,p[0]>0?.22:-.2],g); register(strut,'suspension','Damper');
  const spring=new THREE.Mesh(new THREE.TorusGeometry(.16,.035,8,28),mats.accent); spring.rotation.x=Math.PI/2; spring.position.set(0,.58,-p[2]*.18); spring.scale.y=2.6; g.add(spring); register(spring,'suspension','Coil spring');
  saveBase(g,[Math.sign(p[0])*.35,.15,Math.sign(p[2])*.75]);
});
function zSign(v){return v<0?-1:1}

const engineGroup=new THREE.Group(); engineGroup.position.set(1.33,.62,0); car.add(engineGroup); saveBase(engineGroup,[.25,.55,0]);
const block=mesh(roundedBox(1.15,.62,1.28,.1),mats.engine,[0,0,0],[0,0,0],engineGroup); register(block,'engine','Engine block');
for(const side of [-1,1]){
  const head=mesh(roundedBox(.95,.35,.42,.08),mats.darkMetal,[0,.42,side*.47],[side*.12,0,0],engineGroup); register(head,'engine','Cylinder head');
  for(let i=0;i<4;i++){
    const x=-.42+i*.28;
    const piston=mesh(new THREE.CylinderGeometry(.09,.09,.18,24),mats.metal,[x,.05,side*.25],[Math.PI/2,0,0],engineGroup); register(piston,'pistons','Piston');
    const rod=mesh(new THREE.CylinderGeometry(.025,.025,.28,10),mats.metal,[x,-.12,side*.18],[Math.PI/2,0,0],engineGroup); register(rod,'pistons','Connecting rod');
  }
}
const crank=mesh(new THREE.CylinderGeometry(.075,.075,1.2,24),mats.accent,[0,-.25,0],[Math.PI/2,0,0],engineGroup); register(crank,'crankshaft','Crankshaft');
for(let i=0;i<5;i++){ const cw=mesh(new THREE.BoxGeometry(.18,.26,.12),mats.accent,[-.45+i*.23,-.25,0],[0,0,i%2?.42:-.42],engineGroup); register(cw,'crankshaft','Counterweight'); }
const intake=mesh(new THREE.CylinderGeometry(.16,.23,.95,24),mats.metal,[0,.72,0],[0,0,Math.PI/2],engineGroup); register(intake,'engine','Intake plenum');
for(const z of [-.73,.73]){ const turbo=mesh(new THREE.TorusGeometry(.22,.08,16,32),mats.accent,[.2,.35,z],[Math.PI/2,0,0],engineGroup); register(turbo,'turbo','Turbocharger'); }

const radiator=mesh(new THREE.BoxGeometry(.12,.72,1.65),mats.darkMetal,[2.55,.55,0]); register(radiator,'radiator','Radiator'); saveBase(radiator,[.6,.1,0]);
for(let i=-6;i<=6;i++) mesh(new THREE.BoxGeometry(.03,.58,.035),mats.metal,[2.48,.55,i*.115],[],car);

const transGroup=new THREE.Group(); transGroup.position.set(.2,.33,0); car.add(transGroup); saveBase(transGroup,[0,.55,0]);
const trans=mesh(new THREE.CylinderGeometry(.38,.24,1.0,24),mats.darkMetal,[0,0,0],[0,0,Math.PI/2],transGroup); register(trans,'transmission','Gearbox');
const shaft=mesh(new THREE.CylinderGeometry(.055,.055,2.5,16),mats.metal,[-1.65,-.02,0],[0,0,Math.PI/2],car); register(shaft,'transmission','Drive shaft'); saveBase(shaft,[0,-.25,0]);
const diff=mesh(new THREE.SphereGeometry(.32,24,16),mats.darkMetal,[-2.78,-.03,0]); diff.scale.set(1.3,.8,1); register(diff,'transmission','Differential');

const rack=mesh(new THREE.CylinderGeometry(.045,.045,1.8,14),mats.cyan,[2.12,.18,0],[Math.PI/2,0,0]); register(rack,'steering','Steering rack'); saveBase(rack,[0,.5,0]);
for(const z of [-1,1]){ const tie=mesh(new THREE.CylinderGeometry(.025,.025,.78,10),mats.cyan,[2.12,.18,z*.95],[Math.PI/2,0,0]); register(tie,'steering','Tie rod'); }

for(const z of [-.52,.52]){
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(1.35,.32,z),new THREE.Vector3(.7,.1,z),new THREE.Vector3(-.4,-.28,z),new THREE.Vector3(-2.65,-.3,z)]);
  const pipe=mesh(new THREE.TubeGeometry(curve,48,.055,10,false),mats.pipe); register(pipe,'exhaust','Exhaust pipe'); saveBase(pipe,[0,-.3,z*.45]);
  const muffler=mesh(roundedBox(.72,.23,.34,.08),mats.pipe,[-2.75,-.26,z*.7]); register(muffler,'exhaust','Muffler');
  const tail=mesh(new THREE.CylinderGeometry(.075,.075,.45,16),mats.pipe,[-3.25,-.2,z*.86],[0,0,Math.PI/2]); register(tail,'exhaust','Tailpipe');
}

for(const z of [-.67,.67]) mesh(roundedBox(.55,.7,.48,.12),mats.darkMetal,[-.75,.95,z],[0,0,-.12],car);
const steeringWheel=mesh(new THREE.TorusGeometry(.26,.035,12,30),mats.darkMetal,[-.12,1.2,-.72],[0,.35,Math.PI/2]); register(steeringWheel,'steering','Steering wheel');
for(const p of wheelPositions){ const arch=mesh(new THREE.TorusGeometry(.75,.045,12,40,Math.PI),mats.accent,[p[0],.1,p[2]],[0,0,p[2]>0?0:Math.PI]); arch.material=arch.material.clone(); arch.material.opacity=.55; arch.material.transparent=true; }

const hotspotData=[
  ['engine','Engine',new THREE.Vector3(1.35,1.45,.2)],['transmission','Transmission',new THREE.Vector3(.05,.55,.2)],['brakes','Brakes',new THREE.Vector3(2.15,.1,1.65)],['suspension','Suspension',new THREE.Vector3(-2.05,.68,-1.48)],['steering','Steering',new THREE.Vector3(1.95,.45,-.85)],['exhaust','Exhaust',new THREE.Vector3(-2.3,-.1,.7)]
];
const hotspotLayer=document.querySelector('#hotspots');
const hotspotNodes=hotspotData.map(([id,label,pos])=>{ const el=document.createElement('div'); el.className='hotspot'; el.dataset.label=label; hotspotLayer.appendChild(el); return {id,pos,el}; });

const raycaster=new THREE.Raycaster(); const pointer=new THREE.Vector2(); let selectedPart='engine';
function partFromObject(obj){ let o=obj; while(o){ if(o.userData?.part) return o.userData.part; o=o.parent; } return null; }
function selectPart(id,focus=false){ if(!info[id]) id = ['pistons','crankshaft','turbo','radiator','tires'].includes(id)?id:'engine'; selectedPart=id; document.querySelectorAll('.system').forEach(b=>b.classList.toggle('active',b.dataset.part===id)); updateInfo(id); pulsePart(id); if(focus) focusPart(id); }
function updateInfo(id){ const d=info[id]; if(!d)return; document.querySelector('#infoKicker').textContent=d.kicker; document.querySelector('#infoTitle').textContent=d.title; document.querySelector('#infoText').textContent=d.text; document.querySelector('#specGrid').innerHTML=d.spec.map(([a,b])=>`<div><small>${a}</small><strong>${b}</strong></div>`).join(''); document.querySelector('#infoCard').classList.remove('hidden'); }
function pulsePart(id){ const objs=parts.get(id)||[]; objs.forEach(o=>{ if(!o.material?.emissive)return; const original=o.material.emissiveIntensity||0; o.material.emissiveIntensity=Math.max(original,2.2); setTimeout(()=>{if(o.material)o.material.emissiveIntensity=original},420); }); }
function focusPart(id){ const objs=parts.get(id)||[]; if(!objs.length)return; const box=new THREE.Box3(); objs.forEach(o=>box.expandByObject(o)); const c=box.getCenter(new THREE.Vector3()); const size=box.getSize(new THREE.Vector3()).length(); controls.target.copy(c); const dir=camera.position.clone().sub(c).normalize(); camera.position.copy(c.clone().add(dir.multiplyScalar(Math.max(5.2,size*2.2)))); }

canvas.addEventListener('pointermove',e=>{ const r=canvas.getBoundingClientRect(); pointer.x=((e.clientX-r.left)/r.width)*2-1; pointer.y=-((e.clientY-r.top)/r.height)*2+1; raycaster.setFromCamera(pointer,camera); const hit=raycaster.intersectObjects(pickables,true)[0]; canvas.style.cursor=hit?'pointer':'grab'; });
canvas.addEventListener('click',e=>{ const r=canvas.getBoundingClientRect(); pointer.x=((e.clientX-r.left)/r.width)*2-1; pointer.y=-((e.clientY-r.top)/r.height)*2+1; raycaster.setFromCamera(pointer,camera); const hit=raycaster.intersectObjects(pickables,true)[0]; if(hit){ const id=partFromObject(hit.object); if(id) selectPart(id); }});
document.querySelectorAll('.system').forEach(b=>b.addEventListener('click',()=>selectPart(b.dataset.part,true)));
document.querySelector('#focusBtn').addEventListener('click',()=>focusPart(selectedPart));
document.querySelector('#closeCard').addEventListener('click',()=>document.querySelector('#infoCard').classList.add('hidden'));

document.querySelector('#resetView').addEventListener('click',()=>{ camera.position.set(9.2,4.4,10.3); controls.target.set(0,.65,0); });
let auto=false; document.querySelector('#autoRotateBtn').addEventListener('click',()=>{auto=!auto;controls.autoRotate=auto;document.querySelector('#autoRotateBtn').classList.toggle('active',auto)});
let exploded=false; document.querySelector('#explodeBtn').addEventListener('click',e=>{ exploded=!exploded; e.currentTarget.classList.toggle('active',exploded); e.currentTarget.setAttribute('aria-pressed',String(exploded)); });
let xray=true; document.querySelector('#xrayBtn').addEventListener('click',e=>{ xray=!xray; e.currentTarget.classList.toggle('active',xray); e.currentTarget.setAttribute('aria-pressed',String(xray)); hood.material.opacity=xray?.28:1; hood.material.transmission=xray?.78:0; hood.material.color.setHex(xray?0xbfdcff:0x232a34); hood.material.metalness=xray?.05:.82; cabin.material.opacity=xray?.58:.78; });

function animateExplode(){ baseTransforms.forEach((b,o)=>{ const target=b.pos.clone().add(exploded?b.explode:new THREE.Vector3()); o.position.lerp(target,.08); }); }
function updateHotspots(){ hotspotNodes.forEach(h=>{ const p=h.pos.clone(); car.localToWorld(p); p.project(camera); const x=(p.x*.5+.5)*viewer.clientWidth, y=(-p.y*.5+.5)*viewer.clientHeight; h.el.style.left=x+'px'; h.el.style.top=y+'px'; h.el.style.display=p.z>1?'none':'block'; }); }
function resize(){ const w=viewer.clientWidth,h=viewer.clientHeight; camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h,false); }
addEventListener('resize',resize); resize();

const clock=new THREE.Clock();
function loop(){ requestAnimationFrame(loop); const t=clock.getElapsedTime(); controls.update(); animateExplode(); ring.material.opacity=.42+Math.sin(t*1.2)*.08; updateHotspots(); renderer.render(scene,camera); }
loop();

setTimeout(()=>loading.classList.add('done'),650);
selectPart('engine');
