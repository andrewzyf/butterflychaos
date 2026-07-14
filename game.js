// BUTTERFLY CHAOS — 3D physics chain-reaction roguelike
// STYLE FORMULA v1: vibrant stylized realism with crisp clean surfaces and softly rounded
// bevels, chunky simplified silhouettes with subtle darkened edge lines, environments in warm
// cream, wood-tan and teal appliance tones with soft grey shadows, player trigger items in
// saturated signal red and chrome that pop against the room, hazards and explosives marked
// with hot orange-yellow glow, bright cheerful daylight with a mischievous toybox mood, high
// contrast between interactive elements and backgrounds, clean readable silhouettes,
// consistent three-quarter isometric presentation across all assets
import * as THREE from "./three.module.js";
import * as CANNON from "./cannon-es.js";
import { STR } from "./strings.js";

// ---------- seeded RNG ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let runSeed = (Date.now() & 0xffffff) ^ 0x9e3779b9;
let rng = mulberry32(runSeed);
const rr = (a,b)=>a+rng()*(b-a);

// ---------- palette (derived from STYLE FORMULA blocks 3-4) ----------
const PAL = {
  cream:0xf5ecdd, creamDim:0xe8dcc4, tan:0xc9a978, tanDark:0x9a7c50, teal:0x3aa6a0,
  tealDark:0x2b7d78, red:0xe2432f, redDark:0xa32d1f, chrome:0xcfd6dd, ink:0x2b2723,
  glow:0xffab2e, fire:0xff7a1e, spark:0x53d5ff, water:0x6fc3e8, white:0xffffff,
  plate:0xfdf8ee, cereal:0xe8a13c, paper:0xf2eee2, monitor:0x39424d, floorK:0xd8b98a,
  floorO:0x9aa7ad, wallK:0xefe3cc, wallO:0xdfe6e2
};

// ---------- config: numbers fixed before build ----------
const CFG = {
  room:{ w:16, h:7, d:12 },
  dprCap:1.5, step:1000/60,
  maxShards:160, shardLife:7,
  calmSpeed:0.05, calmHold:2, roundTime:30,
  explosion:{ radius:3.4, impulse:42, damage:12 },
  bayExplosion:{ radius:2.0, impulse:10, damage:2.5 },
  fire:{ spreadRadius:2.1, spreadEvery:0.5, spreadChance:0.55, burnTime:3.2 },
  magnet:{ radius:6, pull:30 },
  car:{ force:26, armTime:0.35 },
  keg:{ jetTime:3, jetForce:46, switchEvery:0.3, hurtAt:1.4 },
  ballSpeed:8,
  maxFloors:6
};

// ---------- DOM ----------
const $ = id=>document.getElementById(id);
const canvas=$("c"), devEl=$("dev");
const DEV = new URLSearchParams(location.search).has("dev");
if(DEV) devEl.style.display="block";
$("tagH").textContent=STR.tagline; $("navPlayT").textContent=STR.menuPlay;
$("navHowT").textContent=STR.menuHow; $("navSettingsT").textContent=STR.menuSettings;
$("bestLbl").textContent=STR.bestScore; $("custTitle").textContent=STR.customize;
$("startBtn").textContent=STR.menuPlay+" ▶"; $("draftH").textContent=STR.draftTitle;
$("resetBtn").textContent=STR.mainMenu;
$("setShakeL").textContent=STR.setShake; $("setPartL").textContent=STR.setParticles;
$("setResL").childNodes[0]?0:0; $("setResL").insertBefore(document.createTextNode(STR.setRes),$("setResL").firstChild);
$("setResSub").textContent=STR.setResSub;
$("shakeOn").textContent=STR.on; $("shakeOff").textContent=STR.off;
$("partHi").textContent=STR.hi; $("partLo").textContent=STR.lo;
$("resHi").textContent=STR.hi; $("resLo").textContent=STR.lo;

// ---------- persisted settings + avatar ----------
function loadJSON(k,d){ try{ return {...d, ...(JSON.parse(localStorage.getItem(k))||{})}; }catch(e){ return {...d}; } }
function saveJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
const SETTINGS = loadJSON("bc-settings", { shake:true, particles:"hi", res:"hi" });
const AVATAR = loadJSON("bc-avatar", { color:0, hat:0 });
let BEST = loadJSON("bc-best", { score:0 }).score;
const PF = ()=> SETTINGS.particles==="hi" ? 1 : 0.5;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
function gradTex(top,bottom){
  const c=document.createElement("canvas"); c.width=8; c.height=256;
  const g=c.getContext("2d"), gr=g.createLinearGradient(0,0,0,256);
  gr.addColorStop(0,top); gr.addColorStop(1,bottom);
  g.fillStyle=gr; g.fillRect(0,0,8,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const bgMenu=gradTex("#ff9a4d","#7e2a1a");   // bright toybox backdrop for the menu (FORMULA block 4)
const bgGame=gradTex("#c96f36","#3a2013");   // warm dusk behind the dollhouse rooms
scene.background = bgGame;
scene.fog = new THREE.Fog(0x63381f, 34, 70);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);

// lighting derived from FORMULA blocks 3-4: bright cheerful daylight, warm cream ambient, teal fill
const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6e7d7a, 0.85); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
sun.position.set(10,14,6); sun.castShadow=true;
sun.shadow.mapSize.set(1024,1024);
sun.shadow.camera.left=-12; sun.shadow.camera.right=12; sun.shadow.camera.top=12; sun.shadow.camera.bottom=-12;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x9fe0dc, 0.35); fill.position.set(-8,6,-8); scene.add(fill);

function resize(){
  const dpr=Math.min(devicePixelRatio||1, SETTINGS.res==="hi"?CFG.dprCap:1.0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
}
addEventListener("resize",resize); addEventListener("orientationchange",resize); resize();

// ---------- orbit camera ----------
const orbit={ yaw:0.8, pitch:0.55, dist:19, target:new THREE.Vector3(0,2.2,0) };
function clampOrbit(){ orbit.pitch=Math.max(0.12,Math.min(1.35,orbit.pitch)); orbit.dist=Math.max(8,Math.min(30,orbit.dist)); }
function applyCamera(){
  clampOrbit();
  const cp=Math.cos(orbit.pitch), sp=Math.sin(orbit.pitch);
  camera.position.set(
    orbit.target.x + orbit.dist*cp*Math.sin(orbit.yaw),
    orbit.target.y + orbit.dist*sp,
    orbit.target.z + orbit.dist*cp*Math.cos(orbit.yaw));
  camera.lookAt(orbit.target);
}

// ---------- physics ----------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0,-9.82,0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.35;
world.defaultContactMaterial.restitution = 0.15;
const slickMat = new CANNON.Material("slick");
world.addContactMaterial(new CANNON.ContactMaterial(slickMat, world.defaultMaterial, {friction:0.0, restitution:0.25}));

// deferred removal — never yank bodies out of the world mid-step
let inStep=false; const removeQ=[];
function safeRemove(body){ if(inStep) removeQ.push(body); else world.removeBody(body); }
function flushRemovals(){ while(removeQ.length) world.removeBody(removeQ.pop()); }

// ---------- entity registry ----------
let entities=[];      // destructible/dynamic props {mesh,body,def,alive,integrity,burning,...}
let structures=[];    // static meshes (raycast surfaces)
let placedItems=[];   // player items in the scene {type,mesh,body,yaw,...}
let magnets=[];
const raycastTargets=()=>[...structures, ...entities.filter(e=>e.alive).map(e=>e.mesh), ...placedItems.map(p=>p.mesh)];

const edgeMat=new THREE.LineBasicMaterial({color:0x2b2118, transparent:true, opacity:0.35});
function addEdges(m,geom){ m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), edgeMat)); }
function box(w,h,d,color,opts={}){
  const geom=new THREE.BoxGeometry(w,h,d);
  const m=new THREE.Mesh(geom, new THREE.MeshStandardMaterial({color, roughness:opts.rough??0.75, metalness:opts.metal??0.05}));
  m.castShadow=true; m.receiveShadow=true; if(opts.edges!==false) addEdges(m,geom); return m;
}
function cyl(rt,rb,h,color,opts={}){
  const geom=new THREE.CylinderGeometry(rt,rb,h,opts.seg??14);
  const m=new THREE.Mesh(geom, new THREE.MeshStandardMaterial({color, roughness:opts.rough??0.7, metalness:opts.metal??0.05}));
  m.castShadow=true; m.receiveShadow=true; if(opts.edges!==false) addEdges(m,geom); return m;
}

// props: def = {points, fragility, mass, flags}
function addProp(mesh, shape, pos, def, quatY=0){
  const body=new CANNON.Body({ mass:def.mass, shape, position:new CANNON.Vec3(pos.x,pos.y,pos.z) });
  if(quatY) body.quaternion.setFromEuler(0,quatY,0);
  body.allowSleep=true; body.sleepSpeedLimit=0.12; body.sleepTimeLimit=0.6;
  mesh.position.copy(pos); mesh.quaternion.copy(body.quaternion);
  scene.add(mesh); world.addBody(body);
  const e={mesh,body,def,alive:true,burning:false,burnLeft:CFG.fire.burnTime,spreadT:0,dmg:0};
  body._ent=e;
  body.addEventListener("collide", onPropCollide);
  entities.push(e);
  return e;
}
function onPropCollide(ev){
  if(state!==S.REACTION) return;
  const e=ev.target._ent; if(!e||!e.alive) return;
  const iv=Math.abs(ev.contact.getImpactVelocityAlongNormal());
  const om=ev.body.mass>0?ev.body.mass:ev.target.mass;
  const dmg=iv*om;
  if(dmg<0.4) return;
  if(e.def.explosive && dmg>e.def.fragility){ explode(e.body.position, CFG.explosion, e); return; }
  if(e.def.kegLike){ e.dmg+=dmg; if(e.dmg>CFG.keg.hurtAt && !e.jetting) startJet(e); return; }
  if(dmg>e.def.fragility) fracture(e, iv);
  else if(dmg>e.def.fragility*0.5 && e.def.sparks) sparks(e.body.position, 4);
}

// ---------- shards (instanced, one draw call) ----------
const shardGeo=new THREE.BoxGeometry(1,1,1);
const shardMat=new THREE.MeshStandardMaterial({roughness:0.8});
const shardMesh=new THREE.InstancedMesh(shardGeo,shardMat,CFG.maxShards);
shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
shardMesh.castShadow=true;
shardMesh.count=CFG.maxShards;
scene.add(shardMesh);
const shardCol=new THREE.Color();
for(let i=0;i<CFG.maxShards;i++) shardMesh.setColorAt(i, shardCol.setHex(0x000000));
const shards=new Array(CFG.maxShards).fill(null); // {body,size,life}
let shardPtr=0;
const _m4=new THREE.Matrix4(), _v3=new THREE.Vector3(), _q=new THREE.Quaternion(), _zero=new THREE.Vector3(0,0,0);
function spawnShard(pos, vel, size, colorHex){
  const i=shardPtr; shardPtr=(shardPtr+1)%CFG.maxShards;
  if(shards[i]) safeRemove(shards[i].body);
  const body=new CANNON.Body({mass:0.12, shape:new CANNON.Box(new CANNON.Vec3(size/2,size/2,size/2)),
    position:new CANNON.Vec3(pos.x+rr(-.1,.1),pos.y+rr(-.1,.1),pos.z+rr(-.1,.1))});
  body.velocity.set(vel.x+rr(-2.5,2.5), vel.y+rr(0,3.5), vel.z+rr(-2.5,2.5));
  body.angularVelocity.set(rr(-6,6),rr(-6,6),rr(-6,6));
  body.allowSleep=true; body.sleepSpeedLimit=0.15; body.sleepTimeLimit=0.5;
  world.addBody(body);
  shards[i]={body,size,life:CFG.shardLife};
  shardMesh.setColorAt(i, shardCol.setHex(colorHex));
  shardMesh.instanceColor.needsUpdate=true;
}
function updateShards(dt){
  for(let i=0;i<CFG.maxShards;i++){
    const s=shards[i];
    if(!s){ _m4.compose(_zero,_q.identity(),_v3.set(0,0,0)); shardMesh.setMatrixAt(i,_m4); continue; }
    s.life-=dt;
    if(s.life<=0){ world.removeBody(s.body); shards[i]=null; _m4.compose(_zero,_q.identity(),_v3.set(0,0,0)); shardMesh.setMatrixAt(i,_m4); continue; }
    const k=Math.min(1,s.life/1.2)*s.size;
    _m4.compose(_v3.set(s.body.position.x,s.body.position.y,s.body.position.z),
      _q.set(s.body.quaternion.x,s.body.quaternion.y,s.body.quaternion.z,s.body.quaternion.w),
      new THREE.Vector3(k,k,k));
    shardMesh.setMatrixAt(i,_m4);
  }
  shardMesh.instanceMatrix.needsUpdate=true;
}
function clearShards(){ for(let i=0;i<CFG.maxShards;i++){ if(shards[i]){world.removeBody(shards[i].body); shards[i]=null;} } updateShards(0); }

// ---------- particles ----------
function softDot(){
  const c=document.createElement("canvas"); c.width=c.height=64;
  const g=c.getContext("2d"), gr=g.createRadialGradient(32,32,2,32,32,30);
  gr.addColorStop(0,"rgba(255,255,255,1)"); gr.addColorStop(0.5,"rgba(255,255,255,.55)"); gr.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c); return t;
}
const dotTex=softDot();
class PSys{
  constructor(cap,color,size,grav,drag,addBlend){
    this.cap=cap; this.grav=grav; this.drag=drag;
    this.pos=new Float32Array(cap*3); this.vel=new Float32Array(cap*3); this.life=new Float32Array(cap);
    this.maxLife=new Float32Array(cap); this.ptr=0;
    const g=new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos,3));
    this.points=new THREE.Points(g, new THREE.PointsMaterial({color,size,map:dotTex,transparent:true,opacity:0.85,depthWrite:false,blending:addBlend?THREE.AdditiveBlending:THREE.NormalBlending,sizeAttenuation:true}));
    this.points.frustumCulled=false;
    scene.add(this.points);
    for(let i=0;i<cap;i++){ this.pos[i*3+1]=-999; }
  }
  emit(p,v,life){
    const i=this.ptr; this.ptr=(this.ptr+1)%this.cap;
    this.pos[i*3]=p.x; this.pos[i*3+1]=p.y; this.pos[i*3+2]=p.z;
    this.vel[i*3]=v.x; this.vel[i*3+1]=v.y; this.vel[i*3+2]=v.z;
    this.life[i]=life; this.maxLife[i]=life;
  }
  update(dt){
    for(let i=0;i<this.cap;i++){
      if(this.life[i]<=0) continue;
      this.life[i]-=dt;
      if(this.life[i]<=0){ this.pos[i*3+1]=-999; continue; }
      this.vel[i*3+1]+=this.grav*dt;
      const dr=Math.max(0,1-this.drag*dt);
      this.vel[i*3]*=dr; this.vel[i*3+1]*=dr; this.vel[i*3+2]*=dr;
      this.pos[i*3]+=this.vel[i*3]*dt; this.pos[i*3+1]+=this.vel[i*3+1]*dt; this.pos[i*3+2]+=this.vel[i*3+2]*dt;
    }
    this.points.geometry.attributes.position.needsUpdate=true;
  }
  clear(){ for(let i=0;i<this.cap;i++){this.life[i]=0;this.pos[i*3+1]=-999;} this.points.geometry.attributes.position.needsUpdate=true; }
}
const dustP=new PSys(500,0xcfc4ad,0.5,-0.6,0.9,false);
const sparkP=new PSys(240,PAL.spark,0.28,-4,0.4,true);
const fireP=new PSys(400,PAL.fire,0.55,2.4,1.2,true);
const boomP=new PSys(200,PAL.glow,0.9,0.6,1.6,true);
const allP=[dustP,sparkP,fireP,boomP];
function dust(p,n){ n=Math.ceil(n*PF()); for(let i=0;i<n;i++) dustP.emit(p,{x:rr(-1.6,1.6),y:rr(.3,2.2),z:rr(-1.6,1.6)},rr(.7,1.6)); }
function sparks(p,n){ n=Math.ceil(n*PF()); for(let i=0;i<n;i++) sparkP.emit(p,{x:rr(-4,4),y:rr(1,5),z:rr(-4,4)},rr(.25,.6)); }
function fireBloom(p,n){ n=Math.ceil(n*PF()); for(let i=0;i<n;i++) boomP.emit(p,{x:rr(-3.5,3.5),y:rr(0,4),z:rr(-3.5,3.5)},rr(.3,.7)); }

// ---------- score ----------
let score=0, target=0, floor=1, roomTotal=0;
function addScore(n){ score+=n; $("scorebox").innerHTML=`${STR.score} <b>${score}</b> / ${target}`; }
function refreshHud(){
  $("floorbox").innerHTML=`${STR.floor} <b>${floor}</b>`;
  $("scorebox").innerHTML=`${STR.score} <b>${score}</b> / ${target}`;
  const mb=$("modbar"); mb.innerHTML="";
  for(const m of runMods){ const c=document.createElement("div"); c.className="modchip"; c.textContent=STR.modNames[m]; mb.appendChild(c); }
}

// ---------- destruction ----------
function fracture(e, energy){
  if(!e.alive) return;
  e.alive=false;
  scene.remove(e.mesh);
  safeRemove(e.body);
  addScore(e.def.points);
  const p=e.body.position, v=e.body.velocity;
  const n=Math.min(9, 4+Math.floor((e.def.mass||1)*1.5));
  const col=e.def.shardColor ?? 0xd8cfc0;
  for(let i=0;i<n;i++) spawnShard(p,{x:v.x*0.7,y:v.y*0.5,z:v.z*0.7}, rr(0.12,0.32)*(1+(e.def.mass>3?0.5:0)), col);
  dust(p, 10);
  if(e.def.sparks){
    sparks(p, 10);
    for(const o of entities){
      if(!o.alive||o.burning||!(o.def.combustible||o.def.explosive)) continue;
      p.vsub(o.body.position,_cv);
      if(_cv.length()<1.6&&rng()<0.7) ignite(o);
    }
  }
  if(runMods.includes("michaelbay")) explode(p, CFG.bayExplosion, null, true);
}
const _cv=new CANNON.Vec3();
function explode(pos, cfg, srcEnt, quiet){
  if(srcEnt){ if(!srcEnt.alive) return; srcEnt.alive=false; scene.remove(srcEnt.mesh); safeRemove(srcEnt.body); addScore(srcEnt.def.points); }
  fireBloom(pos, quiet?8:24); dust(pos, quiet?4:14);
  shake=Math.max(shake, quiet?0.12:0.4);
  const all=[...entities.filter(e=>e.alive).map(e=>e.body), ...placedItems.map(i=>i.body), ...shards.filter(Boolean).map(s=>s.body)];
  for(const b of all){
    if(b.mass<=0) continue;
    pos.vsub(b.position,_cv); const d=_cv.length();
    if(d>cfg.radius||d<1e-4) continue;
    const k=1-d/cfg.radius;
    const imp=cfg.impulse*k;
    _cv.scale(-imp/d, _cv);
    b.applyImpulse(_cv, b.position);
    b.wakeUp();
    const e=b._ent;
    if(e&&e.alive){
      if(e.def.explosive&&!quiet&&cfg.damage*k>e.def.fragility){ setTimeout(()=>{ if(e.alive) explode(e.body.position, CFG.explosion, e); },90); }
      else if(cfg.damage*k>e.def.fragility) fracture(e, imp);
      else if((e.def.combustible||e.def.explosive)&&!quiet&&k>0.25) ignite(e);
    }
  }
}
function ignite(e){ if(!e.alive||e.burning||!(e.def.combustible||e.def.explosive)) return; e.burning=true; e.burnLeft=e.def.explosive?0.7:CFG.fire.burnTime; }
function updateFire(dt){
  for(const e of entities){
    if(!e.alive||!e.burning) continue;
    e.burnLeft-=dt;
    if(rng()<0.5) fireP.emit(e.body.position,{x:rr(-.4,.4),y:rr(1,2.4),z:rr(-.4,.4)},rr(.4,.9));
    e.spreadT+=dt;
    if(e.spreadT>=CFG.fire.spreadEvery){
      e.spreadT=0;
      for(const o of entities){
        if(!o.alive||o.burning||!(o.def.combustible||o.def.explosive)) continue;
        e.body.position.vsub(o.body.position,_cv);
        if(_cv.length()<CFG.fire.spreadRadius && rng()<CFG.fire.spreadChance) ignite(o);
      }
    }
    if(e.burnLeft<=0){
      if(e.def.explosive) explode(e.body.position, CFG.explosion, e);
      else { e.def={...e.def, shardColor:0x4a3527}; fracture(e, 2); fireBloom(e.body.position,6); }
    }
  }
}

// ---------- rooms ----------
function clearRoom(){
  for(const e of entities){ scene.remove(e.mesh); world.removeBody(e.body); }
  entities=[];
  for(const s of structures){ scene.remove(s); if(s._body) world.removeBody(s._body); }
  structures=[];
  clearShards(); for(const p of allP) p.clear();
}
function addStructure(mesh, shape, pos, quatY=0){
  const body=new CANNON.Body({mass:0, shape, position:new CANNON.Vec3(pos.x,pos.y,pos.z)});
  if(quatY) body.quaternion.setFromEuler(0,quatY,0);
  mesh.position.copy(pos); mesh.quaternion.copy(body.quaternion);
  mesh._body=body;
  scene.add(mesh); world.addBody(body); structures.push(mesh);
  return mesh;
}
function buildShell(floorColor, wallColor){
  const {w,h,d}=CFG.room;
  // floor
  const fl=box(w,0.4,d,floorColor,{rough:0.9});
  addStructure(fl, new CANNON.Box(new CANNON.Vec3(w/2,0.2,d/2)), new THREE.Vector3(0,-0.2,0));
  fl.receiveShadow=true;
  // walls: visual planes face INWARD (invisible from outside — dollhouse view); physics boxes solid
  const wallDefs=[
    {p:[0,h/2,-d/2], r:[0,0,0], sw:w},
    {p:[0,h/2, d/2], r:[0,Math.PI,0], sw:w},
    {p:[-w/2,h/2,0], r:[0,Math.PI/2,0], sw:d},
    {p:[ w/2,h/2,0], r:[0,-Math.PI/2,0], sw:d},
  ];
  for(const wd of wallDefs){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(wd.sw,h), new THREE.MeshStandardMaterial({color:wallColor,roughness:0.95,side:THREE.FrontSide}));
    m.position.set(...wd.p); m.rotation.set(...wd.r); m.receiveShadow=true;
    const body=new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(wd.sw/2,h/2,0.1)), position:new CANNON.Vec3(...wd.p)});
    body.quaternion.setFromEuler(...wd.r);
    m._body=body; scene.add(m); world.addBody(body); structures.push(m);
  }
  // ceiling: physics only + inward-facing visual
  const ce=new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshStandardMaterial({color:wallColor,roughness:0.95}));
  ce.rotation.x=Math.PI/2; ce.position.y=h;
  const cb=new CANNON.Body({mass:0, shape:new CANNON.Box(new CANNON.Vec3(w/2,0.1,d/2)), position:new CANNON.Vec3(0,h+0.1,0)});
  ce._body=cb; scene.add(ce); world.addBody(cb); structures.push(ce);
}
// prop defs
const DEFS={
  plate:{points:40, fragility:2, mass:0.5, shardColor:PAL.plate},
  cereal:{points:25, fragility:1.6, mass:0.35, combustible:true, shardColor:PAL.cereal},
  blender:{points:120, fragility:6, mass:2.5, sparks:true, metallic:true, shardColor:PAL.chrome},
  pot:{points:60, fragility:11, mass:2.2, metallic:true, shardColor:PAL.chrome},
  canister:{points:150, fragility:4, mass:1.6, explosive:true, metallic:true, shardColor:PAL.red},
  monitor:{points:110, fragility:5, mass:2.0, sparks:true, metallic:true, shardColor:PAL.monitor},
  divider:{points:70, fragility:4, mass:1.8, combustible:true, shardColor:PAL.creamDim},
  chair:{points:80, fragility:8, mass:2.4, metallic:true, shardColor:PAL.ink},
  cooler:{points:130, fragility:5, mass:3.0, explosive:true, shardColor:PAL.water},
  cabinet:{points:90, fragility:14, mass:6, metallic:true, shardColor:PAL.chrome},
  paper:{points:15, fragility:1, mass:0.25, combustible:true, shardColor:PAL.paper},
};
function plateStack(x,z,n,y0){
  for(let i=0;i<n;i++){
    const m=cyl(0.34,0.4,0.09,PAL.plate,{rough:0.35});
    addProp(m,new CANNON.Cylinder(0.34,0.4,0.09,10),new THREE.Vector3(x,y0+0.06+i*0.1,z),DEFS.plate);
  }
}
function cerealRow(x,z,n,y0,dir){
  for(let i=0;i<n;i++){
    const m=box(0.5,0.78,0.24,[PAL.cereal,PAL.red,PAL.teal][i%3]);
    addProp(m,new CANNON.Box(new CANNON.Vec3(0.25,0.39,0.12)),new THREE.Vector3(x+(dir?i*0.58:0),y0+0.4,z+(dir?0:i*0.58)),DEFS.cereal, rr(-.1,.1));
  }
}
function buildKitchen(){
  buildShell(PAL.floorK, PAL.wallK);
  const {w,d}=CFG.room;
  // counters along back and left walls
  const c1=box(w-3,1.0,1.6,PAL.tan); addStructure(c1,new CANNON.Box(new CANNON.Vec3((w-3)/2,0.5,0.8)),new THREE.Vector3(0,0.5,-d/2+0.9));
  const c2=box(1.6,1.0,d-4,PAL.tan); addStructure(c2,new CANNON.Box(new CANNON.Vec3(0.8,0.5,(d-4)/2)),new THREE.Vector3(-w/2+0.9,0.5,0.5));
  // central island
  const isl=box(4.6,1.1,2.4,PAL.teal); addStructure(isl,new CANNON.Box(new CANNON.Vec3(2.3,0.55,1.2)),new THREE.Vector3(0.5,0.55,0.6));
  // plates on island + counter
  plateStack(-0.6,0.4,6,1.1); plateStack(0.9,0.9,6,1.1); plateStack(-4.2,-d/2+0.9,4,1.0);
  // cereal boxes on back counter
  cerealRow(-2.2,-d/2+0.8,5,1.0,true); cerealRow(-w/2+0.85,-1.4,3,1.0,false);
  // blender + pots
  const bl=new THREE.Group();
  const b1=cyl(0.28,0.34,0.5,PAL.chrome,{metal:0.6,rough:0.3}); b1.position.y=0.25;
  const b2=cyl(0.22,0.26,0.45,PAL.teal); b2.position.y=0.7; bl.add(b1,b2);
  bl.traverse(o=>{o.castShadow=true;});
  addProp(bl,new CANNON.Cylinder(0.26,0.34,0.95,10),new THREE.Vector3(2.4,1.49,-d/2+0.9),DEFS.blender);
  for(let i=0;i<4;i++){
    const pot=cyl(0.42,0.38,0.42,PAL.chrome,{metal:0.7,rough:0.3});
    addProp(pot,new CANNON.Cylinder(0.42,0.38,0.42,10),new THREE.Vector3(-w/2+0.9,1.25,1.6+i*1.0),DEFS.pot);
  }
  // gas canisters (glow accents)
  for(const [x,z] of [[3.4,3.6],[-3.6,2.8]]){
    const g=new THREE.Group();
    const gc=cyl(0.32,0.32,0.9,PAL.red,{rough:0.45}); gc.position.y=0.45;
    const gt=cyl(0.1,0.1,0.16,PAL.glow); gt.position.y=0.96; g.add(gc,gt);
    addProp(g,new CANNON.Cylinder(0.32,0.32,1.0,10),new THREE.Vector3(x,0.5,z),DEFS.canister);
  }
  // pans stack on island edge
  for(let i=0;i<3;i++){
    const pan=cyl(0.45,0.42,0.16,PAL.chrome,{metal:0.7,rough:0.35});
    addProp(pan,new CANNON.Cylinder(0.45,0.42,0.16,10),new THREE.Vector3(2.2,1.2+i*0.18,1.1),DEFS.pot);
  }
}
function buildOffice(){
  buildShell(PAL.floorO, PAL.wallO);
  const {w,d}=CFG.room;
  // desks (static) in two cubicle rows
  const deskY=0.95;
  for(const [x,z] of [[-3.5,-2.5],[0.5,-2.5],[4,-2.5],[-3.5,2.5],[0.5,2.5],[4,2.5]]){
    const dk=box(2.6,0.14,1.2,PAL.tan); addStructure(dk,new CANNON.Box(new CANNON.Vec3(1.3,0.07,0.6)),new THREE.Vector3(x,deskY,z));
    const leg=box(2.3,0.8,0.12,PAL.tanDark); addStructure(leg,new CANNON.Box(new CANNON.Vec3(1.15,0.4,0.06)),new THREE.Vector3(x,0.45,z));
  }
  // fragile cubicle dividers
  for(const [x,z,ry] of [[-1.7,-2.5,0],[2.3,-2.5,0],[-1.7,2.5,0],[2.3,2.5,0],[-5.2,0,Math.PI/2],[5.8,0,Math.PI/2]]){
    const dv=box(0.12,1.9,2.2,PAL.creamDim);
    addProp(dv,new CANNON.Box(new CANNON.Vec3(0.06,0.95,1.1)),new THREE.Vector3(x,0.96,z),DEFS.divider,ry);
  }
  // monitors on desks
  for(const [x,z] of [[-3.5,-2.6],[0.5,-2.6],[4,-2.6],[-3.5,2.4],[0.5,2.4]]){
    const g=new THREE.Group();
    const scr=box(0.9,0.6,0.08,PAL.monitor,{rough:0.3}); scr.position.y=0.5;
    const face=box(0.8,0.5,0.02,PAL.teal,{rough:0.2}); face.position.set(0,0.5,0.05);
    const st=box(0.16,0.34,0.16,PAL.ink); st.position.y=0.17; g.add(scr,face,st);
    addProp(g,new CANNON.Box(new CANNON.Vec3(0.45,0.42,0.15)),new THREE.Vector3(x,deskY+0.5,z),DEFS.monitor);
  }
  // rolling chairs (near-zero friction bases)
  for(const [x,z] of [[-3.5,-1.1],[0.5,-1.1],[4,3.8],[-3.5,3.8]]){
    const g=new THREE.Group();
    const seat=box(0.7,0.14,0.7,PAL.red); seat.position.y=0.55;
    const back=box(0.7,0.7,0.12,PAL.redDark); back.position.set(0,1.0,-0.3);
    const pole=cyl(0.06,0.06,0.5,PAL.chrome,{metal:0.7}); pole.position.y=0.28;
    const base=cyl(0.34,0.34,0.08,PAL.ink); base.position.y=0.05; g.add(seat,back,pole,base);
    const e=addProp(g,new CANNON.Box(new CANNON.Vec3(0.36,0.68,0.36)),new THREE.Vector3(x,0.7,z),DEFS.chair);
    e.body.material=slickMat; e.body.shapeOffsets[0].set(0,0,0);
  }
  // water coolers
  for(const [x,z] of [[-6.6,-4.6],[6.6,4.6]]){
    const g=new THREE.Group();
    const bod=box(0.55,1.1,0.55,PAL.creamDim); bod.position.y=0.55;
    const jug=cyl(0.26,0.3,0.5,PAL.water,{rough:0.15}); jug.position.y=1.35; g.add(bod,jug);
    addProp(g,new CANNON.Box(new CANNON.Vec3(0.3,0.8,0.3)),new THREE.Vector3(x,0.8,z),DEFS.cooler);
  }
  // filing cabinets
  for(const [x,z] of [[6.8,-3.6],[6.8,-2.4],[-6.8,3.4]]){
    const cb=box(0.7,1.5,0.6,PAL.chrome,{metal:0.5,rough:0.4});
    addProp(cb,new CANNON.Box(new CANNON.Vec3(0.35,0.75,0.3)),new THREE.Vector3(x,0.76,z),DEFS.cabinet);
  }
  // paper stacks
  for(const [x,z] of [[-4.2,-2.4],[1.2,-2.4],[3.3,-2.4],[-2.9,2.4],[1.2,2.4],[4.7,2.4],[6.8,-1.4],[-6.8,2.3]]){
    const pp=box(0.4,0.3,0.5,PAL.paper);
    addProp(pp,new CANNON.Box(new CANNON.Vec3(0.2,0.15,0.25)),new THREE.Vector3(x,(Math.abs(x)>6?0.16:deskY+0.22),z),DEFS.paper,rr(-.2,.2));
  }
  // aerosol cans
  for(const [x,z] of [[5.4,-2.4],[-0.9,2.4]]){
    const g=new THREE.Group();
    const cn=cyl(0.14,0.14,0.5,PAL.red); cn.position.y=0.25;
    const cap=cyl(0.09,0.09,0.1,PAL.glow); cap.position.y=0.55; g.add(cn,cap);
    addProp(g,new CANNON.Cylinder(0.14,0.14,0.6,8),new THREE.Vector3(x,deskY+0.38,z),DEFS.canister);
  }
}
function buildFloor(){
  clearRoom();
  if(floor%2===1) buildKitchen(); else buildOffice();
  roomTotal=entities.reduce((s,e)=>s+e.def.points,0);
  target=Math.round(roomTotal*Math.min(0.35+floor*0.05,0.75)/10)*10;
}

// ---------- player items ----------
function makeItemMesh(type){
  const g=new THREE.Group();
  if(type==="ball"){
    const b=new THREE.Mesh(new THREE.SphereGeometry(0.45,20,16),new THREE.MeshStandardMaterial({color:PAL.red,roughness:0.15,metalness:0.1}));
    b.position.y=0.45; g.add(b);
  }else if(type==="car"){
    const bd=box(0.42,0.24,0.85,PAL.red,{rough:0.3}); bd.position.y=0.26;
    const nose=cyl(0.06,0.14,0.3,PAL.chrome,{metal:0.8,rough:0.2}); nose.rotation.x=Math.PI/2; nose.position.set(0,0.26,0.55);
    const fl=cyl(0.05,0.11,0.2,PAL.glow); fl.rotation.x=-Math.PI/2; fl.position.set(0,0.26,-0.5);
    for(const [x,z] of [[-0.24,0.28],[0.24,0.28],[-0.24,-0.28],[0.24,-0.28]]){
      const wh=cyl(0.11,0.11,0.09,PAL.ink); wh.rotation.z=Math.PI/2; wh.position.set(x,0.12,z); g.add(wh);
    }
    g.add(bd,nose,fl);
  }else if(type==="magnet"){
    const base=cyl(0.3,0.36,0.16,PAL.ink); base.position.y=0.08;
    const u1=box(0.16,0.6,0.16,PAL.red); u1.position.set(-0.18,0.5,0);
    const u2=box(0.16,0.6,0.16,PAL.red); u2.position.set(0.18,0.5,0);
    const top=box(0.52,0.18,0.16,PAL.redDark); top.position.y=0.85;
    const t1=box(0.16,0.1,0.16,PAL.chrome,{metal:0.8}); t1.position.set(-0.18,0.22,0);
    const t2=box(0.16,0.1,0.16,PAL.chrome,{metal:0.8}); t2.position.set(0.18,0.22,0);
    g.add(base,u1,u2,top,t1,t2);
  }else if(type==="keg"){
    const k=cyl(0.32,0.32,0.75,PAL.red,{rough:0.35}); k.position.y=0.38;
    const b1=cyl(0.335,0.335,0.06,PAL.chrome,{metal:0.8,rough:0.25}); b1.position.y=0.14;
    const b2=cyl(0.335,0.335,0.06,PAL.chrome,{metal:0.8,rough:0.25}); b2.position.y=0.62;
    g.add(k,b1,b2);
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  return g;
}
function itemShape(type){
  if(type==="ball") return {shape:new CANNON.Sphere(0.45), off:0.45, mass:12, slick:true};
  if(type==="car") return {shape:new CANNON.Box(new CANNON.Vec3(0.22,0.19,0.5)), off:0.2, mass:2};
  if(type==="magnet") return {shape:new CANNON.Box(new CANNON.Vec3(0.28,0.47,0.2)), off:0.47, mass:0};
  if(type==="keg") return {shape:new CANNON.Cylinder(0.32,0.32,0.76,10), off:0.38, mass:5};
}
function placeItem(type, point, normal, yaw){
  const mesh=makeItemMesh(type);
  const {shape,off,mass,slick}=itemShape(type);
  const up=new THREE.Vector3(0,1,0);
  const qAlign=new THREE.Quaternion().setFromUnitVectors(up, normal.clone().normalize());
  const qYaw=new THREE.Quaternion().setFromAxisAngle(up, yaw);
  const q=qAlign.multiply(qYaw);
  const basePos=point.clone().add(normal.clone().multiplyScalar(0.02));
  const bodyPos=point.clone().add(normal.clone().multiplyScalar(off+0.02));
  mesh.position.copy(basePos); mesh.quaternion.copy(q);
  const body=new CANNON.Body({mass:0, shape, position:new CANNON.Vec3(bodyPos.x,bodyPos.y,bodyPos.z)});
  body.quaternion.set(q.x,q.y,q.z,q.w);
  if(slick) body.material=slickMat;
  world.addBody(body); scene.add(mesh);
  const it={type,mesh,body,yaw,mass,armT:0,jet:0,exploded:false,storedPos:basePos.clone(),storedQuat:q.clone(),normal:normal.clone()};
  body._item=it;
  placedItems.push(it);
  return it;
}
function removePlaced(it){
  scene.remove(it.mesh); safeRemove(it.body);
  placedItems=placedItems.filter(p=>p!==it);
}
function activateItems(){
  magnets=[];
  for(const it of placedItems){
    const fwd=new THREE.Vector3(0,0,1).applyQuaternion(it.mesh.quaternion);
    if(it.type==="magnet"){ magnets.push(it); continue; }
    it.body.mass=it.mass; it.body.type=CANNON.Body.DYNAMIC;
    it.body.updateMassProperties(); it.body.wakeUp();
    it.body.allowSleep=true; it.body.sleepSpeedLimit=0.1;
    if(it.type==="ball"){ it.body.velocity.set(fwd.x*CFG.ballSpeed, Math.max(0,fwd.y)*CFG.ballSpeed*0.4, fwd.z*CFG.ballSpeed); }
    if(it.type==="car"){
      it.fwd=fwd; it.armT=CFG.car.armTime;
      it.body.addEventListener("collide",(ev)=>{
        if(state!==S.REACTION||it.exploded||it.armT>0) return;
        if(Math.abs(ev.contact.getImpactVelocityAlongNormal())<1.2) return;
        it.exploded=true;
        explode(it.body.position,{radius:2.6,impulse:26,damage:8});
        removePlaced(it);
      });
    }
    if(it.type==="keg"){
      it.body.addEventListener("collide",(ev)=>{
        if(state!==S.REACTION||it.exploded||it.jet>0) return;
        const iv=Math.abs(ev.contact.getImpactVelocityAlongNormal());
        const om=ev.body.mass>0?ev.body.mass:it.body.mass;
        if(iv*om>CFG.keg.hurtAt){ it.jet=CFG.keg.jetTime; it.jetDir=new CANNON.Vec3(rr(-1,1),rr(0,.8),rr(-1,1)); it.jetSw=0; }
      });
    }
  }
}
function updateItems(dt){
  for(const it of [...placedItems]){
    if(it.type==="car"&&!it.exploded){
      if(it.armT>0) it.armT-=dt;
      it.fuel=(it.fuel??7)-dt;
      if(it.fuel<=0){ it.exploded=true; explode(it.body.position,{radius:2.6,impulse:26,damage:8}); removePlaced(it); continue; }
      const f=CFG.car.force;
      it.body.applyForce(new CANNON.Vec3(it.fwd.x*f,0,it.fwd.z*f), it.body.position);
      it.body.wakeUp();
      if(rng()<0.6) fireP.emit({x:it.body.position.x-it.fwd.x*0.5,y:it.body.position.y,z:it.body.position.z-it.fwd.z*0.5},{x:rr(-.5,.5),y:rr(.5,1.5),z:rr(-.5,.5)},0.3);
    }
    if(it.type==="keg"&&it.jet>0&&!it.exploded){
      it.jet-=dt; it.jetSw-=dt;
      if(it.jetSw<=0){ it.jetSw=CFG.keg.switchEvery; it.jetDir=new CANNON.Vec3(rr(-1,1),rr(-0.2,0.9),rr(-1,1)); it.jetDir.normalize(); }
      it.body.applyForce(it.jetDir.scale(CFG.keg.jetForce), it.body.position);
      it.body.wakeUp();
      dustP.emit(it.body.position,{x:rr(-2,2),y:rr(1,3),z:rr(-2,2)},0.5);
      if(it.jet<=0){ it.exploded=true; explode(it.body.position,{radius:3.0,impulse:34,damage:10}); removePlaced(it); }
    }
  }
  // magnets pull metallic bodies
  for(const mg of magnets){
    const mp=mg.body.position;
    if(rng()<0.4) sparkP.emit(mp,{x:rr(-1,1),y:rr(1,2),z:rr(-1,1)},0.3);
    const pullOn=(b,m)=>{
      mp.vsub(b.position,_cv); const d=_cv.length();
      if(d>CFG.magnet.radius||d<0.6) return;
      _cv.scale(CFG.magnet.pull*m/(d*d), _cv);
      b.applyForce(_cv, b.position); b.wakeUp();
    };
    for(const e of entities) if(e.alive&&e.def.metallic&&e.body.mass>0) pullOn(e.body, Math.min(e.body.mass,3));
    for(const it of placedItems) if(it!==mg&&it.body.mass>0&&(it.type==="keg"||it.type==="car")) pullOn(it.body,1.5);
  }
  // sync meshes
  for(const it of placedItems){
    it.mesh.position.set(it.body.position.x,it.body.position.y,it.body.position.z);
    // mesh pivot at base — offset down along local up by shape offset
    const {off}=itemShape(it.type);
    const upL=new THREE.Vector3(0,1,0).applyQuaternion(new THREE.Quaternion(it.body.quaternion.x,it.body.quaternion.y,it.body.quaternion.z,it.body.quaternion.w));
    it.mesh.position.addScaledVector(upL,-off);
    it.mesh.quaternion.set(it.body.quaternion.x,it.body.quaternion.y,it.body.quaternion.z,it.body.quaternion.w);
  }
}

// ---------- inventory / cards ----------
let inventory=[];    // item type strings
let runMods=[];
let selected=-1;     // index into inventory (placement mode)
let ghost=null, ghostYaw=0, ghostValid=false, ghostPoint=null, ghostNormal=null;
const GLYPH={ball:"🎳",car:"🚗",magnet:"🧲",keg:"🛢️",micrograv:"🪐",michaelbay:"💥",zerofriction:"🧊"};
function renderTray(){
  const tr=$("tray"); tr.innerHTML="";
  inventory.forEach((t,i)=>{
    const b=document.createElement("button");
    b.className="trayItem"+(i===selected?" sel":"");
    b.innerHTML=`<span class="glyph">${GLYPH[t]}</span>${STR.itemNames[t]}`;
    b.onclick=(ev)=>{ ev.stopPropagation(); selectItem(i===selected?-1:i); };
    tr.appendChild(b);
  });
  const rot=document.createElement("div"); rot.id="rotBtns"; rot.style.display=selected>=0?"flex":"none";
  const mk=(t,f)=>{const x=document.createElement("button");x.className="rotBtn";x.textContent=t;x.onclick=(e)=>{e.stopPropagation();f();};rot.appendChild(x);};
  mk("⟲",()=>{ghostYaw-=Math.PI/8;}); mk("⟳",()=>{ghostYaw+=Math.PI/8;});
  tr.appendChild(rot);
  const go=document.createElement("button"); go.id="goBtn"; go.textContent=STR.go;
  go.style.display=(state===S.SETUP&&placedItems.length>0)?"block":"none";
  go.onclick=(e)=>{e.stopPropagation(); startReaction();};
  tr.appendChild(go);
}
function selectItem(i){
  selected=i;
  killGhost();
  if(i>=0){
    ghost=makeItemMesh(inventory[i]);
    ghost.traverse(o=>{ if(o.isMesh){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.55; o.castShadow=false; }});
    ghost.visible=false; scene.add(ghost);
    $("hint").textContent=STR.place;
  } else $("hint").textContent=isTouch?STR.pickupHint:STR.helpSetup;
  renderTray();
}
function killGhost(){ if(ghost){scene.remove(ghost); ghost=null;} }

const CARD_POOL=[
  {id:"ball",kind:"item",w:3},{id:"car",kind:"item",w:3},{id:"magnet",kind:"item",w:2},{id:"keg",kind:"item",w:3},
  {id:"micrograv",kind:"mod",w:1},{id:"michaelbay",kind:"mod",w:1},{id:"zerofriction",kind:"mod",w:1},
];
function drawCards(){
  const pool=CARD_POOL.filter(c=>c.kind==="item"||!runMods.includes(c.id));
  const picks=[];
  const bag=[...pool];
  while(picks.length<3&&bag.length){
    let tw=bag.reduce((s,c)=>s+c.w,0), r=rng()*tw, idx=0;
    for(let i=0;i<bag.length;i++){ r-=bag[i].w; if(r<=0){idx=i;break;} }
    picks.push(bag[idx]); bag.splice(idx,1);
  }
  return picks;
}
function showDraft(){
  setState(S.DRAFT);
  const cs=$("cards"); cs.innerHTML="";
  for(const c of drawCards()){
    const el=document.createElement("div"); el.className="card";
    const isMod=c.kind==="mod";
    el.innerHTML=`<span class="kind${isMod?" mod":""}">${isMod?STR.typeMod:STR.typeItem}</span>
      <div class="glyph">${GLYPH[c.id]}</div>
      <div class="name">${isMod?STR.modNames[c.id]:STR.itemNames[c.id]}</div>
      <div class="desc">${isMod?STR.modDescs[c.id]:STR.itemDescs[c.id]}</div>`;
    el.onclick=()=>{
      if(isMod){ runMods.push(c.id); applyMods(); } else inventory.push(c.id);
      $("draftOverlay").style.display="none";
      enterSetup();
    };
    cs.appendChild(el);
  }
  $("draftOverlay").style.display="flex";
}
function applyMods(){
  world.gravity.set(0, runMods.includes("micrograv")?-9.82*0.2:-9.82, 0);
  world.defaultContactMaterial.friction = runMods.includes("zerofriction")?0:0.35;
  refreshHud();
}

// ---------- state machine ----------
const S={MENU:0,DRAFT:1,SETUP:2,REACTION:3,RESULT:4};
let state=S.MENU;
let reactT=0, calmT=0, shake=0;
function setState(s){ state=s; }
function enterSetup(){
  setState(S.SETUP);
  selected=-1; killGhost();
  $("hint").textContent=isTouch?STR.place:STR.helpSetup;
  $("timerbox").style.display="none";
  $("resetBtn").style.display="block";
  refreshHud(); renderTray();
}
function startReaction(){
  if(state!==S.SETUP||placedItems.length===0) return;
  // snapshot placements for the lose-path restore
  for(const it of placedItems){ it.storedPos=it.mesh.position.clone(); it.storedQuat=it.mesh.quaternion.clone(); }
  setState(S.REACTION);
  selected=-1; killGhost(); renderTray();
  $("hint").textContent="";
  $("timerbox").style.display="block";
  $("resetBtn").style.display="none";
  reactT=0; calmT=0;
  applyMods();
  activateItems();
}
function endReaction(){
  setState(S.RESULT);
  if(score>BEST){ BEST=score; saveJSON("bc-best",{score:BEST}); }
  const won=score>=target;
  $("resultH").textContent=won?STR.win:STR.lose;
  $("resultH").style.color=won?"var(--glow)":"var(--red)";
  const st=$("resultStats");
  st.innerHTML=`<div class="statline">${STR.score}: <b>${score}</b> / ${target}</div>`+
    (won?"":`<div class="statline" style="font-size:12px;opacity:.8;max-width:420px">${STR.loseHint}</div>`);
  const btn=$("resultBtn");
  if(won&&floor>=CFG.maxFloors){
    $("resultH").textContent=STR.runOver;
    st.innerHTML=`<div class="statline">${STR.floorsCleared}: <b>${CFG.maxFloors}</b></div>`;
    btn.textContent=STR.mainMenu;
    btn.onclick=()=>{ $("resultOverlay").style.display="none"; showMenu(); };
  } else if(won){
    btn.textContent=STR.nextFloor;
    btn.onclick=()=>{ $("resultOverlay").style.display="none"; nextFloor(); };
  } else {
    btn.textContent=STR.retry;
    btn.onclick=()=>{ $("resultOverlay").style.display="none"; retryFloor(); };
  }
  $("resultOverlay").style.display="flex";
}
function clearPlaced(){ for(const it of [...placedItems]) removePlaced(it); placedItems=[]; }
function nextFloor(){
  floor++;
  clearPlaced();
  inventory=["ball","car"]; // fresh starter kit each floor; drafted card adds to it
  score=0;
  buildFloor();
  showDraft();
}
function retryFloor(){
  // room back to 100% integrity, items exactly where they were
  const saved=placedItems.map(it=>({type:it.type,pos:it.storedPos.clone(),quat:it.storedQuat.clone(),yaw:it.yaw}));
  clearPlaced();
  buildFloor();
  score=0;
  for(const s of saved){
    const mesh=makeItemMesh(s.type);
    const {shape,off,mass,slick}=itemShape(s.type);
    mesh.position.copy(s.pos); mesh.quaternion.copy(s.quat);
    const upL=new THREE.Vector3(0,1,0).applyQuaternion(s.quat);
    const bp=s.pos.clone().addScaledVector(upL,off);
    const body=new CANNON.Body({mass:0, shape, position:new CANNON.Vec3(bp.x,bp.y,bp.z)});
    body.quaternion.set(s.quat.x,s.quat.y,s.quat.z,s.quat.w);
    if(slick) body.material=slickMat;
    world.addBody(body); scene.add(mesh);
    const it={type:s.type,mesh,body,yaw:s.yaw,mass,armT:0,jet:0,exploded:false,storedPos:s.pos.clone(),storedQuat:s.quat.clone()};
    body._item=it; placedItems.push(it);
  }
  enterSetup();
}
function newRun(){
  floor=1; score=0; runMods=[]; inventory=["ball","car"];
  runSeed=(Date.now()&0xffffff)^0x9e3779b9; rng=mulberry32(runSeed);
  clearPlaced(); applyMods(); buildFloor(); showDraft();
}
// ================= MAIN MENU: avatar stage, customization, modals =================
let menuGroup=null, avatarG=null, menuT=0;
const AV_COLORS=[PAL.red, PAL.teal, PAL.glow, 0x8e5bd6, 0x4a5560];
function sph(r,color,opts={}){
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,18,14), new THREE.MeshStandardMaterial({color, roughness:opts.rough??0.5, metalness:opts.metal??0.05, emissive:opts.emissive??0x000000}));
  m.castShadow=true; return m;
}
function makeAvatar(cfg){
  const col=AV_COLORS[cfg.color%AV_COLORS.length];
  const g=new THREE.Group();
  for(const s of [-1,1]){ const leg=cyl(0.09,0.12,0.34,PAL.ink,{edges:false}); leg.position.set(s*0.14,0.17,0); g.add(leg); }
  const body=cyl(0.27,0.36,0.6,col,{rough:0.55}); body.position.y=0.64; g.add(body);
  const belt=cyl(0.365,0.375,0.09,PAL.teal,{edges:false}); belt.position.y=0.42; g.add(belt);
  for(const s of [-1,1]){
    const arm=cyl(0.07,0.09,0.42,col,{edges:false}); arm.position.set(s*0.38,0.72,0); arm.rotation.z=s*-0.5; g.add(arm);
    const hand=sph(0.1,PAL.cream); hand.position.set(s*0.5,0.52,0); g.add(hand);
  }
  const head=sph(0.3,PAL.cream); head.position.y=1.22; g.add(head);
  const gog=box(0.5,0.13,0.12,PAL.teal,{rough:0.25}); gog.position.set(0,1.28,0.24); g.add(gog);
  for(const s of [-1,1]){ const lens=cyl(0.07,0.07,0.13,PAL.glow,{edges:false,rough:0.2}); lens.rotation.x=Math.PI/2; lens.position.set(s*0.12,1.28,0.26); g.add(lens); }
  if(cfg.hat===1){ // cap
    const cap=cyl(0.24,0.28,0.18,col); cap.position.y=1.52; g.add(cap);
    const brim=box(0.34,0.05,0.24,col,{edges:false}); brim.position.set(0,1.46,0.3); g.add(brim);
  } else if(cfg.hat===2){ // antenna
    const rod=cyl(0.022,0.022,0.34,PAL.ink,{edges:false}); rod.position.y=1.62; g.add(rod);
    const bulb=sph(0.08,PAL.glow,{emissive:0xff8a1e}); bulb.position.y=1.82; g.add(bulb);
  } else if(cfg.hat===3){ // crown
    const crown=cyl(0.24,0.28,0.2,PAL.glow,{metal:0.6,rough:0.3}); crown.position.y=1.54; g.add(crown);
  }
  g.scale.setScalar(1.25);
  g.traverse(o=>{ if(o.isMesh){o.castShadow=true;} });
  return g;
}
function buildMenuStage(){
  teardownMenuStage();
  menuGroup=new THREE.Group();
  const ground=new THREE.Mesh(new THREE.CircleGeometry(9,40), new THREE.MeshStandardMaterial({color:PAL.creamDim,roughness:0.95}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; menuGroup.add(ground);
  const podium=cyl(1.5,1.8,0.3,PAL.teal,{rough:0.6}); podium.position.y=0.15; podium.receiveShadow=true; menuGroup.add(podium);
  avatarG=makeAvatar(AVATAR); avatarG.position.y=0.3; menuGroup.add(avatarG);
  // flavor props scattered around the stage
  const b=makeItemMesh("ball"); b.position.set(-2.6,0,1.1); b.rotation.y=0.6; menuGroup.add(b);
  const c=makeItemMesh("car"); c.position.set(2.4,0,1.5); c.rotation.y=-0.9; menuGroup.add(c);
  const k=makeItemMesh("keg"); k.position.set(2.1,0,-1.6); k.rotation.z=0.12; menuGroup.add(k);
  const m=makeItemMesh("magnet"); m.position.set(-2.2,0,-1.8); m.rotation.y=0.8; menuGroup.add(m);
  scene.add(menuGroup);
}
function teardownMenuStage(){ if(menuGroup){ scene.remove(menuGroup); menuGroup=null; avatarG=null; } }
const gameOrbit={yaw:0.8,pitch:0.55,dist:19,ty:2.2};
function showMenu(){
  setState(S.MENU);
  clearPlaced(); clearRoom();
  buildMenuStage();
  scene.background=bgMenu; scene.fog.color.setHex(0x9e4a24); scene.fog.near=26; scene.fog.far=60;
  orbit.yaw=0.55; orbit.pitch=0.3; orbit.dist=6.2; orbit.target.set(0,1.35,0);
  $("menuOverlay").style.display="grid";
  $("topbar").style.display="none"; $("modbar").style.display="none"; $("tray").style.display="none";
  $("resetBtn").style.display="none"; $("hint").textContent=""; renderTray();
  $("bestVal").textContent=BEST;
}
function startGame(){
  teardownMenuStage();
  scene.background=bgGame; scene.fog.color.setHex(0x63381f); scene.fog.near=34; scene.fog.far=70;
  orbit.yaw=gameOrbit.yaw; orbit.pitch=gameOrbit.pitch; orbit.dist=gameOrbit.dist; orbit.target.set(0,gameOrbit.ty,0);
  $("menuOverlay").style.display="none";
  $("topbar").style.display="flex"; $("modbar").style.display="flex"; $("tray").style.display="flex";
  newRun();
}
$("startBtn").onclick=startGame;
$("navPlay").onclick=startGame;
$("resetBtn").onclick=()=>{ if(state===S.SETUP) showMenu(); };
// modals
const openModal=id=>{ $(id).style.display="flex"; };
$("navHow").onclick=()=>openModal("howModal");
$("navSettings").onclick=()=>openModal("settingsModal");
document.querySelectorAll(".modalClose").forEach(b=>{ b.onclick=()=>{ $(b.dataset.close).style.display="none"; }; });
document.querySelectorAll(".modalWrap").forEach(w=>{ w.addEventListener("pointerdown",e=>{ if(e.target===w) w.style.display="none"; }); });
// settings segments
function paintSettings(){
  $("shakeOn").classList.toggle("on",SETTINGS.shake); $("shakeOff").classList.toggle("on",!SETTINGS.shake);
  $("partHi").classList.toggle("on",SETTINGS.particles==="hi"); $("partLo").classList.toggle("on",SETTINGS.particles==="lo");
  $("resHi").classList.toggle("on",SETTINGS.res==="hi"); $("resLo").classList.toggle("on",SETTINGS.res==="lo");
}
function setSetting(k,v){ SETTINGS[k]=v; saveJSON("bc-settings",SETTINGS); paintSettings(); if(k==="res") resize(); }
$("shakeOn").onclick=()=>setSetting("shake",true); $("shakeOff").onclick=()=>setSetting("shake",false);
$("partHi").onclick=()=>setSetting("particles","hi"); $("partLo").onclick=()=>setSetting("particles","lo");
$("resHi").onclick=()=>setSetting("res","hi"); $("resLo").onclick=()=>setSetting("res","lo");
paintSettings();
// customization
function rebuildAvatar(){
  if(!menuGroup) return;
  const old=avatarG; avatarG=makeAvatar(AVATAR); avatarG.position.y=0.3;
  menuGroup.remove(old); menuGroup.add(avatarG);
  saveJSON("bc-avatar",AVATAR);
}
function buildCustRow(){
  const row=$("custRow"); row.innerHTML="";
  AV_COLORS.forEach((c,i)=>{
    const b=document.createElement("button");
    b.className="c-btn"+(AVATAR.color===i?" sel":"");
    b.style.background="#"+c.toString(16).padStart(6,"0");
    b.onclick=()=>{ AVATAR.color=i; rebuildAvatar(); buildCustRow(); };
    row.appendChild(b);
  });
  const hat=document.createElement("button");
  hat.className="c-btn"; hat.id="hatBtn"; hat.textContent=STR.hatCycle;
  hat.onclick=()=>{ AVATAR.hat=(AVATAR.hat+1)%4; rebuildAvatar(); };
  row.appendChild(hat);
}
buildCustRow();
showMenu();

// ---------- input ----------
let isTouch=false;
const ray=new THREE.Raycaster(); const ndc=new THREE.Vector2();
function castAt(cx,cy){
  ndc.set((cx/innerWidth)*2-1, -(cy/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  const hits=ray.intersectObjects(raycastTargets(), true);
  return hits.find(h=>h.object.isMesh)||null;
}
function ownerPlaced(obj){ let o=obj; while(o){ const f=placedItems.find(p=>p.mesh===o); if(f) return f; o=o.parent; } return null; }
function tryPlaceOrPick(cx,cy){
  if(state!==S.SETUP) return;
  const hit=castAt(cx,cy);
  if(!hit) return;
  const pk=ownerPlaced(hit.object);
  if(selected<0){
    if(pk){ // pick up back to tray
      inventory.push(pk.type); removePlaced(pk); renderTray();
    }
    return;
  }
  if(pk) return; // don't place onto own items while ghosting them? allowed on props/structures only
  const n=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):new THREE.Vector3(0,1,0);
  placeItem(inventory[selected], hit.point, n, ghostYaw);
  inventory.splice(selected,1);
  selected=-1; killGhost(); renderTray();
  $("hint").textContent=isTouch?STR.place:STR.helpSetup;
}
function updateGhost(cx,cy){
  if(!ghost||state!==S.SETUP){ return; }
  const hit=castAt(cx,cy);
  if(!hit||ownerPlaced(hit.object)){ ghost.visible=false; ghostValid=false; return; }
  const n=hit.face?hit.face.normal.clone().transformDirection(hit.object.matrixWorld):new THREE.Vector3(0,1,0);
  const up=new THREE.Vector3(0,1,0);
  const q=new THREE.Quaternion().setFromUnitVectors(up,n.clone().normalize()).multiply(new THREE.Quaternion().setFromAxisAngle(up,ghostYaw));
  ghost.position.copy(hit.point).add(n.clone().multiplyScalar(0.02));
  ghost.quaternion.copy(q);
  ghost.visible=true; ghostValid=true; ghostPoint=hit.point.clone(); ghostNormal=n;
}
// pointer: drag=orbit, click=place/pick
let pDown=false,pMoved=0,px=0,py=0,lastCx=innerWidth/2,lastCy=innerHeight/2;
canvas.addEventListener("pointerdown",e=>{ pDown=true; pMoved=0; px=e.clientX; py=e.clientY; if(e.pointerType==="touch") isTouch=true; });
canvas.addEventListener("pointermove",e=>{
  lastCx=e.clientX; lastCy=e.clientY;
  if(pDown&&touches.size<2){
    const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY;
    pMoved+=Math.abs(dx)+Math.abs(dy);
    if(pMoved>6){ orbit.yaw-=dx*0.006; orbit.pitch+=dy*0.006; }
  }
  updateGhost(e.clientX,e.clientY);
});
canvas.addEventListener("pointerup",e=>{
  if(pDown&&pMoved<=6) tryPlaceOrPick(e.clientX,e.clientY);
  pDown=false;
});
canvas.addEventListener("wheel",e=>{ orbit.dist+=e.deltaY*0.012; e.preventDefault(); },{passive:false});
// pinch zoom
const touches=new Map(); let pinchD=0;
canvas.addEventListener("touchstart",e=>{ for(const t of e.changedTouches) touches.set(t.identifier,{x:t.clientX,y:t.clientY}); if(touches.size===2) pinchD=0; },{passive:true});
canvas.addEventListener("touchmove",e=>{
  for(const t of e.changedTouches){ const o=touches.get(t.identifier); if(o){o.x=t.clientX;o.y=t.clientY;} }
  if(touches.size===2){
    const [a,b]=[...touches.values()];
    const d=Math.hypot(a.x-b.x,a.y-b.y);
    if(pinchD>0) orbit.dist-=(d-pinchD)*0.03;
    pinchD=d;
  }
},{passive:true});
canvas.addEventListener("touchend",e=>{ for(const t of e.changedTouches) touches.delete(t.identifier); pinchD=0; },{passive:true});
// keyboard: physical codes only
addEventListener("keydown",e=>{
  if(e.code==="KeyR"&&selected>=0){ ghostYaw+=Math.PI/8; updateGhost(lastCx,lastCy); }
  if(e.code==="KeyQ"){ orbit.yaw+=0.12; } if(e.code==="KeyE"){ orbit.yaw-=0.12; }
  if(e.code==="Space"&&state===S.SETUP&&placedItems.length>0){ e.preventDefault(); startReaction(); }
  if(e.code==="Enter"&&state===S.SETUP&&placedItems.length>0){ startReaction(); }
});
// gamepad
let padPrev={};
function pollPad(dt){
  const gp=(navigator.getGamepads?.()??[]).find(g=>g);
  if(!gp) return;
  const dz=v=>Math.abs(v)>0.18?v:0;
  orbit.yaw-=dz(gp.axes[2]||0)*2.2*dt;
  orbit.pitch+=dz(gp.axes[3]||0)*1.6*dt;
  orbit.dist+=(((gp.buttons[7]?.value||0)-(gp.buttons[6]?.value||0)))*10*dt;
  const pressed=i=>gp.buttons[i]?.pressed&&!padPrev[i];
  if(state===S.SETUP){
    if(pressed(0)) tryPlaceOrPick(innerWidth/2,innerHeight/2);           // A place / pick at crosshair
    if(pressed(1)&&selected>=0) selectItem(-1);                           // B cancel
    if(pressed(2)&&selected>=0){ ghostYaw+=Math.PI/8; }                   // X rotate
    if(pressed(14)) selectItem(selected<=0?inventory.length-1:selected-1);
    if(pressed(15)) selectItem((selected+1)%Math.max(1,inventory.length));
    if(pressed(9)&&placedItems.length>0) startReaction();                 // Start = GO
    if(ghost) updateGhost(innerWidth/2,innerHeight/2);
  }
  gp.buttons.forEach((b,i)=>padPrev[i]=b.pressed);
}

// ---------- resolution check ----------
function checkResolution(dt){
  reactT+=dt;
  $("timerbox").innerHTML=`${STR.timeLeft} <b>${Math.max(0,CFG.roundTime-reactT).toFixed(1)}</b>`;
  let maxV=0;
  for(const e of entities) if(e.alive&&e.body.mass>0) maxV=Math.max(maxV,e.body.velocity.length());
  for(const it of placedItems) if(it.body.mass>0) maxV=Math.max(maxV,it.body.velocity.length());
  for(const s of shards) if(s) maxV=Math.max(maxV,s.body.velocity.length());
  const anyBurning=entities.some(e=>e.alive&&e.burning);
  const anyJet=placedItems.some(it=>it.jet>0||( it.type==="car"&&!it.exploded));
  if(maxV<CFG.calmSpeed&&!anyBurning&&!anyJet) calmT+=dt; else calmT=0;
  if((calmT>=CFG.calmHold&&reactT>1.5)||reactT>=CFG.roundTime) endReaction();
}

// ---------- main loop ----------
let acc=0,last=performance.now(),paused=false,frames=0,fpsAt=last,fps=0;
addEventListener("blur",()=>paused=true);
addEventListener("focus",()=>{paused=false;last=performance.now();});
function update(dtMs){
  const dt=dtMs/1000;
  pollPad(dt);
  if(state===S.MENU){
    menuT+=dt;
    if(avatarG){ avatarG.position.y=0.3+Math.sin(menuT*2.2)*0.05; avatarG.rotation.y=Math.sin(menuT*0.6)*0.35; }
    orbit.yaw+=dt*0.1;
  }
  if(state===S.REACTION&&!paused){
    inStep=true;
    world.step(dtMs/1000);
    inStep=false;
    flushRemovals();
    updateItems(dt);
    updateFire(dt);
    checkResolution(dt);
  }
  // sync destructible prop meshes
  for(const e of entities){
    if(!e.alive) continue;
    e.mesh.position.set(e.body.position.x,e.body.position.y,e.body.position.z);
    e.mesh.quaternion.set(e.body.quaternion.x,e.body.quaternion.y,e.body.quaternion.z,e.body.quaternion.w);
    if(e.burning){ e.mesh.traverse(o=>{ if(o.isMesh&&o.material.emissive) o.material.emissive.setHex(0xff5a1e); }); }
  }
  updateShards(dt);
  for(const p of allP) p.update(dt);
  if(shake>0) shake=Math.max(0,shake-dt*1.2);
}
function frame(now){
  requestAnimationFrame(frame);
  acc+=now-last; last=now;
  if(acc>250) acc=250;
  while(acc>=CFG.step){ update(CFG.step); acc-=CFG.step; }
  applyCamera();
  if(shake>0&&SETTINGS.shake){ camera.position.x+=rr(-shake,shake); camera.position.y+=rr(-shake,shake); }
  renderer.render(scene,camera);
  if(DEV&&(frames++, now-fpsAt>=500)){
    fps=Math.round(frames*1000/(now-fpsAt)); frames=0; fpsAt=now;
    devEl.textContent=`${fps} fps\nbodies ${world.bodies.length}\nents ${entities.filter(e=>e.alive).length}\nshards ${shards.filter(Boolean).length}\ndraws ${renderer.info.render.calls}`;
  }
}
requestAnimationFrame(frame);
