export interface Killable { kill(signal?: string): boolean; }

export class ChildRegistry {
  private children = new Map<string, Killable>();

  register(experimentUuid: string, child: Killable): void {
    this.children.set(experimentUuid, child);
  }

  unregister(experimentUuid: string, child: Killable): void {
    if (this.children.get(experimentUuid) === child) this.children.delete(experimentUuid);
  }

  interrupt(experimentUuid: string): boolean {
    const child = this.children.get(experimentUuid);
    if (!child) return false;
    child.kill("SIGTERM");
    return true;
  }

  killAll(): void {
    for (const child of this.children.values()) child.kill("SIGTERM");
    this.children.clear();
  }

  size(): number {
    return this.children.size;
  }
}
