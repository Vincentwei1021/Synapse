import { NextRequest } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";
import { errors, success } from "@/lib/api-response";
import { getAuthContext } from "@/lib/auth";
import { getDocumentByUuid } from "@/services/document.service";
import {
  DOCUMENT_IMAGE_ALLOWED_MIME,
  DOCUMENT_IMAGE_MAX_BYTES,
  writeDocumentImage,
} from "@/services/document-image.service";

export const POST = withErrorHandler(
  async (request: NextRequest, context: { params: Promise<{ uuid: string }> }) => {
    const auth = await getAuthContext(request);
    if (!auth) return errors.unauthorized();

    const { uuid: documentUuid } = await context.params;
    const doc = await getDocumentByUuid(auth.companyUuid, documentUuid);
    if (!doc) return errors.notFound("Document");

    const formData = await request.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      return errors.validationError({ file: "file field must be a File" });
    }
    const file = fileEntry;

    if (file.size === 0) {
      return errors.validationError({ file: "file is empty" });
    }
    if (file.size > DOCUMENT_IMAGE_MAX_BYTES) {
      return errors.validationError({ file: `file exceeds ${DOCUMENT_IMAGE_MAX_BYTES / (1024 * 1024)} MB limit` });
    }
    const mime = file.type || "application/octet-stream";
    if (!DOCUMENT_IMAGE_ALLOWED_MIME.has(mime)) {
      return errors.validationError({ file: `unsupported content type: ${mime}` });
    }

    const result = await writeDocumentImage({
      companyUuid: auth.companyUuid,
      documentUuid,
      originalName: file.name,
      mimeType: mime,
      data: Buffer.from(await file.arrayBuffer()),
    });

    return success(result);
  },
);
