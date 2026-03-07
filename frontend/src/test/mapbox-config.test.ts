import { describe, expect, it } from "vitest";

import { getMapboxToken } from "@/lib/mapbox";

describe("mapbox config", () => {
  it("throws when token is missing", () => {
    expect(() => getMapboxToken("")).toThrow();
  });
});
