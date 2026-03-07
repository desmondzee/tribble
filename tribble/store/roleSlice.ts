import { create } from "zustand";

export type AppRole = "civilian" | "organization" | "admin";

export const ROLE_LABELS: Record<AppRole, string> = {
  civilian: "Civilian",
  organization: "Organization",
  admin: "Admin",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  civilian: "Safety info, reports & Helios",
  organization: "Intel, ops & coordination",
  admin: "Full platform oversight",
};

interface RoleSlice {
  activeRole: AppRole;
  setActiveRole: (role: AppRole) => void;
}

export const useRoleStore = create<RoleSlice>((set) => ({
  activeRole: "organization",
  setActiveRole: (role) => set({ activeRole: role }),
}));
