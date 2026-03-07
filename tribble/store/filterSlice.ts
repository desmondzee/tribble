import { create } from "zustand";
import type { Severity, SourceType } from "@/types";

interface FilterSlice {
  severities: Severity[];
  sourcesVisible: SourceType[];
  setFilter: (key: "severities" | "sourcesVisible", value: Severity[] | SourceType[]) => void;
}

const ALL_SOURCES: SourceType[] = [
  "news_agent",
  "user_submission",
  "satellite",
  "weather_api",
  "drone",
  "analyst_input",
];

export const useFilterStore = create<FilterSlice>((set) => ({
  severities: ["critical", "high", "medium", "low"],
  sourcesVisible: ALL_SOURCES,
  setFilter: (key, value) => set({ [key]: value }),
}));
