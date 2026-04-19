import { Bot, Terminal } from "lucide-react";

export function AgentTypeIcon({ type, className = "h-2.5 w-2.5" }: { type: string; className?: string }) {
  return type === "claude_code"
    ? <Terminal className={`shrink-0 ${className}`} />
    : <Bot className={`shrink-0 ${className}`} />;
}
