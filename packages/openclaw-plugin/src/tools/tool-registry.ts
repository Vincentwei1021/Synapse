import type { SynapseMcpClient } from "../mcp-client.js";

export interface OpenClawObjectSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface OpenClawToolDefinition {
  name: string;
  description: string;
  parameters: OpenClawObjectSchema;
  execute: (mcpClient: SynapseMcpClient, args: Record<string, unknown>) => Promise<unknown>;
}

export interface OpenClawToolApi {
  registerTool(definition: {
    name: string;
    description: string;
    parameters: OpenClawObjectSchema;
    execute: (_id: string, args: Record<string, unknown>) => Promise<string>;
  }): void;
}

export function registerOpenClawTools(
  api: OpenClawToolApi,
  mcpClient: SynapseMcpClient,
  definitions: readonly OpenClawToolDefinition[]
) {
  definitions.forEach((definition) => {
    api.registerTool({
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
      async execute(_id: string, args: Record<string, unknown>) {
        const result = await definition.execute(mcpClient, args);
        return JSON.stringify(result, null, 2);
      },
    });
  });
}

export function defineOpenClawTools<const TDefinitions extends readonly OpenClawToolDefinition[]>(
  definitions: TDefinitions
): TDefinitions {
  return definitions;
}

export function createPassthroughTool<TArgs extends Record<string, unknown> = Record<string, unknown>>(definition: {
  name: string;
  description: string;
  parameters: OpenClawObjectSchema;
  targetToolName: string;
  mapArgs?: (args: TArgs) => Record<string, unknown>;
}): OpenClawToolDefinition {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    async execute(mcpClient, args) {
      return mcpClient.callTool(
        definition.targetToolName,
        definition.mapArgs ? definition.mapArgs(args as TArgs) : args
      );
    },
  };
}
