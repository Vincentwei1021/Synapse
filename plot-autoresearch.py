#!/usr/bin/env python3
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import csv, re

rows = []
with open("autoresearch-results.tsv", "r") as f:
    for r in csv.reader(f, delimiter="\t"):
        if len(r) < 3:
            continue
        try:
            val_bpb = float(r[2].strip())
        except ValueError:
            continue
        rows.append((int(r[0]), r[1].strip(), val_bpb))

seqs = [r[0] for r in rows]
titles = [r[1] for r in rows]
vals = [r[2] for r in rows]

# Running best
running_best, best, kept_mask = [], float("inf"), []
for v in vals:
    if v < best:
        best = v
        kept_mask.append(True)
    else:
        kept_mask.append(False)
    running_best.append(best)

kept_count = sum(kept_mask)

# Karpathy original baseline (unmodified train.py)
KARPATHY_BASELINE = 0.99618

def short_label(title):
    t = title
    for pat in [r"\(.*?\)", r"—.*", r"test\s+", r"try\s+", r"explore\s+"]:
        t = re.sub(pat, "", t, flags=re.IGNORECASE)
    t = t.strip().rstrip(",").strip()
    if len(t) > 35:
        t = t[:32] + "..."
    return t

fig, ax = plt.subplots(figsize=(16, 7))

# Karpathy baseline horizontal line
ax.axhline(y=KARPATHY_BASELINE, color="#E74C3C", linewidth=1.5, linestyle="--", alpha=0.7,
           label=f"Karpathy baseline ({KARPATHY_BASELINE:.5f})", zorder=1)

# Discarded (gray dots, cap outliers)
dx = [seqs[i] for i in range(len(seqs)) if not kept_mask[i] and vals[i] < 1.005]
dy = [vals[i] for i in range(len(vals)) if not kept_mask[i] and vals[i] < 1.005]
ax.scatter(dx, dy, c="#C0C0C0", s=35, alpha=0.5, zorder=2, label="Discarded")

# Kept (green dots)
kx = [seqs[i] for i in range(len(seqs)) if kept_mask[i]]
ky = [vals[i] for i in range(len(vals)) if kept_mask[i]]
ax.scatter(kx, ky, c="#2ECC71", s=70, zorder=4, edgecolors="white", linewidths=0.5, label="Kept")

# Running best step line
ax.step(seqs, running_best, where="post", c="#2ECC71", linewidth=2, alpha=0.7, zorder=3, label="Running best")

final_best = running_best[-1]

ax.set_xlabel("Experiment #", fontsize=11)
ax.set_ylabel("Validation BPB (lower is better)", fontsize=11)
ax.set_title(f"Autoresearch Progress: {len(rows)} Experiments, {kept_count} Kept Improvements",
             fontsize=13, fontweight="bold")
ax.legend(loc="upper right", fontsize=9)
ax.grid(True, alpha=0.15)
ax.set_ylim(min(vals) - 0.001, 1.005)
ax.set_xlim(-1, max(seqs) + 2)
plt.tight_layout()
plt.savefig("autoresearch-progress.png", dpi=100)
print(f"Done: {len(rows)} exps, {kept_count} kept, baseline={KARPATHY_BASELINE}, best={final_best:.6f}")
