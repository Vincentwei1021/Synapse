import { Bot, Terminal, Sparkles } from "lucide-react";

export function AgentTypeIcon({ type, className = "h-2.5 w-2.5" }: { type: string; className?: string }) {
  if (type === "claude_code") return <Terminal className={`shrink-0 ${className}`} />;
  if (type === "codex") return <Sparkles className={`shrink-0 ${className}`} />;
  return <Bot className={`shrink-0 ${className}`} />;
}
