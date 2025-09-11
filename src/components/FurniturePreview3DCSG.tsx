// src/components/FurniturePreview3DCSG.tsx
'use client';

import * as THREE from 'three';
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, AccumulativeShadows, RandomizedLight, RoundedBox } from '@react-three/drei';
import { CSG } from 'three-csg-ts';

type Units = 'mm'|'in';
type Spec = { units: Units; assembly: { type: string; overall: { W:number; D:number; H:number } } };
type MT = { tenonThickness:number; tenonLength:number; shoulder?:number; haunch?:number };
type Join =
  | { type:'RABBET'; hostEdge?:'N'|'S'|'E'|'W'; width:number; depth:number }
  | { type:'DADO'  ; axis?:'X'|'Y'; offset?:number; width:number; depth:number }
  | { type:'GROOVE'; axis?:'X'|'Y'; offset?:number; width:number; depth:number }
  | { type:'MORTISE_TENON'; hostPartId?:string; hostEdge?:'N'|'S'|'E'|'W'; width:number; mt:MT };

const mm2m = (mm:number)=> mm*0.001;
function toMM(spec: Spec){ const o=spec.assembly.overall, k=(spec.units==='in'?25.4:1); return { W:o.W*k, D:o.D*k, H:o.H*k }; }
function clamp(v:number,a:number,b:number){ return Math.max(a, Math.min(b,v)); }
function stdMat(color='#d8c6a8', rough=0.5){ return new THREE.MeshStandardMaterial({ color, roughness:rough, metalness:0.05 }); }

function derive(Wm:number, Dm:number, Hm:number) {
  const topThk = THREE.MathUtils.clamp(Hm*0.05, 0.018, 0.04);
  const legThk = THREE.MathUtils.clamp(Math.min(Wm,Dm)*0.07, 0.04, 0.07);
  const apronH = THREE.MathUtils.clamp(Hm*0.18, 0.07, 0.11);
  const apronDrop = THREE.MathUtils.clamp(topThk + 0.02, 0.08, 0.14);
  return { topThk, legThk, apronH, apronDrop };
}

function legWithMortises(size:[number,number,number], cutters: THREE.Mesh[]) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(...size));
  if (!cutters.length) return base;
  let union = cutters[0]; for (let i=1;i<cutters.length;i++) union = CSG.union(union, cutters[i]);
  return CSG.subtract(base, union);
}
function topWithCuts(size:[number,number,number], cutters: THREE.Mesh[]) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(...size));
  if (!cutters.length) return base;
  let union = cutters[0]; for (let i=1;i<cutters.length;i++) union = CSG.union(union, cutters[i]);
  return CSG.subtract(base, union);
}

function ModelCSG({ spec, joins }:{ spec: Spec; joins: Join[] }) {
  const { W, D, H } = toMM(spec);
  const Wm = mm2m(W), Dm = mm2m(D), Hm = mm2m(H);
  const { topThk, legThk, apronH, apronDrop } = derive(Wm, Dm, Hm);
  const matTop = stdMat('#DCC9A6', 0.45), matLeg = stdMat('#CFBEA2', 0.6), matApr = stdMat('#D0BEA1', 0.58), matTen = stdMat('#e7b0a8', 0.45);

  const topPos:[number,number,number] = [Wm/2, Dm/2, Hm - topThk/2];
  const legZ = (Hm - topThk)/2;
  const legsPos = {
    'leg-fl':[legThk/2,          legThk/2,        legZ] as [number,number,number],
    'leg-fr':[Wm - legThk/2,     legThk/2,        legZ],
    'leg-br':[Wm - legThk/2,     Dm - legThk/2,   legZ],
    'leg-bl':[legThk/2,          Dm - legThk/2,   legZ]
  };


  // Top cutters: DADO/GROOVE X and RABBET at N/E
  const topCutters: THREE.Mesh[] = [];
  joins.forEach(j=>{
    if ((j.type==='DADO' || j.type==='GROOVE') && (j.axis??'X')==='X') {
      const w = mm2m(j.width), d = mm2m(j.depth);
      const y = (typeof j.offset==='number') ? clamp((j.offset/(D||1))*Dm, legThk, Dm-legThk) : Dm/2;
      const cutter = new THREE.Mesh(new THREE.BoxGeometry(Wm-2*legThk, w, d));
      cutter.position.set(Wm/2, y, Hm - topThk + d/2);
      topCutters.push(cutter);
    }
    if (j.type==='RABBET') {
      const w = mm2m(j.width), d = mm2m(j.depth);
      if (j.hostEdge==='N') {
        const cutter = new THREE.Mesh(new THREE.BoxGeometry(Wm-2*legThk, w, d));
        cutter.position.set(Wm/2, legThk + w/2, Hm - topThk + d/2);
        topCutters.push(cutter);
      }
      if (j.hostEdge==='E') {
        const cutter = new THREE.Mesh(new THREE.BoxGeometry(w, Dm-2*legThk, d));
        cutter.position.set(Wm - (legThk + w/2), Dm/2, Hm - topThk + d/2);
        topCutters.push(cutter);
      }
    }
  });

  // Mortises per leg + visible tenons
  const legCutters: Record<string, THREE.Mesh[]> = { 'leg-fl':[], 'leg-fr':[], 'leg-br':[], 'leg-bl':[] };
  const tenons: THREE.Mesh[] = [];
  joins.forEach(j=>{
    if (j.type!=='MORTISE_TENON') return;
    const legId = (j.hostPartId||'').toLowerCase(); if (!legCutters[legId]) return;
    const w = mm2m(j.width), tLen=mm2m(j.mt.tenonLength), tThk=mm2m(j.mt.tenonThickness); const face=j.hostEdge??'E';
    let cutter: THREE.Mesh | null = null;
    if (face==='E'||face==='W'){
      cutter = new THREE.Mesh(new THREE.BoxGeometry(mm2m(8), w, tThk));
      const x=(face==='E')?Wm - legThk/2 - 0.004:legThk/2 + 0.004; cutter.position.set(x, Dm/2, Hm - apronDrop - apronH/2);
      cutter.position.x += (face==='E' ? -tLen/2 : tLen/2);
    } else {
      cutter = new THREE.Mesh(new THREE.BoxGeometry(w, mm2m(8), tThk));
      const y=(face==='N')?legThk/2 + 0.004: Dm - legThk/2 - 0.004; cutter.position.set(Wm/2, y, Hm - apronDrop - apronH/2);
      cutter.position.y += (face==='N' ? +tLen/2 : -tLen/2);
    }
    legCutters[legId].push(cutter);
    // visible tenon block on apron end
    const ten = new THREE.Mesh((face==='E'||face==='W')?new THREE.BoxGeometry(tLen,w,tThk):new THREE.BoxGeometry(w,tLen,tThk));
    if (face==='E') ten.position.set(Wm-(legThk+tLen/2), Dm/2, Hm - apronDrop - apronH/2);
    if (face==='W') ten.position.set(legThk + tLen/2,     Dm/2, Hm - apronDrop - apronH/2);
    if (face==='N') ten.position.set(Wm/2, legThk + tLen/2, Hm - apronDrop - apronH/2);
    if (face==='S') ten.position.set(Wm/2, Dm - (legThk + tLen/2), Hm - apronDrop - apronH/2);
    ten.material = matTen; tenons.push(ten);
  });

  // Build CSG meshes
  const topMesh   = useMemo(()=> topWithCuts([Wm,Dm,topThk], topCutters), [Wm,Dm,topThk,topCutters.length]);
  const legMeshes = useMemo(()=> (['leg-fl','leg-fr','leg-br','leg-bl'] as const).map(k=> legWithMortises([legThk,legThk,Hm-topThk], legCutters[k])), [Hm,topThk,legThk,legCutters]);

  topMesh.material = matTop;
  legMeshes.forEach(m=> m.material = matLeg);

  // Positions
  topMesh.position.set(Wm/2, Dm/2, Hm - topThk/2);
  legMeshes[0].position.set(...(legsPos['leg-fl']));
  legMeshes[1].position.set(...(legsPos['leg-fr']));
  legMeshes[2].position.set(...(legsPos['leg-br']));
  legMeshes[3].position.set(...(legsPos['leg-bl']));

  const apronZ = Hm - apronDrop - apronH/2;

  return (
    <group>
      <primitive object={topMesh}/>
      {legMeshes.map((m,i)=><primitive key={i} object={m}/>)}

      {/* simple aprons (no cuts) */}
      <RoundedBox args={[Wm-2*legThk, legThk, apronH]} radius={0.008} smoothness={3} position={[Wm/2, legThk/2, apronZ]}>
        <meshStandardMaterial color="#D0BEA1" roughness={0.58} metalness={0.05}/>
      </RoundedBox>
      <RoundedBox args={[legThk, Dm-2*legThk, apronH]} radius={0.008} smoothness={3} position={[Wm - legThk/2, Dm/2, apronZ]}>
        <meshStandardMaterial color="#CFBEA2" roughness={0.6} metalness={0.05}/>
      </RoundedBox>

      {/* visible tenons */}
      {tenons.map((t,i)=><primitive key={'ten'+i} object={t}/>)}
    </group>
  );
}

function SnapshotButton(){
  const onClick=()=>{ const c=document.querySelector('canvas[data-3d="true"]') as HTMLCanvasElement|null; if(!c)return; const a=document.createElement('a'); a.href=c.toDataURL('image/png'); a.download='preview-csg.png'; a.click(); };
  return <button onClick={onClick} style={{marginBottom:8,padding:'8px 12px',border:'1px solid #ccc',borderRadius:8}}>Download PNG</button>;
}

export default function FurniturePreview3DCSG({ spec, joins }:{ spec:Spec; joins:Join[] }){
  const { W, D, H } = toMM(spec); const Wm=mm2m(W), Dm=mm2m(D), Hm=mm2m(H);
  const cam:[number,number,number]=[Math.max(1.4,Wm*0.9), Math.max(1.1,Dm*0.9), Math.max(1.4,Math.max(Wm,Dm)*1.1)];
  const target:[number,number,number]=[Wm/2, Dm/2, Hm*0.5];

  return (
    <div style={{border:'1px solid #eee',borderRadius:12,padding:12}}>
      <SnapshotButton/>
      <Canvas data-3d shadows gl={{ antialias:true, preserveDrawingBuffer:true }} camera={{ position: cam, fov:35 }}
        onCreated={({gl})=>{
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          // @ts-ignore
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.physicallyCorrectLights = true;
        }}
        dpr={[1,2]} style={{ width:'100%', height:460, borderRadius:10, touchAction:'none', cursor:'grab' }}
      >
        <color attach="background" args={['#EFF3F8']} />
        <Environment preset="city" />
        <AccumulativeShadows frames={90} temporal alphaTest={0.9} scale={12} color="#000" opacity={0.65} position={[0,0,0]}>
          <RandomizedLight amount={10} radius={1.3} intensity={1.0} ambient={0.45} position={[2.5,3.5,3.5]} />
          <RandomizedLight amount={8} radius={1.6} intensity={0.5} ambient={0.2} position={[-3.5,2.0,1.0]} />
        </AccumulativeShadows>
        <ModelCSG spec={spec} joins={joins}/>
        <OrbitControls makeDefault target={target} enablePan={false} enableDamping dampingFactor={0.08}/>
      </Canvas>
    </div>
  );
}
