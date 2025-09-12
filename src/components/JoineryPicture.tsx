'use client';

import React, { useRef, useState } from 'react';

type Spec = {
  units: 'mm'|'in';
  assembly: { type: string; overall: { W:number; D:number; H:number } };
};
type PlanJob = {
  type: 'RABBET'|'DADO'|'GROOVE';
  label?: string;
  axis?: 'X'|'Y';
  edge?: 'N'|'S'|'E'|'W';
  width: number;
  depth: number;
  offset?: number;
  host: { name:string; length:number; width:number; thickness:number };
};

function proj(x:number, y:number, z:number, ox:number, oy:number, s:number, k=0.4) {
  // Simple oblique projection: X right, Y back, Z up
  const X = ox + (x + k*y) * s;
  const Y = oy - z * s - (k*0.5) * y * s;
  return [X, Y] as const;
}
function poly(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<readonly [number, number]>) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}
function woodFill(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number) {
  const g = ctx.createLinearGradient(x, y, x+w, y+h);
  g.addColorStop(0, '#f4ede3'); g.addColorStop(1, '#e6dccd');
  ctx.fillStyle = g;
}

export default function JoineryPicture({ spec, jobs=[] }: { spec: Spec; jobs?: PlanJob[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  const render = () => {
    const c = ref.current; if (!c) return;
    setBusy(true);
    try {
      const ctx = c.getContext('2d')!;
      // normalize sizes
      const Wmm = Math.max(200, spec.assembly.overall.W);
      const Dmm = Math.max(200, spec.assembly.overall.D);
      const Hmm = Math.max(150, spec.assembly.overall.H);

      // Hi-DPI canvas
      const CW = 1280, CH = 720;
      const DPR = window.devicePixelRatio || 1;
      c.width = CW * DPR; c.height = CH * DPR;
      c.style.width = CW + 'px'; c.style.height = CH + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      // background
      const bg = ctx.createLinearGradient(0,0,0,CH);
      bg.addColorStop(0, '#f7fafc'); bg.addColorStop(1, '#e6eef7');
      ctx.fillStyle = bg; ctx.fillRect(0,0,CW,CH);

      // Scale & origin
      const s = Math.min((CW-440)/ (Wmm + Dmm*0.5), (CH-220) / (Hmm + Dmm*0.4));
      const ox = 180, oy = CH - 120;

      // ground shadow
      const shadow = ctx.createRadialGradient(520, CH - 120, 20, 520, CH - 120, 420);
      shadow.addColorStop(0, 'rgba(0,0,0,0.18)');
      shadow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadow;
      ctx.beginPath(); ctx.ellipse(520, CH - 110, 320, 60, 0, 0, Math.PI*2); ctx.fill();

      // proportions
      const topThk = Math.min(40, Math.max(18, Hmm*0.05));
      const legThk = Math.min(70, Math.max(40, Math.min(Wmm,Dmm)*0.07));
      const apronH = Math.min(110, Math.max(70, Hmm*0.18));
      const apronDrop = Math.min(140, Math.max(80, topThk + 20));

      // top quads
      const T = [
        proj(0,    0,    Hmm, ox, oy, s),
        proj(Wmm,  0,    Hmm, ox, oy, s),
        proj(Wmm,  Dmm,  Hmm, ox, oy, s),
        proj(0,    Dmm,  Hmm, ox, oy, s),
      ] as [number,number][];
      const B = [
        proj(0,    0,    Hmm-topThk, ox, oy, s),
        proj(Wmm,  0,    Hmm-topThk, ox, oy, s),
        proj(Wmm,  Dmm,  Hmm-topThk, ox, oy, s),
        proj(0,    Dmm,  Hmm-topThk, ox, oy, s),
      ] as [number,number][];

      // draw top
      woodFill(ctx, Math.min(...T.map(p=>p[0])), Math.min(...T.map(p=>p[1])), 10,10);
      poly(ctx, T); ctx.fill(); ctx.strokeStyle = '#a8b0b8'; ctx.lineWidth = 2; ctx.stroke();
      // bands
      ctx.fillStyle = '#e9dfd2'; ctx.strokeStyle = '#c8cfd6';
      poly(ctx, [T[1], T[2], B[2], B[1]]); ctx.fill(); ctx.stroke(); // right
      poly(ctx, [T[0], T[1], B[1], B[0]]); ctx.fill(); ctx.stroke(); // front

      // legs
      const legs = [
        [legThk,          legThk],
        [Wmm - legThk,    legThk],
        [Wmm - legThk,    Dmm - legThk],
        [legThk,          Dmm - legThk],
      ];
      for (const [lx,ly] of legs) {
        const top1 = proj(lx, ly, Hmm-topThk, ox, oy, s);
        const bot1 = proj(lx, ly, 0,          ox, oy, s);
        const top2 = proj(lx+legThk, ly, Hmm-topThk, ox, oy, s);
        const bot2 = proj(lx+legThk, ly, 0,          ox, oy, s);
        ctx.fillStyle = '#e7dccf'; ctx.strokeStyle='#c8cfd6';
        poly(ctx, [top1, top2, bot2, bot1]); ctx.fill(); ctx.stroke();
        // side shade
        const topS= proj(lx+legThk, ly+legThk*0.8, Hmm-topThk, ox, oy, s);
        const botS= proj(lx+legThk, ly+legThk*0.8, 0,          ox, oy, s);
        ctx.fillStyle = '#dbcfc0';
        poly(ctx, [top2, topS, botS, bot2]); ctx.fill(); ctx.stroke();
      }

      // aprons
      const apronZ = Hmm - apronDrop;
      // front
      {
        const a0 = proj(0,   0, apronZ,           ox, oy, s);
        const a1 = proj(Wmm, 0, apronZ,           ox, oy, s);
        const a2 = proj(Wmm, 0, apronZ - apronH,  ox, oy, s);
        const a3 = proj(0,   0, apronZ - apronH,  ox, oy, s);
        ctx.fillStyle = '#e8dfd3'; ctx.strokeStyle='#c8cfd6';
        poly(ctx, [a0,a1,a2,a3]); ctx.fill(); ctx.stroke();
      }
      // right
      {
        const b0 = proj(Wmm, 0,   apronZ,           ox, oy, s);
        const b1 = proj(Wmm, Dmm, apronZ,           ox, oy, s);
        const b2 = proj(Wmm, Dmm, apronZ - apronH,  ox, oy, s);
        const b3 = proj(Wmm, 0,   apronZ - apronH,  ox, oy, s);
        ctx.fillStyle = '#e5d9ca'; ctx.strokeStyle='#c8cfd6';
        poly(ctx, [b0,b1,b2,b3]); ctx.fill(); ctx.stroke();
      }

      // titles
      ctx.fillStyle = '#111';
      ctx.font = '700 22px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillText(`${spec.assembly.type} — ${Wmm}×${Dmm}×${Hmm} mm`, 40, 52);
      ctx.font = '600 14px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillStyle = '#394050';
      ctx.fillText('Joinery preview', 40, 74);

      // job annotations (optional)
      const annX = CW - 420, annY0 = 110;
      ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto';
      jobs.slice(0,7).forEach((j, i) => {
        const y = annY0 + i*20;
        const tag = j.type === 'RABBET' ? 'Rabbet' : j.type === 'DADO' ? 'Dado' : 'Groove';
        const detail = j.axis ? ` ${j.axis}` : j.edge ? ` ${j.edge}` : '';
        ctx.fillStyle = '#2563eb';
        ctx.fillText(`• ${tag}${detail}: w${Math.round(j.width)} d${Math.round(j.depth)} (mm)`, annX, y);
      });

      ctx.fillStyle = '#667085';
      ctx.font = '500 12px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto';
      ctx.fillText('Rendered from spec (free). No AI image generation used.', 24, CH - 16);

    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const c = ref.current; if (!c) return;
    c.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'prompt-picture.png';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    }, 'image/png', 0.92);
  };

  return (
    <div style={{ border:'1px solid #eee', borderRadius:12, padding:12 }}>
      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
        <button onClick={render} disabled={busy}
          style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #ccc', background:'#111', color:'#fff' }}>
          {busy ? 'Rendering…' : 'Render picture'}
        </button>
        <button onClick={download}
          style={{ padding:'8px 12px', borderRadius:10, border:'1px solid #ccc' }}>
          Download PNG
        </button>
      </div>
      <canvas ref={ref} style={{ width:'100%', height:'auto', display:'block' }} />
    </div>
  );
}
