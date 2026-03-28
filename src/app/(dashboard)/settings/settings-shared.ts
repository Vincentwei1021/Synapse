import type { SessionResponse } from "@/services/session.service";

export interface ApiKey {
  uuid: string;
  keyPrefix: string;
  name: string | null;
  lastUsed: string | null;
  expiresAt: string | null;
  createdAt: string;
  roles: string[];
  agentUuid: string;
  persona: string | null;
}

export interface PersonaPreset {
  id: string;
  labelKey: string;
  descKey: string;
}

// PM Agent Persona presets (labels and descriptions use i18n keys)
export const PM_PERSONAS: PersonaPreset[] = [
  { id: "dev_pm", labelKey: "personas.devPm", descKey: "personas.devPmDesc" },
  { id: "full_pm", labelKey: "personas.fullPm", descKey: "personas.fullPmDesc" },
  { id: "simple_pm", labelKey: "personas.simplePm", descKey: "personas.simplePmDesc" },
];

// Developer Agent Persona presets
export const DEV_PERSONAS: PersonaPreset[] = [
  { id: "senior_dev", labelKey: "personas.seniorDev", descKey: "personas.seniorDevDesc" },
  { id: "fullstack_dev", labelKey: "personas.fullstackDev", descKey: "personas.fullstackDevDesc" },
  { id: "pragmatic_dev", labelKey: "personas.pragmaticDev", descKey: "personas.pragmaticDevDesc" },
];

// Admin Agent Persona presets
export const ADMIN_PERSONAS: PersonaPreset[] = [
  { id: "careful_admin", labelKey: "personas.carefulAdmin", descKey: "personas.carefulAdminDesc" },
  { id: "efficient_admin", labelKey: "personas.efficientAdmin", descKey: "personas.efficientAdminDesc" },
];

export function getAvailablePersonas(roles: string[]) {
  const personas: PersonaPreset[] = [];
  if (roles.includes("research_lead_agent")) {
    personas.push(...PM_PERSONAS);
  }
  if (roles.includes("researcher_agent")) {
    personas.push(...DEV_PERSONAS);
  }
  if (roles.includes("pi_agent")) {
    personas.push(...ADMIN_PERSONAS);
  }
  return personas;
}

export function hasAdminRole(roles: string[]) {
  return roles.includes("pi_agent");
}

export type AgentSessionsByAgent = Record<string, SessionResponse[]>;
