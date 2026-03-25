"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

export function ComputePoolForm() {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    const payload = {
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
    };

    const response = await fetch("/api/compute-pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setError(t("compute.pool.poolError"));
      return;
    }

    router.refresh();
  }

  return (
    <form
      action={(formData) => startTransition(() => { void handleSubmit(formData); })}
      className="space-y-4 rounded-[28px] border border-[#E7DECF] bg-white p-6 shadow-sm"
    >
      <div className="space-y-1">
        <p className="text-base font-semibold text-[#2C2C2C]">{t("compute.pool.title")}</p>
        <p className="text-sm leading-6 text-[#7E7469]">{t("compute.pool.description")}</p>
      </div>

      <input
        name="name"
        required
        placeholder={t("compute.pool.namePlaceholder")}
        className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />
      <textarea
        name="description"
        rows={3}
        placeholder={t("compute.pool.descriptionPlaceholder")}
        className="w-full rounded-2xl border border-[#E7DECF] bg-[#FBF8F3] px-3 py-2.5 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />

      {error ? <p className="text-sm text-[#B94C4C]">{error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-[#2F7D5D] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#27674d] disabled:opacity-60"
      >
        {isPending ? t("compute.pool.creating") : t("compute.pool.submit")}
      </button>
    </form>
  );
}
