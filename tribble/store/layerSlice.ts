import { create } from "zustand";
import type { LayerId, LayerGroupId } from "@/types";
import { LAYER_DEFS } from "@/types/map";

interface LayerSlice {
  visibility: Record<LayerId, boolean>;
  opacity: Record<LayerId, number>;
  toggleLayer: (id: LayerId) => void;
  setOpacity: (id: LayerId, opacity: number) => void;
  toggleGroup: (group: LayerGroupId) => void;
  resetAll: () => void;
}

const defaultVisibility = Object.fromEntries(
  LAYER_DEFS.map((l) => [l.id, l.defaultVisible])
) as Record<LayerId, boolean>;
const defaultOpacity = Object.fromEntries(
  LAYER_DEFS.map((l) => [l.id, l.defaultOpacity])
) as Record<LayerId, number>;

export const useLayerStore = create<LayerSlice>((set) => ({
  visibility: { ...defaultVisibility },
  opacity: { ...defaultOpacity },
  toggleLayer: (id) =>
    set((state) => ({
      visibility: { ...state.visibility, [id]: !state.visibility[id] },
    })),
  setOpacity: (id, opacity) =>
    set((state) => ({ opacity: { ...state.opacity, [id]: opacity } })),
  toggleGroup: (group) =>
    set((state) => {
      const groupLayers = LAYER_DEFS.filter((l) => l.group === group);
      const allVisible = groupLayers.every((l) => state.visibility[l.id]);
      const newVis = { ...state.visibility };
      groupLayers.forEach((l) => {
        newVis[l.id] = !allVisible;
      });
      return { visibility: newVis };
    }),
  resetAll: () =>
    set({ visibility: { ...defaultVisibility }, opacity: { ...defaultOpacity } }),
}));
