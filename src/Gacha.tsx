import { useRef, useState } from "react";
import type { Rarity } from "../shared/rarity";
export type Stage = "idle" | "spin" | "drop" | "reveal";
export function Gacha({
  stage,
  tier,
  onRoll,
  onSkip,
  fast,
}: {
  stage: Stage;
  tier: Rarity;
  onRoll: () => void;
  onSkip: () => void;
  fast: boolean;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [angle, setAngle] = useState(0);
  return (
    <section
      className={`gacha stage-${stage} tier-${tier} ${fast ? "gacha-fast" : ""}`}
      aria-label="Pony Gacha 扭蛋机"
    >
      <div className="machine-halo" />
      <span className="machine-star s1">✧</span>
      <span className="machine-star s2">✦</span>
      <div className="machine">
        <div className="machine-label">
          PONY GACHA<small>A LITTLE EQUESTRIAN MAGIC</small>
        </div>
        <div className="globe">
          <div className="glass-shine" />
          {Array.from({ length: 12 }, (_, i) => (
            <i
              key={i}
              className={`capsule c${i}`}
              style={
                {
                  "--i": i,
                  "--capsule": [
                    "#b8a0e4",
                    "#efadc9",
                    "#8cd4df",
                    "#f3cf84",
                    "#a4d4bd",
                  ][i % 5],
                } as React.CSSProperties
              }
            />
          ))}
          <span className="globe-star">✧</span>
        </div>
        <div className="machine-body">
          <span className="cutie">✦ ☾ ✧</span>
          <button
            className="knob"
            aria-label="转动马蹄旋钮"
            style={{ "--angle": `${angle}deg` } as React.CSSProperties}
            onClick={() => (stage === "idle" ? onRoll() : onSkip())}
            onPointerDown={(e) => {
              if (stage !== "idle") return;
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current)
                setAngle(
                  Math.min(
                    270,
                    Math.hypot(
                      e.clientX - drag.current.x,
                      e.clientY - drag.current.y,
                    ) * 3,
                  ),
                );
            }}
            onPointerUp={(e) => {
              if (drag.current && angle >= 100) {
                e.preventDefault();
                onRoll();
              }
              drag.current = null;
              setAngle(0);
            }}
            onPointerCancel={() => {
              drag.current = null;
              setAngle(0);
            }}
          >
            ♧<span>TURN</span>
          </button>
          <div className="chute">
            <i className="dropped-capsule">
              <b />
              <b />
            </i>
          </div>
        </div>
        <div className="machine-foot" />
      </div>
      <button
        className="roll machine-roll"
        onClick={() => (stage === "idle" ? onRoll() : onSkip())}
      >
        {stage === "idle" ? "开始抽取 · ROLL" : "跳过演出 · SKIP"}{" "}
        <span>→</span>
      </button>
      <small className="machine-note">免费无限抽取 · 点击或拖动旋钮</small>
    </section>
  );
}
export function sound(kind: "spin" | "drop" | Rarity) {
  try {
    const C = window.AudioContext;
    if (!C) return;
    const ctx = new C();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    const oscillator = ctx.createOscillator();
    oscillator.type = kind === "spin" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(
      kind === "spin"
        ? 180
        : kind === "drop"
          ? 260
          : kind === "Harmony"
            ? 880
            : kind === "Legendary"
              ? 660
              : 440,
      ctx.currentTime,
    );
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.3);
    oscillator.onended = () => void ctx.close();
  } catch {}
}
