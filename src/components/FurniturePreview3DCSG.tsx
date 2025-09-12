// src/components/FurniturePreview3DCSG.tsx
'use client';

import * as THREE from 'three';
import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CSG } from 'three-csg-ts';

class ErrorBoundary extends React.Component<React.PropsWithChildren<object>, { hasError:boolean }>{
  constructor(props: React.PropsWithChildren<object>){ super(props); this.state={hasError:false}; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(){}
  render(){ if (this.state.hasError) return <div style={{ padding:12, fontSize:12, color:'#b00020' }}>Joinery preview failed to render.</div>; return this.props.children; }
}

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
  const matTop = stdMat('#DCC9A6', 0.45), matLeg = stdMat('#CFBEA2', 0.6), matTen = stdMat('#e7b0a8', 0.45);
  const legZ = (Hm - topThk)/2;
  const legsPos = {
    'leg-fl':[legThk/2,          legThk/2,        legZ] as [number,number,number],
    'leg-fr':[Wm - legThk/2,     legThk/2,        legZ],
    'leg-br':[Wm - legThk/2,     Dm - legThk/2,   legZ],
    'leg-bl':[legThk/2,          Dm - legThk/2,   legZ]
  };
  const apronZ = Hm - apronDrop - apronH/2;

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

  // Build CSG meshes (compute directly for simplicity)
  const topMesh = topWithCuts([Wm, Dm, topThk], topCutters);
  const legMeshes = (['leg-fl','leg-fr','leg-br','leg-bl'] as const).map(k =>
    legWithMortises([legThk, legThk, Hm - topThk], legCutters[k])
  );

  topMesh.material = matTop;
  legMeshes.forEach(m=> m.material = matLeg);

  // Positions
  topMesh.position.set(Wm/2, Dm/2, Hm - topThk/2);
  const lfl = legsPos['leg-fl'] as [number,number,number];
  const lfr = legsPos['leg-fr'] as [number,number,number];
  const lbr = legsPos['leg-br'] as [number,number,number];
  const lbl = legsPos['leg-bl'] as [number,number,number];
  legMeshes[0].position.set(lfl[0], lfl[1], lfl[2]);
  legMeshes[1].position.set(lfr[0], lfr[1], lfr[2]);
  legMeshes[2].position.set(lbr[0], lbr[1], lbr[2]);
  legMeshes[3].position.set(lbl[0], lbl[1], lbl[2]);

 

  return (
    <group>
      <primitive object={topMesh}/>
      {legMeshes.map((m,i)=><primitive key={i} object={m}/>)}

      {/* simple aprons */}
      <mesh position={[Wm/2, legThk/2, apronZ]}>
        <boxGeometry args={[Wm-2*legThk, legThk, apronH]} />
        <meshStandardMaterial color="#D0BEA1" roughness={0.58} metalness={0.05}/>
      </mesh>
      <mesh position={[Wm - legThk/2, Dm/2, apronZ]}>
        <boxGeometry args={[legThk, Dm-2*legThk, apronH]} />
        <meshStandardMaterial color="#CFBEA2" roughness={0.6} metalness={0.05}/>
      </mesh>

      {/* visible tenons */}
      {tenons.map((t,i)=><primitive key={'ten'+i} object={t}/>)}
    </group>
  );
}

// Snapshot button intentionally omitted; use the PNG button on the standard preview.

export default function FurniturePreview3DCSG({ spec, joins }:{ spec:Spec; joins:Join[] }){
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(()=> { setMounted(true); }, []);
  useEffect(()=> { if (mounted) requestAnimationFrame(()=> setReady(true)); }, [mounted]);
  const { W, D, H } = toMM(spec);
  const valid = [W,D,H].every(v => Number.isFinite(v) && v > 0);
  if (!mounted || !ready) return null;
  if (!valid) return <div style={{ padding: 12, fontSize: 12, color: '#666' }}>Invalid dimensions in spec</div>;
  const Wm=mm2m(W), Dm=mm2m(D), Hm=mm2m(H);
  const webglOK = (() => { try { const c=document.createElement('canvas'); return !!(c.getContext('webgl')||c.getContext('experimental-webgl')); } catch { return false; } })();
  if (!webglOK) return <div style={{ padding: 12, fontSize: 12, color: '#666' }}>WebGL not available in this browser.</div>;
  const cam:[number,number,number]=[Math.max(1.4,Wm*0.9), Math.max(1.1,Dm*0.9), Math.max(1.4,Math.max(Wm,Dm)*1.1)];
  const target:[number,number,number]=[Wm/2, Dm/2, Hm*0.5];

  return (
    <div data-3d style={{border:'1px solid #eee',borderRadius:12,padding:12}}>
      {/* <SnapshotButton/> */}
      <ErrorBoundary>
      <Canvas gl={{ antialias:true }} camera={{ position: cam, fov:35 }}
        dpr={1} style={{ width:'100%', height:440, borderRadius:10, touchAction:'none', cursor:'grab' }}
      >
        <color attach="background" args={['#FFFFFF']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3,3,4]} intensity={0.8} />
        <ModelCSG spec={spec} joins={joins}/>
        <OrbitControls makeDefault target={target} enablePan={false} enableDamping dampingFactor={0.08}/>
      </Canvas>
      </ErrorBoundary>
    </div>
  );
}
