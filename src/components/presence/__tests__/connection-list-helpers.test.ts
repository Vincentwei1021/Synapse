import { describe, it, expect } from "vitest";
import { connectionStatusLabel } from "@/components/presence/connection-list.helpers";

describe("connectionStatusLabel", () => {
  it("passes through online/offline", () => {
    expect(connectionStatusLabel({ status: "online" })).toBe("online");
    expect(connectionStatusLabel({ status: "offline" })).toBe("offline");
  });
});
