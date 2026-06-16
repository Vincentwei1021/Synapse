"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Fullscreen white-background brand intro that plays the Synapse logo
 * animation once, then fades out. Shown after login success / onboarding
 * completion. The trigger is a one-shot sessionStorage flag set by the
 * auth flows (see BRAND_SPLASH_FLAG) and read by the dashboard layout.
 *
 * Honors prefers-reduced-motion (skips straight to onDone), is dismissible
 * by click or the Skip button, and always resolves via onDone so it can
 * never trap the user on the splash.
 */
export const BRAND_SPLASH_FLAG = "synapse_brand_splash";

const VIDEO_SRC = "/synapse-logo-animation.mp4";
const FADE_MS = 450;
// Safety cap: if the video stalls or never fires `ended`, leave anyway.
const MAX_VISIBLE_MS = 6000;

export function BrandSplash({ onDone }: { onDone: () => void }) {
  const t = useTranslations("splash");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    window.setTimeout(onDone, FADE_MS);
  }, [onDone]);

  useEffect(() => {
    // Reduced-motion users skip the animation entirely.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    const safety = window.setTimeout(finish, MAX_VISIBLE_MS);
    // Attempt autoplay. Only a genuine autoplay-policy block (NotAllowedError)
    // should skip the intro; an AbortError just means the play was interrupted
    // (e.g. a transient re-render) and must NOT dismiss the splash.
    videoRef.current?.play().catch((err: DOMException) => {
      if (err?.name === "NotAllowedError") finish();
    });
    return () => window.clearTimeout(safety);
  }, [finish, onDone]);

  return (
    <div
      role="presentation"
      onClick={finish}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-white transition-opacity duration-[450ms] ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        autoPlay
        onEnded={finish}
        className="max-h-[44vh] w-auto max-w-[min(420px,70vw)] object-contain"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute bottom-8 right-8 rounded-full border border-neutral-200 bg-white/80 px-4 py-1.5 text-sm text-neutral-500 backdrop-blur transition-colors hover:text-neutral-800"
      >
        {t("skip")}
      </button>
    </div>
  );
}
