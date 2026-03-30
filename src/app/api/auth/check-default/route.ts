// src/app/api/auth/check-default/route.ts
// Check if default auth is enabled

import { withErrorHandler } from "@/lib/api-handler";
import { success } from "@/lib/api-response";
import { isDefaultAuthEnabled } from "@/lib/default-auth";

export const GET = withErrorHandler(async () => {
  const enabled = isDefaultAuthEnabled();

  return success({ enabled });
});
