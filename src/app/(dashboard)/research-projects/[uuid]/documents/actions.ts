"use server";

import { revalidatePath } from "next/cache";
import { getServerAuthContext } from "@/lib/auth-server";
import { createDocument } from "@/services/document.service";
import { createActivity } from "@/services/activity.service";
import { researchProjectExists } from "@/services/research-project.service";

export async function createDocumentAction(input: {
  projectUuid: string;
  title: string;
  type: string;
  content: string;
}) {
  const auth = await getServerAuthContext();
  if (!auth) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    if (!(await researchProjectExists(auth.companyUuid, input.projectUuid))) {
      return { success: false, error: "Project not found" };
    }

    const doc = await createDocument({
      companyUuid: auth.companyUuid,
      researchProjectUuid: input.projectUuid,
      type: input.type,
      title: input.title,
      content: input.content,
      createdByUuid: auth.actorUuid,
    });

    await createActivity({
      companyUuid: auth.companyUuid,
      researchProjectUuid: input.projectUuid,
      targetType: "document",
      targetUuid: doc.uuid,
      actorType: auth.type,
      actorUuid: auth.actorUuid,
      action: "document_created",
    });

    revalidatePath(`/research-projects/${input.projectUuid}/documents`);
    return { success: true, documentUuid: doc.uuid };
  } catch (error) {
    console.error("Failed to create document:", error);
    return { success: false, error: "Failed to create document" };
  }
}
