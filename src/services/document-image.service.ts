import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DOCUMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_IMAGE_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120);
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png": return ".png";
    case "image/jpeg": return ".jpg";
    case "image/gif": return ".gif";
    case "image/webp": return ".webp";
    case "image/svg+xml": return ".svg";
    default: return "";
  }
}

export type DocumentImageWriteResult = {
  filename: string;
  size: number;
  mimeType: string;
  url: string;
};

export async function writeDocumentImage(input: {
  companyUuid: string;
  documentUuid: string;
  originalName?: string | null;
  mimeType: string;
  data: Buffer;
}): Promise<DocumentImageWriteResult> {
  if (!DOCUMENT_IMAGE_ALLOWED_MIME.has(input.mimeType)) {
    throw new Error(`Unsupported content type: ${input.mimeType}`);
  }
  if (input.data.length === 0) {
    throw new Error("Image data is empty");
  }
  if (input.data.length > DOCUMENT_IMAGE_MAX_BYTES) {
    throw new Error(`Image exceeds ${DOCUMENT_IMAGE_MAX_BYTES / (1024 * 1024)} MB limit`);
  }

  const dir = path.join(
    homedir(),
    ".synapse",
    "uploads",
    "documents",
    input.companyUuid,
    input.documentUuid,
  );
  await mkdir(dir, { recursive: true });

  const providedName = sanitizeFileName(input.originalName || "image");
  const baseName = providedName || `image${extFromMime(input.mimeType)}`;
  const storedName = `${randomUUID()}-${baseName}`;
  const storedPath = path.join(dir, storedName);

  await writeFile(storedPath, input.data);

  return {
    filename: storedName,
    size: input.data.length,
    mimeType: input.mimeType,
    url: `/api/documents/${input.documentUuid}/images/${encodeURIComponent(storedName)}`,
  };
}
