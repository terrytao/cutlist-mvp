'use client';

import * as THREE from 'three';
import React, { useMemo, useEffect, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

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

function Model({ spec, woodTop, woodLeg, palette }: { spec: Spec; woodTop?: WoodTex; woodLeg?: WoodTex; palette?: { top?: string; leg?: string; apron?: string; slat?: string } }) {
  const { W, D, H } = toMM(spec);
  const safe = (n: number, def: number) => (Number.isFinite(n) && n > 0 ? n : def);
  const Wm = safe(mmToMeters(W), 0.6), Dm = safe(mmToMeters(D), 0.6), Hm = safe(mmToMeters(H), 0.45);
  const params = derive(spec, Wm, Dm, Hm);
  const topThk = safe(params.topThk, 0.02);
  const legThk = safe(params.legThk, 0.05);
  const apronH  = safe(params.apronH, 0.09);
  const apronDrop = safe(params.apronDrop, 0.10);
  const isBench = params.isBench;
  const slatCount = Number.isFinite(params.slats) ? Math.max(0, Math.floor(params.slats as number)) : 0;
  const slatT = safe(params.slatT, 0.018);
  const gap = safe(params.gap, 0.006);

  const matTop = useWoodMaterial(woodTop, palette?.top || '#DCC9A6', 0.45);
  const matLeg = useWoodMaterial(woodLeg, palette?.leg || '#CFBEA2', 0.6);
  const matApr = useWoodMaterial(woodLeg, palette?.apron || '#D0BEA1', 0.58);
  const matSlat = useWoodMaterial(woodTop, palette?.slat || '#E2D5BD', 0.45);

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
      {/* Top */}
      <mesh position={topPos} castShadow receiveShadow>
        <boxGeometry args={[Wm, Dm, topThk]} />
        <primitive object={matTop} attach="material" />
      </mesh>

      {/* Optional bench slats */}
      {isBench && slatCount > 0 && (
        <group>
          {Array.from({ length: slatCount }).map((_, i) => {
            const total = slatCount * slatT + (slatCount - 1) * gap;
            const startY = (Dm - total) / 2 + slatT / 2;
            const y = startY + i * (slatT + gap);
            return (
              <mesh key={i} position={[Wm / 2, y, Hm - topThk - 0.006]} castShadow receiveShadow>
                <boxGeometry args={[Wm - 2 * legThk, slatT, slatT]} />
                <primitive object={matSlat} attach="material" />
              </mesh>
            );
          })}
        </group>
      )}

      {/* Legs */}
      {legPositions.map((p, i) => (
        <mesh key={i} position={p} castShadow receiveShadow>
          <boxGeometry args={[legThk, legThk, Hm - topThk]} />
          <primitive object={matLeg} attach="material" />
        </mesh>
      ))}

      {/* Aprons: front & right */}
      <mesh position={[Wm / 2, legThk / 2, apronZ]} castShadow receiveShadow>
        <boxGeometry args={[Wm - 2 * legThk, legThk, apronH]} />
        <primitive object={matApr} attach="material" />
      </mesh>
      <mesh position={[Wm - legThk / 2, Dm / 2, apronZ]} castShadow receiveShadow>
        <boxGeometry args={[legThk, Dm - 2 * legThk, apronH]} />
        <primitive object={matApr} attach="material" />
      </mesh>
    </group>
  );
}

// Snapshot button removed to avoid unused warning; see FurniturePreview3D for PNG download.

export default function FurniturePreview3DPro({ spec, woodTop, woodLeg, enableEffects = true, palette, onError }: { spec: Spec; woodTop?: WoodTex; woodLeg?: WoodTex; enableEffects?: boolean; palette?: { top?: string; leg?: string; apron?: string; slat?: string }; onError?: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [effectsOn, setEffectsOn] = useState(enableEffects);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setEffectsOn(enableEffects); }, [enableEffects]);
  const { W, D, H } = toMM(spec);
  const validDims = [W, D, H].every(v => typeof v === 'number' && Number.isFinite(v) && v > 0);
  // Remount Canvas when spec dimensions/type change to ensure a clean GL context
  const specKey = `${W}|${D}|${H}|${spec.assembly.type||''}`;
  useEffect(() => { setCanvasKey(k => k + 1); }, [specKey]);
  if (!mounted) return null;
  if (!validDims) return <div style={{ padding: 12, fontSize: 12, color: '#666' }}>Invalid dimensions in spec</div>;
  const Wm = mmToMeters(W), Dm = mmToMeters(D);
  // WebGL availability guard
  const webglOK = (() => { try { const c=document.createElement('canvas'); return !!(c.getContext('webgl')||c.getContext('experimental-webgl')); } catch { return false; } })();
  if (!webglOK) return <div style={{ padding: 12, fontSize: 12, color: '#666' }}>WebGL not available in this browser.</div>;
  const camPos: [number, number, number] = [
    Math.max(1.4, Wm * 0.9),
    Math.max(1.1, Dm * 0.9),
    Math.max(1.4, Math.max(Wm, Dm) * 1.1)
  ];

  const handleError = () => { setEffectsOn(false); setCanvasKey(k => k + 1); if (onError) onError(); };

  return (
    <div data-3d style={{ border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
      {/* <SnapshotButton /> */}
      <ErrorBoundary onError={handleError}>
      <Canvas
        key={canvasKey}
        gl={{ antialias: true }}
        camera={{ position: camPos, fov: 35 }}
        dpr={1}
        style={{ width: '100%', height: 440, borderRadius: 10 }}
      >
        <Suspense fallback={null}>
          {/* Background & simple lights (robust) */}
          <color attach="background" args={['#FFFFFF']} />
          <ambientLight intensity={0.5} />
          <directionalLight position={[3,3,4]} intensity={0.8} />

          {/* Main model */}
          <group castShadow receiveShadow>
            <Model spec={spec} woodTop={woodTop} woodLeg={woodLeg} palette={palette} />
          </group>

          {/* Controls */}
          <OrbitControls enablePan={false} enableDamping dampingFactor={0.08} />

          {/* Postprocessing for nicer highlights and edges */}
          {effectsOn && (
            <EffectComposer enableNormalPass={false}>
              <Bloom intensity={0.22} luminanceThreshold={0.2} luminanceSmoothing={0.3} />
              <Vignette eskil offset={0.1} darkness={0.9} />
            </EffectComposer>
          )}
        </Suspense>
      </Canvas>
      </ErrorBoundary>
    </div>
  );
}
class ErrorBoundary extends React.Component<{ children: React.ReactNode; onError?: () => void }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; onError?: () => void }){ super(props); this.state = { hasError:false }; }
  static getDerivedStateFromError(){ return { hasError:true }; }
  componentDidCatch(){ if (this.props.onError) this.props.onError(); }
  render(){ if (this.state.hasError) return <div style={{ padding:12, fontSize:12, color:'#b00020' }}>Preview failed to render.</div>; return this.props.children; }
}
