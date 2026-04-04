// src/services/document.service.ts
// Document Service Layer (ARCHITECTURE.md §3.1 Service Layer)
// UUID-Based Architecture: All operations use UUIDs

import { prisma } from "@/lib/prisma";
import { formatCreatedBy } from "@/lib/uuid-resolver";
import { eventBus } from "@/lib/event-bus";

// ===== Type Definitions =====

export interface DocumentListParams {
  companyUuid: string;
  researchProjectUuid: string;
  skip: number;
  take: number;
  type?: string;
}

export interface DocumentCreateParams {
  companyUuid: string;
  researchProjectUuid: string;
  type: string;
  title: string;
  content?: string | null;
  experimentDesignUuid?: string | null;
  createdByUuid: string;
}

export interface DocumentUpdateParams {
  title?: string;
  content?: string | null;
  incrementVersion?: boolean;
}

// API response format
export interface DocumentResponse {
  uuid: string;
  type: string;
  title: string;
  content?: string | null;
  version: number;
  experimentDesignUuid: string | null;
  project?: { uuid: string; name: string };
  createdBy: { type: string; uuid: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ===== Internal Helper Functions =====

// Format a single Document into API response format
async function formatDocumentResponse(
  doc: {
    uuid: string;
    type: string;
    title: string;
    content?: string | null;
    version: number;
    experimentDesignUuid: string | null;
    createdByUuid: string;
    createdAt: Date;
    updatedAt: Date;
    researchProject?: { uuid: string; name: string };
  },
  includeContent = false
): Promise<DocumentResponse> {
  const createdBy = await formatCreatedBy(doc.createdByUuid);

  const response: DocumentResponse = {
    uuid: doc.uuid,
    type: doc.type,
    title: doc.title,
    version: doc.version,
    experimentDesignUuid: doc.experimentDesignUuid,
    createdBy,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };

  if (includeContent && doc.content !== undefined) {
    response.content = doc.content;
  }

  if (doc.researchProject) {
    response.project = doc.researchProject;
  }

  return response;
}

// ===== Service Methods =====

// List documents query
export async function listDocuments({
  companyUuid,
  researchProjectUuid,
  skip,
  take,
  type,
}: DocumentListParams): Promise<{ documents: DocumentResponse[]; total: number }> {
  const where = {
    researchProjectUuid,
    companyUuid,
    ...(type && { type }),
  };

  const [rawDocuments, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take,
      orderBy: { updatedAt: "desc" },
      select: {
        uuid: true,
        type: true,
        title: true,
        version: true,
        experimentDesignUuid: true,
        createdByUuid: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.document.count({ where }),
  ]);

  const documents = await Promise.all(
    rawDocuments.map((doc) => formatDocumentResponse(doc))
  );
  return { documents, total };
}

// Get Document details
export async function getDocument(
  companyUuid: string,
  uuid: string
): Promise<DocumentResponse | null> {
  const doc = await prisma.document.findFirst({
    where: { uuid, companyUuid },
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  if (!doc) return null;
  return formatDocumentResponse(doc, true);
}

// Get raw Document data by UUID (internal use)
export async function getDocumentByUuid(companyUuid: string, uuid: string) {
  return prisma.document.findFirst({
    where: { uuid, companyUuid },
  });
}

// Create Document
export async function createDocument(
  params: DocumentCreateParams
): Promise<DocumentResponse> {
  const doc = await prisma.document.create({
    data: {
      companyUuid: params.companyUuid,
      researchProjectUuid: params.researchProjectUuid,
      type: params.type,
      title: params.title,
      content: params.content,
      version: 1,
      experimentDesignUuid: params.experimentDesignUuid,
      createdByUuid: params.createdByUuid,
    },
    select: {
      uuid: true,
      type: true,
      title: true,
      content: true,
      version: true,
      experimentDesignUuid: true,
      createdByUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  eventBus.emitChange({
    companyUuid: params.companyUuid,
    researchProjectUuid: params.researchProjectUuid,
    entityType: "document",
    entityUuid: doc.uuid,
    action: "created",
  });

  return formatDocumentResponse(doc, true);
}

// Update Document
export async function updateDocument(
  uuid: string,
  { title, content, incrementVersion }: DocumentUpdateParams
): Promise<DocumentResponse> {
  const data: { title?: string; content?: string | null; version?: { increment: number } } = {};

  if (title !== undefined) {
    data.title = title;
  }
  if (content !== undefined) {
    data.content = content;
  }
  if (incrementVersion) {
    data.version = { increment: 1 };
  }

  const doc = await prisma.document.update({
    where: { uuid },
    data,
    include: {
      researchProject: { select: { uuid: true, name: true } },
    },
  });

  return formatDocumentResponse(doc, true);
}

// Delete Document
export async function deleteDocument(uuid: string) {
  return prisma.document.delete({ where: { uuid } });
}

// Create Document from Experiment Design
export async function createDocumentFromExperimentDesign(
  companyUuid: string,
  researchProjectUuid: string,
  experimentDesignUuid: string,
  createdByUuid: string,
  doc: { type: string; title: string; content?: string }
): Promise<DocumentResponse> {
  const created = await prisma.document.create({
    data: {
      companyUuid,
      researchProjectUuid,
      type: doc.type || "prd",
      title: doc.title,
      content: doc.content || null,
      version: 1,
      experimentDesignUuid,
      createdByUuid,
    },
    select: {
      uuid: true,
      type: true,
      title: true,
      content: true,
      version: true,
      experimentDesignUuid: true,
      createdByUuid: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return formatDocumentResponse(created, true);
}
