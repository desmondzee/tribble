/**
 * Client-side store for reports submitted by the current user in this browser.
 * Persisted to localStorage so "My Reports" survives refresh.
 */

import { create } from "zustand";

const STORAGE_KEY = "tribble_my_reports";

export interface MyReport {
  report_id: string;
  narrative: string;
  lat: number;
  lng: number;
  submitted_at: string;
  status: string;
  crisis_categories: string[];
  help_categories: string[];
}

function loadFromStorage(): MyReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MyReport[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(reports: MyReport[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  } catch {
    // ignore quota or other errors
  }
}

interface ReportsSlice {
  myReports: MyReport[];
  addReport: (report: MyReport) => void;
  updateReportStatus: (reportId: string, status: string) => void;
  hydrate: () => void;
}

export const useReportsStore = create<ReportsSlice>((set, get) => ({
  myReports: typeof window !== "undefined" ? loadFromStorage() : [],

  addReport: (report) => {
    set((state) => {
      const next = [report, ...state.myReports];
      saveToStorage(next);
      return { myReports: next };
    });
  },

  updateReportStatus: (reportId, status) => {
    set((state) => {
      const next = state.myReports.map((r) =>
        r.report_id === reportId ? { ...r, status } : r
      );
      saveToStorage(next);
      return { myReports: next };
    });
  },

  hydrate: () => {
    const loaded = loadFromStorage();
    if (loaded.length !== get().myReports.length || loaded.some((r, i) => get().myReports[i]?.report_id !== r.report_id)) {
      set({ myReports: loaded });
    }
  },
}));
