import { describe, expect, it } from "vitest";

import { applyRealtimeEvent } from "@/lib/realtime";

describe("realtime event handling", () => {
  it("updates recent ids with newest first", () => {
    const next = applyRealtimeEvent({ recentEventIds: ["a"] }, { id: "b" });
    expect(next.recentEventIds[0]).toBe("b");
  });
});
