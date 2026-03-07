import { describe, expect, it } from "vitest";

import { applyRealtimeEvent, createRealtimeSubscriber } from "@/lib/realtime";
import { getMapboxToken, isMapboxEnabled } from "@/lib/mapbox";

describe("stage2 smoke", () => {
  it("validates mapbox config helpers", () => {
    expect(() => getMapboxToken("")).toThrow();
    expect(getMapboxToken("pk.demo-token")).toBe("pk.demo-token");
    expect(isMapboxEnabled("TRUE")).toBe(true);
    expect(isMapboxEnabled("off")).toBe(false);
  });

  it("handles realtime event ingestion and subscriber lifecycle", () => {
    const next = applyRealtimeEvent({ recentEventIds: ["a"] }, { id: "b", occurredAt: "2026-03-07T12:00:00Z" });
    expect(next.recentEventIds[0]).toBe("b");
    expect(next.lastEventAt).toBe("2026-03-07T12:00:00Z");

    const events: string[] = [];
    const statuses: boolean[] = [];
    const subscriber = createRealtimeSubscriber();
    const unsubscribe = subscriber.subscribe(
      (event) => events.push(event.id),
      (connected) => statuses.push(connected),
    );
    unsubscribe();

    expect(events).toEqual([]);
    expect(statuses).toEqual([true, false]);
  });
});
