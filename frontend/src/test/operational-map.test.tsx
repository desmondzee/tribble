import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalMap } from "@/components/map/OperationalMap";

describe("OperationalMap", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          type: "FeatureCollection",
          features: [
            { type: "Feature", geometry: { type: "Point", coordinates: [32.56, 15.5] }, properties: {} },
          ],
        }),
      }),
    );
  });

  it("renders cluster count label", async () => {
    render(<OperationalMap />);
    expect(await screen.findByText(/clusters/i)).toBeInTheDocument();
  });
});
