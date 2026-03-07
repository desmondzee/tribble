import { create } from "zustand";
import type { User, UserRole } from "@/types";
import { PLACEHOLDER_USER } from "@/lib/placeholder-data";

interface AuthSlice {
  user: User | null;
  role: UserRole;
  status: "unauthenticated" | "authenticating" | "authenticated" | "forbidden";
  setRole: (role: UserRole) => void;
  login: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthSlice>((set) => ({
  user: null,
  role: "ngo_viewer",
  status: "unauthenticated",
  setRole: (role) => set({ role }),
  login: () => {
    set({ status: "authenticating" });
    setTimeout(() => {
      set((state) => ({
        status: "authenticated",
        user: { ...PLACEHOLDER_USER, role: state.role },
      }));
    }, 1000);
  },
  logout: () => set({ user: null, status: "unauthenticated", role: "ngo_viewer" }),
}));
