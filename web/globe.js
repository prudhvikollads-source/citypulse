// Stylized 3D globe: procedural (no external textures), pulsing city markers.
import * as THREE from 'three';

export function createGlobe(canvas, cities, onDive) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true});
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.z = 3.4;

  // Earth: deep blue sphere + fresnel-ish rim via a slightly larger shell.
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshStandardMaterial({color:0x0e2a52, roughness:0.85, metalness:0.15}));
  scene.add(earth);
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.03, 64, 64),
    new THREE.MeshBasicMaterial({color:0x22d3ee, transparent:true, opacity:0.10,
      side:THREE.BackSide, blending:THREE.AdditiveBlending}));
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(4, 2, 3); scene.add(sun);

  // Procedural "continents": sprinkle faint landmass dots via noise-ish mask.
  // Cheap trick: random points kept where a pseudo-noise function is high.
  const land = [];
  const n2 = (x,y,z)=>Math.sin(x*5.1)*Math.sin(y*4.3+1.7)*Math.sin(z*4.9+0.6)
                   +0.5*Math.sin(x*11.3+2.0)*Math.sin(z*9.1);
  for (let i=0;i<26000;i++){
    const v = new THREE.Vector3().randomDirection();
    if (n2(v.x,v.y,v.z) > 0.42) land.push(v.multiplyScalar(1.002));
  }
  const landGeo = new THREE.BufferGeometry().setFromPoints(land);
  scene.add(new THREE.Points(landGeo,
    new THREE.PointsMaterial({color:0x1d5c8a, size:0.006, transparent:true, opacity:0.85})));

  // Starfield.
  const stars = [];
  for (let i=0;i<1400;i++) stars.push(new THREE.Vector3().randomDirection().multiplyScalar(14+Math.random()*20));
  scene.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(stars),
    new THREE.PointsMaterial({color:0xaac4ff, size:0.05, transparent:true, opacity:0.8})));

  // City markers: pulsing rings + labels.
  const group = new THREE.Group(); scene.add(group);
  const markers = cities.map(c => {
    const p = llToVec(c.lat, c.lon, 1.01);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.028, 0.042, 40),
      new THREE.MeshBasicMaterial({color:0x22d3ee, transparent:true, opacity:0.9, side:THREE.DoubleSide}));
    ring.position.copy(p); ring.lookAt(0,0,0); group.add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 16),
      new THREE.MeshBasicMaterial({color:0x67e8f9}));
    dot.position.copy(p); group.add(dot);
    return {city:c, ring, dot, phase:Math.random()*6.28};
  });

  function llToVec(lat, lon, r){
    const phi=(90-lat)*Math.PI/180, th=(lon+180)*Math.PI/180;
    return new THREE.Vector3(-r*Math.sin(phi)*Math.cos(th), r*Math.cos(phi), r*Math.sin(phi)*Math.sin(th));
  }

  // Interaction: drag to spin, click marker to dive.
  let rotX=0.35, rotY=-1.9, vX=0, vY=0.02, dragging=false, px=0, py=0, moved=0;
  canvas.addEventListener('pointerdown',e=>{dragging=true;moved=0;px=e.clientX;py=e.clientY;canvas.style.cursor='grabbing'});
  addEventListener('pointerup',()=>{dragging=false;canvas.style.cursor='grab'});
  addEventListener('pointermove',e=>{
    if(!dragging) return;
    const dx=e.clientX-px, dy=e.clientY-py; moved+=Math.abs(dx)+Math.abs(dy);
    vY=dx*0.004; vX=dy*0.004; px=e.clientX; py=e.clientY;
  });
  const ray=new THREE.Raycaster(), mouse=new THREE.Vector2();
  canvas.addEventListener('click',e=>{
    if(moved>8) return;
    const r=canvas.getBoundingClientRect();
    mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
    ray.setFromCamera(mouse,camera);
    const hits=ray.intersectObjects(markers.flatMap(m=>[m.ring,m.dot]));
    if(hits.length){
      const m=markers.find(m=>m.ring===hits[0].object||m.dot===hits[0].object);
      if(m) onDive(m.city.id);
    }
  });

  function resize(){
    const w=canvas.clientWidth||canvas.parentElement.clientWidth, h=canvas.clientHeight||canvas.parentElement.clientHeight;
    renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();
  }
  addEventListener('resize',resize); resize();

  const clock=new THREE.Clock();
  (function tick(){
    requestAnimationFrame(tick);
    const t=clock.getElapsedTime();
    if(!dragging){rotY+=vY*0.4+0.0012;rotX+=vX*0.2;vX*=0.94;vY*=0.94;
      rotX=Math.max(-1.1,Math.min(1.1,rotX));}
    else{rotY+=vY;rotX=Math.max(-1.1,Math.min(1.1,rotX+vX));vX*=0.9;vY*=0.9;}
    group.rotation.set(rotX,rotY,0); earth.rotation.set(rotX,rotY,0);
    markers.forEach(m=>{
      const s=1+0.35*Math.sin(t*2.4+m.phase);
      m.ring.scale.set(s,s,1);
      m.ring.material.opacity=0.55+0.35*Math.sin(t*2.4+m.phase);
    });
    renderer.render(scene,camera);
  })();

  return {
    focusCity(id){ // spin the globe so the city faces the camera
      const c=cities.find(c=>c.id===id);
      const v=llToVec(c.lat,c.lon,1);
      rotY=Math.atan2(v.x,-v.z)+Math.PI; rotX=Math.asin(Math.max(-1,Math.min(1,v.y)))*0.9;
    }
  };
}
