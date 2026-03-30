import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodObject, type ZodRawShape } from "zod";

export type McpTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodObject<ZodRawShape>;
  execute: (input: Record<string, unknown>) => Promise<McpTextResult>;
}

export function createMcpTool<TShape extends ZodRawShape>(definition: {
  name: string;
  description: string;
  inputSchema: ZodObject<TShape>;
  execute: (input: z.infer<ZodObject<TShape>>) => Promise<McpTextResult>;
}): McpToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute: (input) => definition.execute(input as z.infer<ZodObject<TShape>>),
  };
}

export function defineMcpTools<const TDefinitions extends readonly McpToolDefinition[]>(
  definitions: TDefinitions
): TDefinitions {
  return definitions;
}

export function registerMcpTools(server: McpServer, definitions: readonly McpToolDefinition[]) {
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

export function textResult(text: string, isError?: boolean): McpTextResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function jsonTextResult(value: unknown, isError?: boolean): McpTextResult {
  return textResult(JSON.stringify(value, null, 2), isError);
}
