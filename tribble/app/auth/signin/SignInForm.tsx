"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authSlice";
import { easeGentle } from "@/lib/animation-tokens";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, login, setRole, user } = useAuthStore();
  const [email, setEmail] = useState("sarah.chen@relief.io");
  const [password, setPassword] = useState("••••••••");
  const [selectedRole, setSelectedRole] = useState<"ngo_viewer" | "admin" | "individual">("ngo_viewer");

  useEffect(() => {
    const role = searchParams.get("role");
    if (role === "admin") {
      setRole("admin");
      setSelectedRole("admin");
    } else if (role === "ngo") {
      setRole("ngo_viewer");
      setSelectedRole("ngo_viewer");
    } else if (role === "individual") {
      setRole("individual");
      setSelectedRole("individual");
    }
  }, [searchParams, setRole]);

  useEffect(() => {
    if (status === "authenticated" && user) {
      if (user.role === "individual") router.push("/app/submit");
      else router.push("/app/map");
    }
  }, [status, user, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setRole(selectedRole);
    login();
  };

  if (status === "forbidden") {
    return (
      <div className="landing-page min-h-screen bg-background flex items-center justify-center">
        <div className="border-2 border-destructive rounded-sm p-12 text-center max-w-md">
          <h1 className="font-heading font-bold text-2xl text-destructive tracking-wider mb-4">
            ACCESS RESTRICTED
          </h1>
          <p className="font-body text-muted-foreground">
            Your credentials do not have authorised access to this platform.
            Contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-page min-h-screen bg-background flex">
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={easeGentle}
        >
          <div className="mb-10">
            <p className="font-gov text-[11px] tracking-[0.2em] uppercase text-primary mb-1">
              Tribble
            </p>
            <p className="font-gov text-lg text-muted-foreground font-normal">
              Humanitarian Intelligence Platform
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-heading text-xs tracking-wider text-muted-foreground uppercase block mb-2">
                Account type
              </label>
              <select
                value={selectedRole}
                onChange={(e) => {
                  const r = e.target.value as "ngo_viewer" | "admin" | "individual";
                  setSelectedRole(r);
                  setRole(r);
                }}
                className="w-full h-11 rounded-md border border-border bg-card px-3 py-2 text-sm font-body text-foreground"
                disabled={status === "authenticating"}
              >
                <option value="ngo_viewer">NGO</option>
                <option value="admin">Admin</option>
                <option value="individual">Individual</option>
              </select>
            </div>
            <div>
              <label className="font-heading text-xs tracking-wider text-muted-foreground uppercase block mb-2">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-card border-border font-body text-foreground placeholder:text-muted-foreground"
                disabled={status === "authenticating"}
              />
            </div>
            <div>
              <label className="font-heading text-xs tracking-wider text-muted-foreground uppercase block mb-2">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-card border-border font-body text-foreground placeholder:text-muted-foreground"
                disabled={status === "authenticating"}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-primary text-primary-foreground font-gov font-medium tracking-wider text-sm px-8 py-3 h-auto"
              disabled={status === "authenticating"}
            >
              {status === "authenticating" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "SIGN IN"
              )}
            </Button>
          </form>

          <p className="font-body text-xs text-muted-foreground mt-6">
            Forgot password?{" "}
            <span className="text-foreground">
              Contact your platform administrator.
            </span>
          </p>

          <div className="mt-8 pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="font-mono text-[10px] text-muted-foreground tracking-wider">
                OR
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <p className="font-heading text-xs tracking-wider text-foreground mb-1">
              NEW TO Tribble?
            </p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Submit reports and receive safety updates for your region.
            </p>
            <Button
              variant="outline"
              className="w-full border-primary text-primary bg-transparent font-gov font-medium tracking-wider text-sm px-8 py-3 h-auto hover:bg-primary/10"
              onClick={() => router.push("/auth/register/individual")}
            >
              CREATE INDIVIDUAL ACCOUNT
            </Button>
            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              Individual accounts are for civilians in conflict zones submitting
              ground-level reports. Organisation access requires administrator
              approval.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 relative overflow-hidden bg-card border-l border-border items-center justify-center">
        <DotGrid />
        <div className="relative z-10 text-center">
          <p className="font-heading font-bold text-2xl tracking-wider text-foreground mb-2">
            OPERATIONAL
          </p>
          <p className="font-heading font-bold text-2xl tracking-wider text-foreground mb-2">
            INTELLIGENCE
          </p>
          <p className="font-heading font-bold text-2xl tracking-wider text-primary">
            SYSTEM
          </p>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center h-8 bg-background/80 backdrop-blur-sm border-t border-border">
        <p className="font-mono text-[10px] text-muted-foreground tracking-wider">
          AUTHORISED ACCESS ONLY — UNAUTHORISED ACCESS IS PROHIBITED
        </p>
      </div>
    </div>
  );
}

function DotGrid() {
  const dots = [];
  for (let x = 0; x < 20; x++) {
    for (let y = 0; y < 20; y++) {
      dots.push(
        <motion.circle
          key={`${x}-${y}`}
          cx={x * 30 + 15}
          cy={y * 30 + 15}
          r={1.5}
          fill="hsl(150 55% 50%)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.6, 0] }}
          transition={{
            duration: 3,
            delay: (x + y) * 0.1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      );
    }
  }
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox="0 0 600 600"
      preserveAspectRatio="xMidYMid slice"
    >
      {dots}
    </svg>
  );
}
