"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { createResearchProject } from "@/services/research-project.service";
import { createResearchQuestion } from "@/services/research-question.service";
import { createDocument } from "@/services/document.service";

interface UploadedDocument {
  name: string;
  content: string;
  type: "prd" | "tech_design" | "adr" | "spec" | "guide";
}

interface CreateProjectInput {
  name: string;
  description: string;
  goal?: string;
  datasets?: string[];
  evaluationMethods?: string[];
  computePoolUuid?: string | null;
  groupUuid?: string | null;
  ideas: string[];
  documents?: UploadedDocument[];
}

export async function createResearchProjectAction(input: CreateProjectInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    // Create project
    const project = await createResearchProject({
      companyUuid: auth.companyUuid,
      name: input.name,
      description: input.description,
      goal: input.goal,
      datasets: input.datasets,
      evaluationMethods: input.evaluationMethods,
      computePoolUuid: input.computePoolUuid,
      groupUuid: input.groupUuid,
    });

    // Create ideas if any
    const validIdeas = input.ideas.filter((idea) => idea.trim());
    for (const ideaContent of validIdeas) {
      await createResearchQuestion({
        companyUuid: auth.companyUuid,
        researchProjectUuid: project.uuid,
        title: ideaContent.slice(0, 100),
        content: ideaContent,
        createdByUuid: auth.actorUuid,
      });
    }

    // Create documents if any
    if (input.documents && input.documents.length > 0) {
      for (const doc of input.documents) {
        await createDocument({
          companyUuid: auth.companyUuid,
          researchProjectUuid: project.uuid,
          type: doc.type,
          title: doc.name.replace(/\.md$/i, ""),
          content: doc.content,
          createdByUuid: auth.actorUuid,
        });
      }
    }

    return { success: true, researchProjectUuid: project.uuid };
  } catch (error) {
    console.error("Failed to create project:", error);
    return { success: false, error: "Failed to create project" };
  }
}
