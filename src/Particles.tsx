import { useEffect, useRef } from "react";
import { rarities, type Rarity } from "../shared/rarity";
export function Particles({
  tier,
  enabled,
}: {
  tier: Rarity;
  enabled: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!enabled || rarities.indexOf(tier) < 2) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const low =
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const count = low <= 4 || navigator.hardwareConcurrency <= 4 ? 6 : 16;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, 400, 400);
      if (t > 1.1) return;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const d = 35 + t * 100;
        ctx.globalAlpha = Math.max(0, 1 - t);
        ctx.fillStyle =
          tier === "Harmony"
            ? `hsl(${(i / count) * 360} 65% 76%)`
            : tier === "Legendary"
              ? "#eac76e"
              : "#b5a2dc";
        ctx.font = "16px sans-serif";
        ctx.fillText("✧", 200 + Math.cos(a) * d, 200 + Math.sin(a) * d);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [tier, enabled]);
  return (
    <canvas
      ref={ref}
      width="400"
      height="400"
      className="reveal-particles"
      aria-hidden="true"
    />
  );
}
