/**
 * Seed demo data for Synapse screenshots.
 * Usage: node scripts/seed-demo.js
 * Requires: tunnel to Synapse at localhost:13000
 */

const BASE = "http://localhost:13000";
let cookies = "";

async function api(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { console.error(`  FAIL ${method} ${path}: non-JSON response (${res.status})`); return null; }
  if (!json.success && res.status >= 400) {
    console.error(`  FAIL ${method} ${path}:`, json.error?.message || json.error || res.status);
    return null;
  }
  return json.data || json;
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/default-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "dev@synapse.local", password: "synapse123" }),
  });
  const setCookie = res.headers.getSetCookie?.() || [];
  cookies = setCookie.map(c => c.split(";")[0]).join("; ");
  console.log("Logged in, cookies set");
}

async function createAgent(name, roles) {
  const data = await api("POST", "/api/agents", { name, roles });
  if (data?.uuid) console.log(`  Agent: ${name} (${data.uuid})`);
  return data;
}

async function createGroup(name, description) {
  const data = await api("POST", "/api/project-groups", { name, description });
  if (data?.uuid) console.log(`  Group: ${name} (${data.uuid})`);
  return data;
}

async function createProject(name, description, groupUuid, opts = {}) {
  const data = await api("POST", "/api/research-projects", {
    name, description, groupUuid,
    datasets: opts.datasets || [],
    evaluationMethods: opts.evaluationMethods || [],
    computePoolUuid: opts.computePoolUuid || undefined,
  });
  if (data?.uuid) console.log(`  Project: ${name} (${data.uuid})`);
  return data;
}

async function createQuestion(projectUuid, title, content, parentQuestionUuid) {
  const body = { title, content };
  if (parentQuestionUuid) body.parentQuestionUuid = parentQuestionUuid;
  const data = await api("POST", `/api/research-projects/${projectUuid}/research-questions`, body);
  if (data?.uuid) console.log(`    Question: ${title.substring(0, 40)}... (${data.uuid})`);
  return data;
}

async function createExperiment(projectUuid, title, description, opts = {}) {
  // Experiment endpoint requires multipart/form-data
  const form = new URLSearchParams();
  form.append("title", title);
  form.append("description", description);
  form.append("priority", opts.priority || "medium");
  if (opts.researchQuestionUuid) form.append("researchQuestionUuid", opts.researchQuestionUuid);
  if (opts.computeBudgetHours) form.append("computeBudgetHours", String(opts.computeBudgetHours));

  const res = await fetch(`${BASE}/api/research-projects/${projectUuid}/experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookies },
    body: form.toString(),
  });
  const json = await res.json();
  if (!json.success) {
    console.error(`  FAIL experiment: ${json.error?.message || res.status}`);
    return null;
  }
  const data = json.data?.experiment || json.data;
  if (data?.uuid) console.log(`    Experiment: ${title.substring(0, 40)}... (${data.uuid}) [${data.status}]`);
  return data;
}

async function transitionExperiment(uuid, targetStatus, extra = {}) {
  // Experiments created by users default to "pending_start"
  if (targetStatus === "pending_start") {
    // Already default, no-op
  } else if (targetStatus === "in_progress") {
    await api("POST", `/api/experiments/${uuid}/start`, { gpuUuids: [] });
  } else if (targetStatus === "completed") {
    await api("POST", `/api/experiments/${uuid}/start`, { gpuUuids: [] });
    await api("POST", `/api/experiments/${uuid}/complete`, {
      outcome: extra.outcome || "Experiment completed successfully",
      computeUsedHours: extra.computeUsedHours || 4,
    });
  }
  // For draft/pending_review: set via direct DB update after seeding
}

const pendingDbUpdates = [];
function queueStatusUpdate(uuid, status) {
  pendingDbUpdates.push({ uuid, status });
  console.log(`    -> Queued status: ${status} (will batch update via DB)`);
}

async function flushDbUpdates() {
  if (pendingDbUpdates.length === 0) return;
  const { execSync } = require("child_process");
  const sqls = pendingDbUpdates.map(u =>
    `UPDATE "Experiment" SET status='${u.status}' WHERE uuid='${u.uuid}';`
  ).join(" ");
  execSync(`ssh synapse "sudo -u postgres psql -d synapse -c \\"${sqls}\\""`, { stdio: "pipe" });
  console.log(`  Flushed ${pendingDbUpdates.length} status updates via DB`);
}

async function createDocument(projectUuid, type, title, content) {
  const data = await api("POST", `/api/research-projects/${projectUuid}/documents`, { type, title, content });
  if (data?.uuid) console.log(`    Document: ${title.substring(0, 40)}... (${data.uuid})`);
  return data;
}

async function createPool(name, description) {
  const raw = await api("POST", "/api/compute-pools", { name, description });
  const data = raw?.pool || raw;
  if (data?.uuid) console.log(`  Pool: ${name} (${data.uuid})`);
  return data;
}

async function createNode(poolUuid, label, opts = {}) {
  const data = await api("POST", "/api/compute-nodes", {
    poolUuid,
    label,
    sshHost: opts.sshHost || `${label.toLowerCase().replace(/\s+/g, "-")}.compute.internal`,
    sshUser: opts.sshUser || "ubuntu",
    sshPort: opts.sshPort || 22,
    instanceType: opts.instanceType || "p4d.24xlarge",
    region: opts.region || "us-east-1",
    sshKeySource: "ssh_config",
  });
  if (data?.uuid) console.log(`    Node: ${label} (${data?.uuid})`);
  return data;
}

async function addRelatedWork(projectUuid, url, title, authors, abstract) {
  const data = await api("POST", `/api/research-projects/${projectUuid}/related-works`, {
    url, title, authors, abstract, source: "arxiv",
  });
  if (data?.uuid) console.log(`    Paper: ${title.substring(0, 40)}...`);
  return data;
}

// ═══════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════
async function main() {
  console.log("\n=== Synapse Demo Data Seeder ===\n");

  // 1. Login
  await login();

  // 2. Create Agents
  console.log("\n--- Agents ---");
  const agentOC = await createAgent("OpenClaw", ["pre_research", "research", "experiment", "report"]);
  const agentCC = await createAgent("Claude Code", ["experiment", "report"]);

  // 3. Create Compute Pools + Nodes
  console.log("\n--- Compute ---");
  const pool1 = await createPool("AWS US-East GPU Cluster", "8x A100 80GB nodes for large-scale training");
  const pool2 = await createPool("On-Prem Lab Cluster", "Local GPU machines for quick iteration");

  if (pool1?.uuid) {
    await createNode(pool1.uuid, "gpu-east-1", { instanceType: "p4d.24xlarge", region: "us-east-1", sshHost: "10.0.1.101" });
    await createNode(pool1.uuid, "gpu-east-2", { instanceType: "p4d.24xlarge", region: "us-east-1", sshHost: "10.0.1.102" });
    await createNode(pool1.uuid, "gpu-east-3", { instanceType: "g5.12xlarge", region: "us-east-1", sshHost: "10.0.1.103" });
  }
  if (pool2?.uuid) {
    await createNode(pool2.uuid, "lab-rtx-01", { instanceType: "RTX 4090", region: "on-prem", sshHost: "192.168.1.50" });
    await createNode(pool2.uuid, "lab-rtx-02", { instanceType: "RTX 4090", region: "on-prem", sshHost: "192.168.1.51" });
  }

  // 4. Create Project Groups + Projects
  console.log("\n--- Project Groups ---");
  const grpNLP = await createGroup("NLP Research", "Large language model fine-tuning, alignment, and evaluation");
  const grpSpeech = await createGroup("Speech & Audio", "ASR, TTS, and speech enhancement research");

  // ── Project 1: LLM Alignment (main showcase, most data) ──
  console.log("\n--- Project: LLM Alignment Study ---");
  const proj1 = await createProject(
    "RLHF vs DPO Alignment Comparison",
    "Systematic comparison of RLHF and DPO for aligning 7B parameter models. We evaluate safety, helpfulness, and coherence across multiple benchmarks.",
    grpNLP?.uuid,
    {
      datasets: ["Anthropic HH-RLHF", "OpenAssistant", "UltraFeedback"],
      evaluationMethods: ["MT-Bench", "AlpacaEval 2.0", "TruthfulQA", "BBH"],
      computePoolUuid: pool1?.uuid,
    }
  );

  if (proj1?.uuid) {
    // Research Questions (tree structure)
    console.log("  Creating research questions (tree)...");
    const q1 = await createQuestion(proj1.uuid,
      "How do RLHF and DPO compare on safety alignment at 7B scale?",
      "The core research question. We want to understand whether DPO can achieve comparable safety alignment to RLHF without the complexity of reward model training.");
    const q1a = await createQuestion(proj1.uuid,
      "Does DPO show reward hacking at longer generation lengths?",
      "RLHF is known to suffer from reward hacking. We need to check if DPO has similar issues when generating longer responses.",
      q1?.uuid);
    const q1b = await createQuestion(proj1.uuid,
      "What is the compute efficiency ratio of DPO vs RLHF?",
      "Compare total GPU hours needed for equivalent alignment quality. Include reward model training cost for RLHF.",
      q1?.uuid);
    const q2 = await createQuestion(proj1.uuid,
      "Can iterative DPO close the gap with RLHF on helpfulness?",
      "Explore whether running DPO in multiple rounds with updated preference data can match RLHF helpfulness scores.");
    const q2a = await createQuestion(proj1.uuid,
      "How many DPO iterations are needed before diminishing returns?",
      "Track the performance curve across 1, 2, 3, and 5 iterations of DPO training.",
      q2?.uuid);

    // Experiments (all stages)
    console.log("  Creating experiments (all stages)...");

    // Draft (set via DB after creation)
    const expDraft = await createExperiment(proj1.uuid,
      "RLHF with KTO loss variant",
      "Test Kahneman-Tversky Optimization as an alternative to standard PPO in RLHF pipeline. Uses the same reward model but different policy optimization.",
      { priority: "low", researchQuestionUuid: q1?.uuid, computeBudgetHours: 48 });
    if (expDraft?.uuid) queueStatusUpdate(expDraft.uuid, "draft");

    // Pending Review (set via DB)
    const expReview = await createExperiment(proj1.uuid,
      "DPO with rejection sampling (iter-2)",
      "Second iteration of DPO training using rejection-sampled preference pairs from the iter-1 model. Expected to improve helpfulness by ~3 points on MT-Bench.",
      { priority: "high", researchQuestionUuid: q2?.uuid, computeBudgetHours: 24 });
    if (expReview?.uuid) queueStatusUpdate(expReview.uuid, "pending_review");

    // Pending Start (default, no transition needed)
    const expStart = await createExperiment(proj1.uuid,
      "Baseline: SFT-only (no alignment)",
      "Control experiment. Fine-tune the base model with supervised instruction data only, no RLHF or DPO. Serves as the lower bound for alignment metrics.",
      { priority: "medium", researchQuestionUuid: q1?.uuid, computeBudgetHours: 12 });

    // In Progress
    const expRunning = await createExperiment(proj1.uuid,
      "DPO alignment — Mistral 7B on UltraFeedback",
      "Standard DPO training on Mistral-7B using UltraFeedback preference pairs. 4x A100 80GB, beta=0.1, lr=5e-7, 3 epochs.",
      { priority: "high", researchQuestionUuid: q1?.uuid, computeBudgetHours: 36 });
    if (expRunning?.uuid) await transitionExperiment(expRunning.uuid, "in_progress");

    // Completed (multiple)
    const expDone1 = await createExperiment(proj1.uuid,
      "RLHF alignment — Mistral 7B baseline",
      "Full RLHF pipeline: reward model training (2 epochs) + PPO (1 epoch). Baseline for all comparisons.",
      { priority: "high", researchQuestionUuid: q1?.uuid, computeBudgetHours: 48 });
    if (expDone1?.uuid) await transitionExperiment(expDone1.uuid, "completed", {
      outcome: "RLHF achieves MT-Bench 7.2, AlpacaEval 18.3%. Training took 42 GPU-hours across 4x A100.",
      computeUsedHours: 42,
    });

    const expDone2 = await createExperiment(proj1.uuid,
      "DPO iter-1 — Mistral 7B on HH-RLHF",
      "First iteration DPO using Anthropic HH-RLHF preference data. Direct comparison with RLHF baseline.",
      { priority: "high", researchQuestionUuid: q1b?.uuid, computeBudgetHours: 16 });
    if (expDone2?.uuid) await transitionExperiment(expDone2.uuid, "completed", {
      outcome: "DPO iter-1 achieves MT-Bench 6.8 (-0.4 vs RLHF), AlpacaEval 15.1%. Only 14 GPU-hours — 3x more efficient.",
      computeUsedHours: 14,
    });

    const expDone3 = await createExperiment(proj1.uuid,
      "Reward model quality analysis",
      "Evaluate the reward model used in RLHF pipeline. Measure accuracy on held-out preference pairs and analyze failure modes.",
      { priority: "medium", researchQuestionUuid: q1a?.uuid, computeBudgetHours: 8 });
    if (expDone3?.uuid) await transitionExperiment(expDone3.uuid, "completed", {
      outcome: "Reward model achieves 72.4% accuracy on held-out set. Main failure mode: verbose but unhelpful responses rated too high.",
      computeUsedHours: 6,
    });

    // Related Works
    console.log("  Adding related works...");
    await addRelatedWork(proj1.uuid,
      "https://arxiv.org/abs/2305.18290",
      "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
      "Rafael Rafailov, Archit Sharma, Eric Mitchell, Stefano Ermon, Christopher D. Manning, Chelsea Finn",
      "We introduce Direct Preference Optimization (DPO), a simple approach to training language models from preferences without reinforcement learning.");
    await addRelatedWork(proj1.uuid,
      "https://arxiv.org/abs/2204.05862",
      "Training language models to follow instructions with human feedback",
      "Long Ouyang, Jeff Wu, Xu Jiang, et al.",
      "We show an alignment methodology that significantly improves language model behavior through RLHF.");
    await addRelatedWork(proj1.uuid,
      "https://arxiv.org/abs/2402.01306",
      "Self-Play Fine-Tuning Converts Weak Language Models to Strong Language Models",
      "Zixiang Chen, Yihe Deng, Huizhuo Yuan, Kaixuan Ji, Quanquan Gu",
      "We propose SPIN, a self-play mechanism that can improve LLMs without additional human-annotated data.");
    await addRelatedWork(proj1.uuid,
      "https://arxiv.org/abs/2310.12036",
      "Zephyr: Direct Distillation of LM Alignment",
      "Lewis Tunstall, Edward Beeching, Nathan Lambert, et al.",
      "We explore distilled DPO (dDPO) for aligning smaller models using AI feedback instead of human preferences.");

    // Documents
    console.log("  Creating documents...");
    await createDocument(proj1.uuid, "research_notes", "Experiment Design Rationale",
      "## Why RLHF vs DPO?\n\nThe alignment community has shifted toward simpler methods like DPO, but rigorous 7B-scale comparisons are scarce. Most published results use different base models, datasets, and evaluation protocols, making apples-to-apples comparison impossible.\n\n## Controlled Variables\n- **Base model**: Mistral-7B-v0.1 for all experiments\n- **Data**: Same preference datasets (HH-RLHF, UltraFeedback)\n- **Compute**: Same GPU allocation (4x A100 80GB)\n- **Evaluation**: MT-Bench, AlpacaEval 2.0, TruthfulQA, BBH\n\n## Expected Outcome\nWe hypothesize DPO will match RLHF on safety but lag on helpfulness, with 2-3x compute efficiency advantage.");

    await createDocument(proj1.uuid, "literature_review", "Alignment Methods Survey — 2024-2025",
      "## Overview\n\nThis review covers the evolution of LLM alignment methods from RLHF to DPO and beyond.\n\n## Key Findings\n\n### RLHF (Ouyang et al., 2022)\n- Gold standard for alignment, used by OpenAI, Anthropic\n- Requires separate reward model training\n- Prone to reward hacking, mode collapse\n\n### DPO (Rafailov et al., 2023)\n- Eliminates reward model entirely\n- Closed-form loss derived from RLHF objective\n- Simpler to implement, more stable training\n\n### Iterative DPO / Online DPO\n- Multiple rounds of DPO with refreshed preference data\n- Closes helpfulness gap with RLHF\n- SPIN (Chen et al., 2024) shows self-play variant is effective\n\n## Gap in Literature\nNo systematic comparison at 7B scale with identical base models, datasets, and evaluation protocols. This project fills that gap.");

    await createDocument(proj1.uuid, "experiment_result", "RLHF Baseline Results — Mistral 7B",
      "## Summary\nRLHF alignment of Mistral-7B completed successfully.\n\n## Results\n| Metric | Score |\n|--------|-------|\n| MT-Bench | 7.2 |\n| AlpacaEval 2.0 | 18.3% |\n| TruthfulQA | 52.1% |\n| BBH (3-shot) | 41.7% |\n\n## Training Details\n- Reward model: 2 epochs, lr=1e-5, accuracy 72.4%\n- PPO: 1 epoch, lr=1.4e-5, KL penalty 0.02\n- Total: 42 GPU-hours on 4x A100 80GB\n\n## Key Observations\n1. Reward model accuracy plateaus after 1.5 epochs\n2. PPO training shows instability after step 800 (KL divergence spike)\n3. Verbose responses receive disproportionately high reward scores");
  }

  // ── Project 2: Multilingual NER ──
  console.log("\n--- Project: Multilingual NER ---");
  const proj2 = await createProject(
    "Cross-lingual NER with LLM Prompting",
    "Evaluate LLM-based NER across 10 languages using zero-shot and few-shot prompting, compared against fine-tuned XLM-R baselines.",
    grpNLP?.uuid,
    {
      datasets: ["WikiANN", "MultiCoNER v2", "MasakhaNER"],
      evaluationMethods: ["Span F1", "Entity-level Precision/Recall"],
    }
  );

  if (proj2?.uuid) {
    const nq1 = await createQuestion(proj2.uuid,
      "Can GPT-4 zero-shot NER match fine-tuned XLM-R on high-resource languages?",
      "Compare GPT-4 zero-shot with XLM-R fine-tuned on English/Chinese/Spanish NER.");

    const nexp1 = await createExperiment(proj2.uuid,
      "XLM-R fine-tuned baseline on WikiANN (10 langs)",
      "Fine-tune XLM-R-large on WikiANN training sets for all 10 target languages.",
      { priority: "high", researchQuestionUuid: nq1?.uuid, computeBudgetHours: 8 });
    if (nexp1?.uuid) await transitionExperiment(nexp1.uuid, "completed", {
      outcome: "XLM-R achieves avg F1 82.3% across 10 languages. Best: English (91.2%), worst: Yoruba (54.1%).",
      computeUsedHours: 6,
    });

    const nexp2 = await createExperiment(proj2.uuid,
      "GPT-4 zero-shot NER evaluation",
      "Evaluate GPT-4 on the same test sets using carefully designed prompts.",
      { priority: "high", researchQuestionUuid: nq1?.uuid });
    if (nexp2?.uuid) await transitionExperiment(nexp2.uuid, "in_progress");
  }

  // ── Project 3: Speech Enhancement ──
  console.log("\n--- Project: Speech Enhancement ---");
  const proj3 = await createProject(
    "Real-time Speech Enhancement for Edge Devices",
    "Develop lightweight speech enhancement models that run in real-time on mobile and IoT devices with <5ms latency.",
    grpSpeech?.uuid,
    {
      datasets: ["DNS Challenge 2024", "VoiceBank-DEMAND", "WHAM!"],
      evaluationMethods: ["PESQ", "STOI", "SI-SNR", "RTF (Real-Time Factor)"],
      computePoolUuid: pool2?.uuid,
    }
  );

  if (proj3?.uuid) {
    const sq1 = await createQuestion(proj3.uuid,
      "What is the minimum model size that achieves PESQ > 3.0 with RTF < 0.5 on ARM Cortex-A78?",
      "Find the Pareto frontier of model size vs quality for mobile deployment.");

    await createExperiment(proj3.uuid,
      "DCCRN-lite inference benchmark on Cortex-A78",
      "Measure latency and quality of DCCRN with reduced channels (32→16) on mobile ARM.",
      { priority: "high", researchQuestionUuid: sq1?.uuid, computeBudgetHours: 4 });
    await createExperiment(proj3.uuid,
      "TFGridNet-tiny training and evaluation",
      "Train a smaller TFGridNet variant and evaluate on DNS Challenge test set.",
      { priority: "medium", researchQuestionUuid: sq1?.uuid, computeBudgetHours: 12 });
  }

  // Flush all queued DB status updates
  console.log("\n--- Flushing DB updates ---");
  await flushDbUpdates();

  console.log("\n=== Demo data seeding complete! ===\n");
}

main().catch(console.error);
