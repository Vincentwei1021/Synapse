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
  const [phase, setPhase] = useState<"idle" | "breathing" | "flash" | "fadeout">("idle");
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) {
      setPhase("breathing");
    } else if (!active && prevActive.current) {
      setPhase("flash");
      const t1 = setTimeout(() => setPhase("fadeout"), 600);
      const t2 = setTimeout(() => setPhase("idle"), 1300);
      prevActive.current = active;
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (active) {
      setPhase("breathing");
    }
    prevActive.current = active;
  }, [active]);

  if (phase === "idle") {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`relative rounded-2xl transition-shadow ${className ?? ""}`}
      style={{
        boxShadow: phase === "flash"
          ? `0 0 16px 4px ${lightColor}, 0 0 4px 1px ${primaryColor}`
          : phase === "fadeout"
            ? "none"
            : undefined,
        animation: phase === "breathing"
          ? `glow-breathe 3s ease-in-out infinite`
          : "none",
        // CSS custom properties for the keyframe to reference
        "--glow-color": primaryColor,
        "--glow-light": lightColor,
        transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
      } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
