"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authSlice";

/**
 * Initialises Supabase auth state and subscribes to session changes.
 * Renders nothing; run once inside the root layout so session is available everywhere.
 */
export function AuthSync() {
  const setSession = useAuthStore((s) => s.setSession);

  useEffect(() => {
    const supabase = createClient();

    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSession(session);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setSession]);

  return null;
}
