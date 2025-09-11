'use client';

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, ContactShadows, OrbitControls } from '@react-three/drei';

type Units = 'mm'|'in';
type Spec = {
  units: Units;
  assembly: { type: string; overall: { W:number; D:number; H:number } };
  // optional bench hints
  bench?: { slats?: number; slatThickness?: number; gap?: number };
};

/** Convert inches to mm if needed, then mm -> meters (Three units). */
function useDimsMeters(spec: Spec) {
  return useMemo(() => {
    let { W, D, H } = spec.assembly.overall;
    if ((spec.units || 'mm') === 'in') {
      W *= 25.4; D *= 25.4; H *= 25.4;  // in -> mm
    }
    const mm2m = (v:number)=> v * 0.001;  // mm -> m
    return { Wm:mm2m(W), Dm:mm2m(D), Hm:mm2m(H) };
  }, [spec]);
}

/** Simple heuristics for furniture proportions (adjust as you like) */
function deriveParams(spec: Spec, Wm:number, Dm:number, Hm:number) {
  const topThk = Math.min(0.04, Math.max(0.018, Hm*0.05));      // 18–40 mm
  const legThk = Math.min(0.07, Math.max(0.04, Math.min(Wm,Dm)*0.07));
  const apronH = Math.min(0.11, Math.max(0.07, Hm*0.18));
  const apronDrop = Math.min(0.14, Math.max(0.08, topThk + 0.02)); // m
  const isBench = /\bbench\b/i.test(spec.assembly.type);

  // Bench slats
  const slats = spec.bench?.slats ?? (isBench ? 8 : 0);
  const slatT = (spec.bench?.slatThickness ?? 18) * 0.001; // meters
  const gap   = (spec.bench?.gap ?? 6) * 0.001;

  return { topThk, legThk, apronH, apronDrop, isBench, slats, slatT, gap };
}

function Wood({ color="#D6C4A9", rough=0.55 }) {
  return <meshPhysicalMaterial color={color} roughness={rough} metalness={0} />;
}

function TableMeshes({ spec }:{ spec: Spec }) {
  const { Wm, Dm, Hm } = useDimsMeters(spec);
  const { topThk, legThk, apronH, apronDrop, isBench, slats, slatT, gap } = deriveParams(spec, Wm, Dm, Hm);

  // Top center at (W/2, D/2), Z at H - topThk/2
  const topPos:[number,number,number] = [ Wm/2, Dm/2, Hm - topThk/2 ];

  // Legs (four corners)
  const legZ = (Hm - topThk)/2;
  const legPositions:[number,number,number][] = [
    [legThk/2,       legThk/2,        legZ],
    [Wm-legThk/2,    legThk/2,        legZ],
    [Wm-legThk/2,    Dm-legThk/2,     legZ],
    [legThk/2,       Dm-legThk/2,     legZ],
  ];

  // Aprons: one on front (Y≈0), one on right (X≈W), etc.
  const apronZ = Hm - apronDrop - apronH/2;
  const frontApron = {
    pos: [ Wm/2, legThk/2, apronZ ] as [number,number,number],
    size:[ Wm - 2*legThk, legThk, apronH ] as [number,number,number]
  };
  const rightApron = {
    pos: [ Wm - legThk/2, Dm/2, apronZ ] as [number,number,number],
    size:[ legThk, Dm - 2*legThk, apronH ] as [number,number,number]
  };

  return (
    <group>
      {/* Top */}
      <mesh position={topPos}>
        <boxGeometry args={[Wm, Dm, topThk]} />
        <Wood color="#DCC9A6" rough={0.5}/>
      </mesh>

      {/* Bench slats (optional) */}
      {isBench && slats > 0 && (
        <group position={[0,0,0]}>
          {Array.from({length: slats}).map((_,i)=>{
            // Fill D with slats + gaps centered
            const totalT = slatT*slats + gap*(slats-1);
            const startY = (Dm - totalT)/2 + slatT/2;
            const y = startY + i*(slatT+gap);
            return (
              <mesh key={i} position={[Wm/2, y, Hm - topThk - 0.005]}>
                <boxGeometry args={[Wm - 2*legThk, slatT, slatT]} />
                <Wood color="#E2D5BD" rough={0.45}/>
              </mesh>
            );
          })}
        </group>
      )}

      {/* Legs */}
      {legPositions.map((p,i)=>(
        <mesh key={i} position={p}>
          <boxGeometry args={[legThk, legThk, Hm - topThk]} />
          <Wood color="#CFBEA2" rough={0.6}/>
        </mesh>
      ))}

      {/* Aprons */}
      <mesh position={frontApron.pos}>
        <boxGeometry args={frontApron.size} />
        <Wood color="#D6C4A9" rough={0.58}/>
      </mesh>
      <mesh position={rightApron.pos}>
        <boxGeometry args={rightApron.size} />
        <Wood color="#D0BEA1" rough={0.6}/>
      </mesh>
    </group>
  );
}

function SnapshotButton() {
  // grabs the <canvas> created by R3F and downloads a PNG
  const onClick = () => {
    const canvas = document.querySelector('canvas[data-3d="true"]') as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'preview.png';
    a.click();
  };
  return (
    <button onClick={onClick}
      style={{ marginBottom:8, padding:'8px 12px', border:'1px solid #ccc', borderRadius:8 }}>
      Download PNG
    </button>
  );
}

export default function FurniturePreview3D({ spec }:{ spec: Spec }) {
  const { Wm, Dm } = useDimsMeters(spec);
  // frame that fits the model in view
  const camPos:[number,number,number] = [ Math.max(1.2, Wm*0.8), Math.max(1.0, Dm*0.8), Math.max(1.2, Math.max(Wm,Dm)*0.9) ];

  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, padding:12 }}>
      <SnapshotButton />
      <Canvas
        data-3d
        gl={{ preserveDrawingBuffer: true }}   // enables PNG snapshot
        camera={{ position: camPos, fov: 35 }}
        style={{ width: '100%', height: 420, borderRadius: 10 }}
      >
        {/* Background & lighting */}
        <color attach="background" args={['#F7FAFC']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[3,3,4]} intensity={0.7} />

        {/* Studio HDRI (free preset in drei) */}
        <Environment preset="studio" />

        {/* Model */}
        <TableMeshes spec={spec} />

        {/* Soft contact shadow under the model */}
        <ContactShadows position={[0,0,0]} opacity={0.35} blur={2.5} scale={10} far={1.2} />

        {/* Controls */}
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
}

