"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import {
  autoLoopShaderPalette,
  type AutoLoopShaderMode,
} from "./auto-loop-shader-palette";

const MeshGradient = dynamic(
  () => import("@paper-design/shaders-react").then((m) => m.MeshGradient),
  { ssr: false, loading: () => null },
);

interface AutoLoopShaderBgProps {
  mode: AutoLoopShaderMode;
  className?: string;
}

class ShaderErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Swallow — fallback is the parent pill's static emerald tint.
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function AutoLoopShaderBg({ mode, className }: AutoLoopShaderBgProps) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  const colors = autoLoopShaderPalette(mode);

  return (
    <ShaderErrorBoundary>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden rounded-lg opacity-60 dark:opacity-80 ${className ?? ""}`.trim()}
      >
        <MeshGradient
          colors={[...colors]}
          speed={0.25}
          distortion={0.6}
          swirl={0.4}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </ShaderErrorBoundary>
  );
}

export default AutoLoopShaderBg;
