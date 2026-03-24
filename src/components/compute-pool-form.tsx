"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function ComputePoolForm() {
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
      setError("Could not create the compute pool.");
      return;
    }

    router.refresh();
  }

  return (
    <form
      action={(formData) => startTransition(() => handleSubmit(formData))}
      className="space-y-3 rounded-[28px] border border-[#E5DED3] bg-white p-5"
    >
      <div>
        <p className="text-sm font-semibold text-[#2C2C2C]">Create compute pool</p>
        <p className="text-xs text-[#8E8478]">Group EC2 machines into a schedulable research capacity pool.</p>
      </div>
      <input
        name="name"
        required
        placeholder="Pool name"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Optional description"
        className="w-full rounded-2xl border border-[#E6DED2] bg-[#FBF8F3] px-3 py-2 text-sm text-[#2C2C2C] outline-none placeholder:text-[#A49B90]"
      />
      {error ? <p className="text-xs text-[#B94C4C]">{error}</p> : null}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-[#C67A52] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#B56A42] disabled:opacity-60"
      >
        {isPending ? "Creating..." : "Create pool"}
      </button>
    </form>
  );
}
