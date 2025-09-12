'use client';

import * as THREE from 'three';
import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  Environment,
  OrbitControls,
  RoundedBox,
  AccumulativeShadows,
  RandomizedLight,
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, SMAA } from '@react-three/postprocessing';

type Units = 'mm'|'in';
type Spec = {
  units: Units;
  assembly: { type: string; overall: { W:number; D:number; H:number } };
  bench?: { slats?: number; slatThickness?: number; gap?: number };
};

type WoodTex = { map?: string; roughnessMap?: string; normalMap?: string };

function toMM(spec: Spec) {
  const o = spec.assembly.overall;
  if ((spec.units || 'mm').toLowerCase() === 'in') {
    return { W: o.W * 25.4, D: o.D * 25.4, H: o.H * 25.4, units: 'mm' as const };
  }
  return { W: o.W, D: o.D, H: o.H, units: 'mm' as const };
}

function mmToMeters(mm: number) { return mm * 0.001; }

/** Heuristic furniture proportions (nice defaults) */
function derive(spec: Spec, Wm:number, Dm:number, Hm:number) {
  const topThk = THREE.MathUtils.clamp(Hm * 0.05, 0.018, 0.04); // 18–40mm
  const legThk = THREE.MathUtils.clamp(Math.min(Wm, Dm) * 0.07, 0.04, 0.07);
  const apronH = THREE.MathUtils.clamp(Hm * 0.18, 0.07, 0.11);
  const apronDrop = THREE.MathUtils.clamp(topThk + 0.02, 0.08, 0.14);
  const isBench = /\bbench\b/i.test(spec.assembly.type);

  const slats = spec.bench?.slats ?? (isBench ? 8 : 0);
  const slatT = mmToMeters((spec.bench?.slatThickness ?? 18));
  const gap   = mmToMeters((spec.bench?.gap ?? 6));

  return { topThk, legThk, apronH, apronDrop, isBench, slats, slatT, gap };
}

function useWoodMaterial(_wood?: WoodTex, fallbackColor = '#D6C4A9', rough = 0.5) {
  return useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(fallbackColor),
      roughness: rough,
      metalness: 0.05,
    });
  }, [fallbackColor, rough]);
}

function Model({ spec, woodTop, woodLeg }: { spec: Spec; woodTop?: WoodTex; woodLeg?: WoodTex }) {
  const { W, D, H } = toMM(spec);
  const Wm = mmToMeters(W), Dm = mmToMeters(D), Hm = mmToMeters(H);
  const { topThk, legThk, apronH, apronDrop, isBench, slats, slatT, gap } = derive(spec, Wm, Dm, Hm);

  const matTop = useWoodMaterial(woodTop, '#DCC9A6', 0.45);
  const matLeg = useWoodMaterial(woodLeg, '#CFBEA2', 0.6);
  const matApr = useWoodMaterial(woodLeg, '#D0BEA1', 0.58);
  const matSlat = useWoodMaterial(woodTop, '#E2D5BD', 0.45);

  // Top
  const topPos: [number, number, number] = [Wm / 2, Dm / 2, Hm - topThk / 2];

  // Legs (four corners)
  const legZ = (Hm - topThk) / 2;
  const legPositions: [number, number, number][] = [
    [legThk / 2, legThk / 2, legZ],
    [Wm - legThk / 2, legThk / 2, legZ],
    [Wm - legThk / 2, Dm - legThk / 2, legZ],
    [legThk / 2, Dm - legThk / 2, legZ]
  ];

  const apronZ = Hm - apronDrop - apronH / 2;

  return (
    <group>
      {/* Top with rounded edges */}
      <RoundedBox args={[Wm, Dm, topThk]} radius={Math.min(0.02, topThk * 0.3)} smoothness={4} castShadow receiveShadow position={topPos}>
        <primitive object={matTop} attach="material" />
      </RoundedBox>

      {/* Optional bench slats */}
      {isBench && slats > 0 && (
        <group>
          {Array.from({ length: slats }).map((_, i) => {
            const total = slats * slatT + (slats - 1) * gap;
            const startY = (Dm - total) / 2 + slatT / 2;
            const y = startY + i * (slatT + gap);
            return (
              <RoundedBox
                key={i}
                args={[Wm - 2 * legThk, slatT, slatT]}
                radius={Math.min(0.006, slatT * 0.3)}
                smoothness={3}
                castShadow
                receiveShadow
                position={[Wm / 2, y, Hm - topThk - 0.006]}
              >
                <primitive object={matSlat} attach="material" />
              </RoundedBox>
            );
          })}
        </group>
      )}

      {/* Legs */}
      {legPositions.map((p, i) => (
        <RoundedBox key={i} args={[legThk, legThk, Hm - topThk]} radius={Math.min(0.01, legThk * 0.2)} smoothness={3} castShadow receiveShadow position={p}>
          <primitive object={matLeg} attach="material" />
        </RoundedBox>
      ))}

      {/* Aprons: front & right (simple model) */}
      <RoundedBox
        args={[Wm - 2 * legThk, legThk, apronH]}
        radius={Math.min(0.008, legThk * 0.2)}
        smoothness={3}
        castShadow
        receiveShadow
        position={[Wm / 2, legThk / 2, apronZ]}
      >
        <primitive object={matApr} attach="material" />
      </RoundedBox>

      <RoundedBox
        args={[legThk, Dm - 2 * legThk, apronH]}
        radius={Math.min(0.008, legThk * 0.2)}
        smoothness={3}
        castShadow
        receiveShadow
        position={[Wm - legThk / 2, Dm / 2, apronZ]}
      >
        <primitive object={matApr} attach="material" />
      </RoundedBox>
    </group>
  );
}

function SnapshotButton() {
  const onClick = () => {
    const canvas = document.querySelector('canvas[data-3d="true"]') as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'preview.png';
    a.click();
  };
  return (
    <button onClick={onClick} style={{ marginBottom: 8, padding: '8px 12px', border: '1px solid #ccc', borderRadius: 8 }}>
      Download PNG
    </button>
  );
}

export default function FurniturePreview3DPro({ spec, woodTop, woodLeg }: { spec: Spec; woodTop?: WoodTex; woodLeg?: WoodTex }) {
  const { W, D } = toMM(spec);
  const Wm = mmToMeters(W), Dm = mmToMeters(D);
  const camPos: [number, number, number] = [
    Math.max(1.4, Wm * 0.9),
    Math.max(1.1, Dm * 0.9),
    Math.max(1.4, Math.max(Wm, Dm) * 1.1)
  ];

  return (
    <div style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
      <SnapshotButton />
      <Canvas
        data-3d
        shadows
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        camera={{ position: camPos, fov: 35 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          // @ts-expect-error three types: outputColorSpace differs across versions
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.physicallyCorrectLights = true;
        }}
        dpr={[1, 2]}
        style={{ width: '100%', height: 460, borderRadius: 10 }}
      >
        {/* Background & HDRI */}
        <color attach="background" args={['#F7FAFC']} />
        <Environment preset="apartment" />

        {/* Soft global shadow accumulation */}
        <AccumulativeShadows frames={80} temporal alphaTest={0.9} scale={10} color="black" opacity={0.6} position={[0, 0, 0]}>
          <RandomizedLight amount={8} radius={1} intensity={0.9} ambient={0.4} position={[2, 3, 3]} />
          <RandomizedLight amount={6} radius={1.5} intensity={0.4} ambient={0.2} position={[-3, 2, 1]} />
        </AccumulativeShadows>

        {/* Main model */}
        <group castShadow receiveShadow>
          <Model spec={spec} woodTop={woodTop} woodLeg={woodLeg} />
        </group>

        {/* Controls */}
        <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} />

        {/* Postprocessing for nicer highlights and edges */}
        <EffectComposer disableNormalPass>
          <SMAA />
          <Bloom intensity={0.25} mipmapBlur luminanceThreshold={0.2} luminanceSmoothing={0.3} />
          <Vignette eskil offset={0.1} darkness={0.9} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
