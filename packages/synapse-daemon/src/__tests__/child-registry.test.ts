import { describe, it, expect, vi } from "vitest";
import { ChildRegistry, type Killable } from "../child-registry";

const fakeChild = () => ({ kill: vi.fn().mockReturnValue(true) } as Killable & { kill: ReturnType<typeof vi.fn> });

describe("ChildRegistry", () => {
  it("interrupt kills the registered child and returns true", () => {
    const r = new ChildRegistry(); const c = fakeChild();
    r.register("exp-1", c);
    expect(r.interrupt("exp-1")).toBe(true);
    expect(c.kill).toHaveBeenCalledWith("SIGTERM");
  });
  it("interrupt returns false when nothing is running for that experiment", () => {
    const r = new ChildRegistry();
    expect(r.interrupt("nope")).toBe(false);
  });
  it("unregister only deletes the same child (identity-guarded)", () => {
    const r = new ChildRegistry(); const c1 = fakeChild(); const c2 = fakeChild();
    r.register("exp-1", c1);
    r.unregister("exp-1", c2);          // different child — must NOT remove c1
    expect(r.interrupt("exp-1")).toBe(true);
    expect(c1.kill).toHaveBeenCalled();
  });
  it("killAll SIGTERMs every registered child", () => {
    const r = new ChildRegistry(); const a = fakeChild(); const b = fakeChild();
    r.register("a", a); r.register("b", b);
    r.killAll();
    expect(a.kill).toHaveBeenCalledWith("SIGTERM");
    expect(b.kill).toHaveBeenCalledWith("SIGTERM");
    expect(r.size()).toBe(0);
  });
});
