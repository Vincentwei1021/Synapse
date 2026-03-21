// src/mcp/tools/schema-utils.ts
// Defensive coercion for MCP tool array parameters.
// Some MCP clients (e.g. Claude Code) intermittently serialize array arguments
// as JSON strings instead of native arrays. This helper transparently handles both.
// See: https://github.com/Synapse-AIDLC/Synapse/issues/8

import { z } from "zod";

/**
 * Drop-in replacement for `z.array(schema)` that also accepts a JSON-encoded
 * string and parses it back into an array before Zod validation runs.
 *
 * Usage:  zArray(z.string())          // replaces z.array(z.string())
 *         zArray(z.object({...}))     // replaces z.array(z.object({...}))
 */
export function zArray<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((val) => {
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // not valid JSON — fall through and let Zod report the real error
      }
    }
    return val;
  }, z.array(schema));
}
