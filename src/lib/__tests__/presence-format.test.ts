// src/lib/__tests__/presence-format.test.ts
import { describe, it, expect } from "vitest";
import { onlineAgentCount, totalActiveExecutions, groupByAgent, formatUptime, parseConnectionsResponse, type ConnectionViewLite } from "@/lib/presence-format";

function conn(over: Partial<ConnectionViewLite>): ConnectionViewLite {
  return {
    connectionKey: "k", agentUuid: "a", agentName: "A", clientType: "claude_code",
    host: "h", cwd: "/c", status: "online", connectedAt: "2026-06-28T00:00:00.000Z",
    lastSeenAt: "2026-06-28T00:00:10.000Z", executions: [], ...over,
  };
}
const exec = (uuid: string) => ({ experimentUuid: uuid, title: "T", researchProjectUuid: "p", liveStatus: "running", liveMessage: null, liveUpdatedAt: null });

describe("onlineAgentCount", () => {
  it("counts distinct agents with an online connection", () => {
    expect(onlineAgentCount([
      conn({ agentUuid: "a", status: "online" }),
      conn({ agentUuid: "a", connectionKey: "k2", status: "online" }), // same agent
      conn({ agentUuid: "b", status: "offline" }),                     // offline
      conn({ agentUuid: "c", status: "online" }),
    ])).toBe(2); // a and c
  });
  it("is 0 for empty", () => expect(onlineAgentCount([])).toBe(0));
});

describe("totalActiveExecutions", () => {
  it("sums executions across online connections only", () => {
    expect(totalActiveExecutions([
      conn({ status: "online", executions: [exec("e1"), exec("e2")] }),
      conn({ status: "offline", executions: [exec("e3")] }), // excluded
    ])).toBe(2);
  });
});

describe("groupByAgent", () => {
  it("groups connections under their agent preserving first-seen order", () => {
    const g = groupByAgent([
      conn({ agentUuid: "b", agentName: "Bee" }),
      conn({ agentUuid: "a", agentName: "Ay", connectionKey: "k2" }),
      conn({ agentUuid: "b", agentName: "Bee", connectionKey: "k3" }),
    ]);
    expect(g.map((x) => x.agentUuid)).toEqual(["b", "a"]);
    expect(g[0].connections).toHaveLength(2);
  });
});

describe("formatUptime", () => {
  it("formats elapsed as HH:MM:SS", () => {
    const start = "2026-06-28T00:00:00.000Z";
    const now = Date.parse("2026-06-28T01:02:03.000Z");
    expect(formatUptime(start, now)).toBe("01:02:03");
  });
  it("clamps negative to 00:00:00", () => {
    const start = "2026-06-28T00:00:10.000Z";
    expect(formatUptime(start, Date.parse("2026-06-28T00:00:00.000Z"))).toBe("00:00:00");
  });
});

describe("parseConnectionsResponse", () => {
  it("extracts the array at json.data", () => {
    expect(parseConnectionsResponse({ data: [conn({})] })).toHaveLength(1);
  });
  it("returns [] for malformed/missing data", () => {
    expect(parseConnectionsResponse({})).toEqual([]);
    expect(parseConnectionsResponse(null)).toEqual([]);
    expect(parseConnectionsResponse({ data: "nope" })).toEqual([]);
  });
});
