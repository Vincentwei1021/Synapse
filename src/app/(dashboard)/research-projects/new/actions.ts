"use server";

import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth-server";
import { createProject } from "@/services/project.service";
import { createIdea } from "@/services/idea.service";
import { createDocument } from "@/services/document.service";

interface UploadedDocument {
  name: string;
  content: string;
  type: "prd" | "tech_design" | "adr" | "spec" | "guide";
}

interface CreateProjectInput {
  name: string;
  description: string;
  ideas: string[];
  documents?: UploadedDocument[];
}

export async function createProjectAction(input: CreateProjectInput) {
  const auth = await getServerAuthContext();
  if (!auth) {
    redirect("/login");
  }

  try {
    // Create project
    const project = await createProject({
      companyUuid: auth.companyUuid,
      name: input.name,
      description: input.description,
    });

    // Create ideas if any
    const validIdeas = input.ideas.filter((idea) => idea.trim());
    for (const ideaContent of validIdeas) {
      await createIdea({
        companyUuid: auth.companyUuid,
        projectUuid: project.uuid,
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
          projectUuid: project.uuid,
          type: doc.type,
          title: doc.name.replace(/\.md$/i, ""),
          content: doc.content,
          createdByUuid: auth.actorUuid,
        });
      }
    }

    return { success: true, projectUuid: project.uuid };
  } catch (error) {
    console.error("Failed to create project:", error);
    return { success: false, error: "Failed to create project" };
  }
}
