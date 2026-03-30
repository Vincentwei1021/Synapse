import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ZodObject } from "zod";

type TextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface CompatAliasToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodObject<ZodRawShape>;
  execute: (input: Record<string, unknown>) => Promise<TextResult>;
}

export function createCompatAliasTool<TShape extends ZodRawShape>(definition: {
  name: string;
  description: string;
  inputSchema: ZodObject<TShape>;
  execute: (input: z.infer<ZodObject<TShape>>) => Promise<TextResult>;
}): CompatAliasToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: (input) => definition.execute(input as z.infer<ZodObject<TShape>>),
  };
}

export function defineCompatAliasTools<const TDefinitions extends readonly CompatAliasToolDefinition[]>(
  definitions: TDefinitions
): TDefinitions {
  return definitions;
}

export function registerCompatAliasTools(
  server: McpServer,
  definitions: readonly CompatAliasToolDefinition[]
) {
  definitions.forEach((definition) => {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      definition.execute
    );
  });
}

export function jsonTextResult(value: unknown): TextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

export function notFoundTextResult(entityLabel: string): TextResult {
  return {
    content: [{ type: "text", text: `${entityLabel} not found` }],
    isError: true,
  };
}
