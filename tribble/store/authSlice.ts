import { create } from "zustand";
import type { User, UserRole } from "@/types";
import { createClient } from "@/lib/supabase/client";

function avatarInitials(name: string | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2)
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  }
  const local = email.split("@")[0] || "";
  return local.slice(0, 2).toUpperCase() || "?";
}

function mapSupabaseUserToAppUser(
  id: string,
  email: string,
  userMetadata: Record<string, unknown> | undefined,
  roleOverride: UserRole
): User {
  const role = (userMetadata?.role as UserRole) || roleOverride;
  const name = (userMetadata?.name as string) || email.split("@")[0] || "User";
  const organisation = (userMetadata?.organisation as string) || "";
  return {
    id,
    name,
    email,
    organisation,
    role,
    ngo_id: userMetadata?.ngo_id as string | undefined,
    avatar_initials: avatarInitials(name, email),
    region_id: userMetadata?.region_id as string | undefined,
  };
}

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "forbidden";

interface AuthSlice {
  user: User | null;
  role: UserRole;
  status: AuthStatus;
  error: string | null;
  setRole: (role: UserRole) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthSlice>((set, get) => ({
  user: null,
  role: "analyst",
  status: "loading",
  error: null,
  setRole: (role) => set({ role }),
  clearError: () => set({ error: null }),

  setSession: (session) => {
    if (!session?.user) {
      set({ user: null, status: "unauthenticated" });
      return;
    }
    const { role } = get();
    const user = mapSupabaseUserToAppUser(
      session.user.id,
      session.user.email ?? "",
      session.user.user_metadata,
      role
    );
    set({ user, status: "authenticated", error: null });
  },

  login: async (email: string, password: string) => {
    set({ status: "authenticating", error: null });
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      set({
        status: "unauthenticated",
        error: error.message === "Invalid login credentials"
          ? "Invalid email or password."
          : error.message,
      });
      return;
    }
    if (data.session?.user) {
      get().setSession(data.session);
    } else {
      set({ status: "unauthenticated" });
    }
  },

  logout: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, status: "unauthenticated", role: "analyst", error: null });
  },
}));
