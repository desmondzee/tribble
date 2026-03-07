"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { easeGentle } from "@/lib/animation-tokens";

export default function IndividualRegister() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => router.push("/app/submit"), 1500);
    }, 1500);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 rounded-full bg-hip-green/20 border border-hip-green/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✓</span>
          </div>
          <h2 className="font-heading text-lg tracking-wider text-foreground mb-2">
            ACCOUNT CREATED
          </h2>
          <p className="text-[12px] text-muted-foreground">
            Redirecting to submission portal…
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeGentle}
      >
        <div className="mb-8">
          <p className="font-mono text-primary text-xs tracking-widest mb-1">
            HIP
          </p>
          <p className="font-heading text-sm tracking-wider text-foreground">
            CREATE INDIVIDUAL ACCOUNT
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            Submit reports and receive safety updates for your region.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
                FIRST NAME
              </label>
              <Input
                className="bg-card border-border font-mono text-sm text-foreground h-9"
                placeholder="First"
                required
              />
            </div>
            <div>
              <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
                LAST NAME
              </label>
              <Input
                className="bg-card border-border font-mono text-sm text-foreground h-9"
                placeholder="Last"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
              COUNTRY / REGION
            </label>
            <select className="w-full bg-card border border-border rounded-sm px-3 py-2 font-mono text-[11px] text-foreground outline-none focus:border-primary/40 h-9">
              <option>Chad</option>
              <option>Niger</option>
              <option>Nigeria</option>
              <option>Cameroon</option>
              <option>Central African Republic</option>
            </select>
          </div>

          <div>
            <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
              PHONE (OPTIONAL)
            </label>
            <Input
              type="tel"
              className="bg-card border-border font-mono text-sm text-foreground h-9"
              placeholder="+235..."
            />
          </div>

          <div>
            <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
              EMAIL
            </label>
            <Input
              type="email"
              className="bg-card border-border font-mono text-sm text-foreground h-9"
              required
            />
          </div>

          <div>
            <label className="font-mono text-[9px] text-muted-foreground tracking-wider block mb-1">
              PASSWORD
            </label>
            <Input
              type="password"
              className="bg-card border-border font-mono text-sm text-foreground h-9"
              required
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              required
              className="w-4 h-4 accent-primary mt-0.5"
            />
            <span className="text-[10px] text-muted-foreground leading-relaxed">
              I understand my submissions will be reviewed before publication
            </span>
          </label>

          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground font-heading font-semibold tracking-wider h-10"
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "CREATE ACCOUNT"
            )}
          </Button>
        </form>

        <p className="text-[10px] text-muted-foreground mt-4 leading-relaxed">
          Individual accounts are for civilians in conflict zones submitting
          ground-level reports. Organisation access requires administrator
          approval.
        </p>

        <button
          type="button"
          onClick={() => router.push("/auth/signin")}
          className="mt-4 font-mono text-[10px] text-primary hover:text-primary/80 transition-colors"
        >
          ← BACK TO SIGN IN
        </button>
      </motion.div>
    </div>
  );
}
