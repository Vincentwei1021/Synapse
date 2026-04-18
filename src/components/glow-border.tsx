"use client";

import { useEffect, useRef, useState } from "react";

interface GlowBorderProps {
  active: boolean;
  primaryColor: string;
  lightColor: string;
  variant?: "spin" | "pulse";
  className?: string;
  children: React.ReactNode;
}

export function GlowBorder({ active, primaryColor, lightColor, variant = "spin", className, children }: GlowBorderProps) {
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
    return <div className={`rounded-[18px] ${className ?? ""}`}>{children}</div>;
  }

  if (variant === "pulse") {
    return (
      <div
        className={`relative rounded-2xl transition-shadow ${className ?? ""}`}
        style={{
          boxShadow: phase === "flash"
            ? `0 0 16px 4px ${lightColor}, 0 0 4px 1px ${primaryColor}`
            : phase === "fadeout"
              ? "none"
              : undefined,
          animation: phase === "running" || phase === "accelerate"
            ? `glow-breathe 3s ease-in-out infinite`
            : "none",
          "--glow-color": primaryColor,
          "--glow-light": lightColor,
          transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
        } as React.CSSProperties}
      >
        {children}
      </div>
    );
  }

  const animationDuration = phase === "accelerate" ? "0.5s" : "2.5s";
  const isActive = phase === "running" || phase === "accelerate";
  const ringOpacity = phase === "fadeout" ? 0 : 1;

  return (
    <div
      className={`relative rounded-[18px] ${className ?? ""}`}
      style={{
        boxShadow: isActive
          ? `0 0 10px 1px ${primaryColor}26`
          : phase === "flash"
            ? `0 0 14px 3px ${lightColor}`
            : "none",
        transition: "box-shadow 0.3s ease",
      }}
      >
      {/* Static base ring kept outside the card so opaque children do not hide it. */}
      <div
        className="pointer-events-none absolute -inset-[2px] rounded-[18px] transition-opacity"
        style={{
          border: `1px solid ${primaryColor}42`,
          opacity: phase === "fadeout" ? 0 : isActive ? 1 : 0,
          transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
        }}
      />
      {/* Spinning highlight — conic-gradient angle animated via @property, masked to border ring */}
      <div
        className="pointer-events-none absolute -inset-[2px] rounded-[18px] transition-opacity"
        style={{
          background: phase === "flash"
            ? `conic-gradient(from 0deg, ${primaryColor}, ${lightColor}, ${primaryColor})`
            : `conic-gradient(from var(--glow-angle), transparent 30%, ${primaryColor} 60%, ${lightColor} 80%, ${primaryColor} 90%, transparent 100%)`,
          opacity: ringOpacity,
          animation: phase === "flash" || phase === "fadeout"
            ? "none"
            : `glow-rotate ${animationDuration} linear infinite`,
          transitionDuration: phase === "fadeout" ? "700ms" : "200ms",
          padding: "2px",
          WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
        } as React.CSSProperties}
      />
      <div className="relative h-full rounded-[18px]">{children}</div>
    </div>
  );
}
