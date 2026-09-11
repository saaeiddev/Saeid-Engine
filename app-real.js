import * as THREE from 'https://unpkg.com/three@0.180.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
const canvas=$('#scene'), viewer=$('#viewer'), loading=$('#loading'), progress=$('#progress');
const title=$('#partTitle'), kicker=$('#partKicker'), desc=$('#partDesc'), specs=$('#specs');

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x04080f);
scene.fog=new THREE.FogExp2(0x050a12,.038);
const camera=new THREE.PerspectiveCamera(38,1,.01,100);
camera.position.set(7.8,4.1,8.4);
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.25;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.055;controls.autoRotate=true;controls.autoRotateSpeed=.55;controls.minDistance=3.5;controls.maxDistance=18;controls.maxPolarAngle=Math.PI*.62;

scene.add(new THREE.HemisphereLight(0xccecff,0x0b0d12,3.7));
const key=new THREE.DirectionalLight(0xffffff,6.2);key.position.set(5,8,6);key.castShadow=true;scene.add(key);
const blue=new THREE.DirectionalLight(0x36b9ff,5.0);blue.position.set(-6,3,-4);scene.add(blue);
const red=new THREE.DirectionalLight(0xff6840,3.0);red.position.set(5,2,-5);scene.add(red);
const top=new THREE.PointLight(0xe8f6ff,14,20,1.7);top.position.set(0,6,0);scene.add(top);

const floor=new THREE.Mesh(new THREE.CircleGeometry(8,96),new THREE.MeshStandardMaterial({color:0x0b121a,metalness:.28,roughness:.7}));
floor.rotation.x=-Math.PI/2;floor.position.y=-1.45;floor.receiveShadow=true;scene.add(floor);
const ring=new THREE.Mesh(new THREE.RingGeometry(3.3,3.38,128),new THREE.MeshBasicMaterial({color:0x168fd0,transparent:true,opacity:.85,side:THREE.DoubleSide}));
ring.rotation.x=-Math.PI/2;ring.position.y=-1.438;scene.add(ring);

let model=null,modelBox=null,selected='engine',xray=false,exploded=false;
const originalTransforms=new Map(), bodyMaterials=[], pickMeshes=[], hotspots=[];
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();

const info={
 engine:['POWERTRAIN / 01','Engine','The engine creates the torque that moves the vehicle. This uploaded model is an exterior/interior vehicle model, so this hotspot marks the real engine-bay location.',['SYSTEM','Powertrain','LOCATION','Front bay']],
 transmission:['DRIVETRAIN / 02','Transmission','The transmission changes gear ratios and sends engine torque through the drivetrain.',['SYSTEM','Drivetrain','LOCATION','Center tunnel']],
 suspension:['CHASSIS / 03','Suspension','Springs, dampers and links control wheel movement and vehicle stability.',['SYSTEM','Chassis','FUNCTION','Wheel control']],
 brakes:['CHASSIS / 04','Braking System','Brake discs and calipers convert kinetic energy into heat to slow the vehicle.',['SYSTEM','Chassis','FUNCTION','Deceleration']],
 steering:['CHASSIS / 05','Steering','The steering system converts driver input into front-wheel direction.',['SYSTEM','Control','FUNCTION','Direction']],
 cooling:['THERMAL / 06','Cooling System','The cooling system removes heat from the powertrain and keeps temperatures stable.',['SYSTEM','Thermal','LOCATION','Front bay']],
 exhaust:['POWERTRAIN / 07','Exhaust System','The exhaust system routes combustion gases from the engine toward the rear of the car.',['SYSTEM','Powertrain','LOCATION','Underbody']],
 body:['STRUCTURE / 08','Body Structure','The real uploaded mesh forms the vehicle shell, aerodynamic surfaces and structural exterior.',['SYSTEM','Structure','MODEL','Uploaded OBJ']],
 interior:['CABIN / 09','Interior','The uploaded model includes cabin geometry that becomes easier to see in X-Ray mode.',['SYSTEM','Cabin','FUNCTION','Driver interface']]
};
function setPanel(id){selected=info[id]?id:'body';const d=info[selected];kicker.textContent=d[0];title.textContent=d[1];desc.textContent=d[2];specs.innerHTML=`<div><span>${d[3][0]}</span><strong>${d[3][1]}</strong></div><div><span>${d[3][2]}</span><strong>${d[3][3]}</strong></div>`;document.querySelectorAll('.system').forEach(b=>b.classList.toggle('active',b.dataset.part===selected));}
function fromB64(str){const bin=atob(str),out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;}
async function gunzip(bytes){const ds=new DecompressionStream('gzip');const stream=new Blob([bytes]).stream().pipeThrough(ds);return await new Response(stream).arrayBuffer();}

function makeMaterial(name){const n=name.toLowerCase();
 if(n.includes('tyre'))return new THREE.MeshStandardMaterial({name,color:0x111317,roughness:.86,metalness:.03});
 if(n.includes('glass'))return new THREE.MeshPhysicalMaterial({name,color:0xbfd9e8,roughness:.08,metalness:0,transparent:true,opacity:.22,transmission:.65,ior:1.25,depthWrite:false,side:THREE.DoubleSide});
 if(n.includes('tail light'))return new THREE.MeshStandardMaterial({name,color:0xc91f24,roughness:.3,metalness:.1,emissive:0x7a090c,emissiveIntensity:1.5});
 if(n.includes('light'))return new THREE.MeshStandardMaterial({name,color:0xf4fbff,roughness:.18,emissive:0xb8e7ff,emissiveIntensity:2.3});
 if(n.includes('logo'))return new THREE.MeshStandardMaterial({name,color:0xd52228,metalness:.65,roughness:.2});
 if(n.includes('black'))return new THREE.MeshStandardMaterial({name,color:0x0e1115,metalness:.22,roughness:.5});
 return new THREE.MeshPhysicalMaterial({name,color:0x9b1017,metalness:.72,roughness:.2,clearcoat:1,clearcoatRoughness:.08});
}

function parseCAR1(buffer){
 const dv=new DataView(buffer);let p=0;
 const magic=String.fromCharCode(...new Uint8Array(buffer,0,4));p=4;
 if(magic!=='CAR1')throw new Error('Invalid uploaded-model package');
 const groupCount=dv.getUint16(p,true);p+=2;
 const root=new THREE.Group();root.name='Uploaded R8';
 const td=new TextDecoder();
 for(let g=0;g<groupCount;g++){
  const len=dv.getUint8(p++);const name=td.decode(new Uint8Array(buffer,p,len));p+=len;
  const vc=dv.getUint32(p,true);p+=4;const tc=dv.getUint32(p,true);p+=4;
  const minX=dv.getFloat32(p,true),minY=dv.getFloat32(p+4,true),minZ=dv.getFloat32(p+8,true),maxX=dv.getFloat32(p+12,true),maxY=dv.getFloat32(p+16,true),maxZ=dv.getFloat32(p+20,true);p+=24;
  const pos=new Float32Array(vc*3);
  for(let i=0;i<vc;i++){
   const qx=dv.getUint16(p,true),qy=dv.getUint16(p+2,true),qz=dv.getUint16(p+4,true);p+=6;
   pos[i*3]=minX+(maxX-minX)*(qx/65535);pos[i*3+1]=minY+(maxY-minY)*(qy/65535);pos[i*3+2]=minZ+(maxZ-minZ)*(qz/65535);
  }
  const idx=new Uint32Array(tc*3);
  for(let i=0;i<tc*3;i++){idx[i]=dv.getUint16(p,true);p+=2;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeVertexNormals();geo.computeBoundingSphere();
  const mat=makeMaterial(name);const mesh=new THREE.Mesh(geo,mat);mesh.name=name;mesh.userData.sourceGroup=name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);pickMeshes.push(mesh);originalTransforms.set(mesh,{p:mesh.position.clone(),q:mesh.quaternion.clone()});
  if(!/glass|tyre|light|logo|black/.test(name.toLowerCase()))bodyMaterials.push(mat);
 }
 return root;
}

function fitModel(root){root.updateMatrixWorld(true);let b=new THREE.Box3().setFromObject(root);const size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());const scale=6.5/Math.max(size.x,size.y,size.z);root.scale.setScalar(scale);root.position.set(-center.x*scale,-center.y*scale,-center.z*scale);root.rotation.y=-.42;root.updateMatrixWorld(true);b=new THREE.Box3().setFromObject(root);root.position.y+=-1.15-b.min.y;root.updateMatrixWorld(true);modelBox=new THREE.Box3().setFromObject(root);const s=modelBox.getSize(new THREE.Vector3());controls.target.set(0,-.1,0);camera.position.set(Math.max(6.2,s.x*1.25),Math.max(2.8,s.y*.9),Math.max(7,s.z*1.22));controls.update();}
function addHotspot(id,rel,color=0x22b7ff){const s=modelBox.getSize(new THREE.Vector3()),min=modelBox.min,p=new THREE.Vector3(min.x+s.x*rel[0],min.y+s.y*rel[1],min.z+s.z*rel[2]);const g=new THREE.Group();g.position.copy(p);g.userData.part=id;const core=new THREE.Mesh(new THREE.SphereGeometry(.055,18,12),new THREE.MeshBasicMaterial({color}));core.userData.part=id;const halo=new THREE.Mesh(new THREE.SphereGeometry(.11,18,12),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.2,depthWrite:false}));halo.userData.part=id;g.add(core,halo);scene.add(g);hotspots.push(g,core,halo);}
function buildHotspots(){addHotspot('engine',[.77,.48,.5]);addHotspot('transmission',[.52,.3,.5]);addHotspot('suspension',[.22,.28,.18]);addHotspot('brakes',[.16,.24,.16]);addHotspot('steering',[.54,.58,.5]);addHotspot('cooling',[.84,.42,.5]);addHotspot('exhaust',[.26,.2,.72],0xff7046);addHotspot('interior',[.52,.65,.5]);addHotspot('body',[.68,.66,.5]);}
function focusPart(id){if(!modelBox)return;const map={engine:[.77,.48,.5],transmission:[.52,.3,.5],suspension:[.22,.28,.18],brakes:[.16,.24,.16],steering:[.54,.58,.5],cooling:[.84,.42,.5],exhaust:[.26,.2,.72],interior:[.52,.65,.5],body:[.68,.66,.5]};const rel=map[id]||[.5,.5,.5],s=modelBox.getSize(new THREE.Vector3()),t=new THREE.Vector3(modelBox.min.x+s.x*rel[0],modelBox.min.y+s.y*rel[1],modelBox.min.z+s.z*rel[2]);controls.target.copy(t);const dir=camera.position.clone().sub(t).normalize();camera.position.copy(t.clone().add(dir.multiplyScalar(4.5)));controls.autoRotate=false;$('#autoBtn').classList.remove('active');}
function toggleXray(){xray=!xray;bodyMaterials.forEach(m=>{m.transparent=xray;m.opacity=xray?.18:1;m.depthWrite=!xray;m.needsUpdate=true});$('#xrayBtn').classList.toggle('active',xray);}
function toggleExplode(){exploded=!exploded;if(!model||!modelBox)return;const c=modelBox.getCenter(new THREE.Vector3());model.children.forEach(o=>{const orig=originalTransforms.get(o);if(!orig)return;if(!exploded){o.position.copy(orig.p);return;}const w=new THREE.Vector3();o.getWorldPosition(w);const d=w.sub(c).normalize();o.position.copy(orig.p).add(d.multiplyScalar(.18/model.scale.x));});$('#explodeBtn').classList.toggle('active',exploded);}
function resize(){const r=viewer.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();}new ResizeObserver(resize).observe(viewer);
canvas.addEventListener('pointerdown',()=>controls.autoRotate=false);
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);canvas.style.cursor=raycaster.intersectObjects(hotspots,true).length?'pointer':'grab';});
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(hotspots,true)[0];if(hit){let o=hit.object;while(o&&!o.userData.part)o=o.parent;if(o?.userData.part){setPanel(o.userData.part);focusPart(o.userData.part);}}});
document.querySelectorAll('.system').forEach(b=>b.addEventListener('click',()=>{setPanel(b.dataset.part);focusPart(b.dataset.part)}));
$('#xrayBtn').addEventListener('click',toggleXray);$('#explodeBtn').addEventListener('click',toggleExplode);$('#resetBtn').addEventListener('click',()=>{if(modelBox){controls.target.set(0,-.1,0);camera.position.set(7.8,4.1,8.4);}controls.autoRotate=false;$('#autoBtn').classList.remove('active');});$('#autoBtn').addEventListener('click',e=>{controls.autoRotate=!controls.autoRotate;e.currentTarget.classList.toggle('active',controls.autoRotate)});
async function loadCar(){try{progress.textContent='Assembling uploaded R8 geometry…';if(!window.__CARMINI||window.__CARMINI.length<1000)throw new Error('Model data incomplete');const zipped=fromB64(window.__CARMINI);progress.textContent='Decompressing real 3D geometry…';const buffer=await gunzip(zipped);progress.textContent='Building materials and lighting…';model=parseCAR1(buffer);scene.add(model);fitModel(model);buildHotspots();loading.classList.add('done');setTimeout(()=>loading.remove(),650);setPanel('engine');}catch(err){console.error(err);progress.textContent='Could not load the uploaded 3D car: '+err.message;loading.classList.add('error');}}
function animate(){requestAnimationFrame(animate);const t=performance.now()*.003;hotspots.forEach((o,i)=>{if(o.isMesh&&o.geometry?.type==='SphereGeometry')o.scale.setScalar(1+Math.sin(t+i)*.07)});controls.update();renderer.render(scene,camera);}resize();loadCar();animate();