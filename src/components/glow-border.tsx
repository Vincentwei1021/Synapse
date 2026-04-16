"use client";

import { useEffect, useRef, useState } from "react";

interface GlowBorderProps {
  active: boolean;
  primaryColor: string;
  lightColor: string;
  className?: string;
  children: React.ReactNode;
}

export function GlowBorder({ active, primaryColor, lightColor, className, children }: GlowBorderProps) {
  const [phase, setPhase] = useState<"idle" | "running" | "accelerate" | "flash" | "fadeout">("idle");
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      setPhase("running");
    } else if (!active && prevActive.current) {
      setPhase("accelerate");
      const t1 = setTimeout(() => setPhase("flash"), 500);
      const t2 = setTimeout(() => setPhase("fadeout"), 800);
      const t3 = setTimeout(() => setPhase("idle"), 1500);
      prevActive.current = active;
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    } else if (active) {
      setPhase("running");
    }
    prevActive.current = active;
  }, [active]);

  if (phase === "idle") {
    return <div className={className}>{children}</div>;
  }

  const animationDuration = phase === "accelerate" ? "0.5s" : "3s";
  const ringOpacity = phase === "fadeout" ? 0 : phase === "flash" ? 1 : 0.85;

  return (
    <div className={`relative ${className ?? ""}`}>
      {/* Glow ring */}
      <div
        className="absolute -inset-[2px] rounded-[18px] transition-opacity"
        style={{
          background: phase === "flash"
            ? `conic-gradient(from 0deg, ${primaryColor}, ${lightColor}, ${primaryColor})`
            : `conic-gradient(from var(--glow-angle), transparent 60%, ${primaryColor} 80%, ${lightColor} 90%, transparent 100%)`,
          opacity: ringOpacity,
          animation: phase === "flash" || phase === "fadeout"
            ? "none"
            : `glow-spin ${animationDuration} linear infinite`,
          transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
        }}
      />
      {/* Content */}
      <div className="relative">{children}</div>
    </div>
  );
}
