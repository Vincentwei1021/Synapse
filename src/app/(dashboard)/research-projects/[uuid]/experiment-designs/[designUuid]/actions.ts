"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import {
  approveExperimentDesign,
  rejectExperimentDesign,
  closeExperimentDesign,
  submitExperimentDesign,
  deleteExperimentDesign,
  getExperimentDesignByUuid,
  addDocumentDraft,
  addRunDraft,
  updateDocumentDraft,
  updateRunDraft,
  removeDocumentDraft,
  removeRunDraft,
} from "@/services/experiment-design.service";
import { createActivity } from "@/services/activity.service";

export async function approveDesignAction(designUuid: string, reviewNote?: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate proposal exists and belongs to this company
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    // Only pending proposals can be approved
    if (proposal.status !== "pending") {
      return { success: false, error: "Proposal is not pending review" };
    }

    await approveExperimentDesign(designUuid, auth.companyUuid, auth.actorUuid, reviewNote || null);

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: proposal.researchProjectUuid,
      targetType: "experiment_design",
      targetUuid: designUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "approved",
      value: reviewNote ? { reviewNote } : undefined,
    });

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);
    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to approve proposal:", error);
    return { success: false, error: "Failed to approve proposal" };
  }
}

export async function submitDesignAction(designUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate proposal exists and belongs to this company
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    // Only draft proposals can be submitted for review
    if (proposal.status !== "draft") {
      return { success: false, error: "Proposal is not in draft status" };
    }

    await submitExperimentDesign(designUuid, auth.companyUuid);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);
    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to submit proposal:", error);
    return { success: false, error: "Failed to submit proposal" };
  }
}

export async function rejectDesignAction(designUuid: string, reviewNote?: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    // Validate proposal exists and belongs to this company
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    // Only pending proposals can be rejected
    if (proposal.status !== "pending") {
      return { success: false, error: "Proposal is not pending review" };
    }

    await rejectExperimentDesign(designUuid, auth.actorUuid, reviewNote || "");

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: proposal.researchProjectUuid,
      targetType: "experiment_design",
      targetUuid: designUuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "rejected_to_draft",
      value: reviewNote ? { reviewNote } : undefined,
    });

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);
    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to reject proposal:", error);
    return { success: false, error: "Failed to reject proposal" };
  }
}

export async function closeDesignAction(designUuid: string, reviewNote: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    if (proposal.status !== "pending") {
      return { success: false, error: "Proposal is not pending review" };
    }

    await closeExperimentDesign(designUuid, auth.actorUuid, reviewNote);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);
    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to close proposal:", error);
    return { success: false, error: "Failed to close proposal" };
  }
}

export async function deleteExperimentDesignAction(designUuid: string, projectUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    await deleteExperimentDesign(designUuid, auth.companyUuid);

    revalidatePath(`/research-projects/${projectUuid}/experiment-designs`);

    return { success: true };
  } catch (error) {
    console.error("Failed to delete proposal:", error);
    return { success: false, error: "Failed to delete proposal" };
  }
}

// ===== Draft Management Actions =====

// Add document draft
export async function addDocumentDraftAction(
  designUuid: string,
  draft: { type: string; title: string; content: string }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await addDocumentDraft(designUuid, auth.companyUuid, draft);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to add document draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to add document draft" };
  }
}

// Add task draft
export async function addRunDraftAction(
  designUuid: string,
  draft: {
    title: string;
    description?: string;
    computeBudgetHours?: number;
    priority?: string;
    acceptanceCriteriaItems?: Array<{ description: string; required?: boolean }>;
    dependsOnDraftUuids?: string[];
  }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await addRunDraft(designUuid, auth.companyUuid, draft);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to add task draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to add task draft" };
  }
}

// Update document draft
export async function updateDocumentDraftAction(
  designUuid: string,
  draftUuid: string,
  updates: { type?: string; title?: string; content?: string }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await updateDocumentDraft(designUuid, auth.companyUuid, draftUuid, updates);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to update document draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update document draft" };
  }
}

// Update task draft
export async function updateRunDraftAction(
  designUuid: string,
  draftUuid: string,
  updates: {
    title?: string;
    description?: string;
    computeBudgetHours?: number;
    priority?: string;
    acceptanceCriteriaItems?: Array<{ description: string; required?: boolean }>;
    dependsOnDraftUuids?: string[];
  }
) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await updateRunDraft(designUuid, auth.companyUuid, draftUuid, updates);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to update task draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update task draft" };
  }
}

// Remove document draft
export async function removeDocumentDraftAction(designUuid: string, draftUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await removeDocumentDraft(designUuid, auth.companyUuid, draftUuid);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to remove document draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove document draft" };
  }
}

// Remove task draft
export async function removeRunDraftAction(designUuid: string, draftUuid: string) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const proposal = await getExperimentDesignByUuid(auth.companyUuid, designUuid);
    if (!proposal) {
      return { success: false, error: "Proposal not found" };
    }

    const updated = await removeRunDraft(designUuid, auth.companyUuid, draftUuid);

    revalidatePath(`/research-projects/${proposal.researchProjectUuid}/experiment-designs/${designUuid}`);

    return { success: true, proposal: updated };
  } catch (error) {
    console.error("Failed to remove task draft:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to remove task draft" };
  }
}
