"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useInView } from "framer-motion";
import { spring, easeGentle } from "@/lib/animation-tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EarthAnimation = dynamic(() => import("@/components/landing/EarthAnimation").then((m) => m.EarthAnimation), { ssr: false });

const heroStagger = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

const heroStaggerH1 = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const CAPABILITIES = [
  {
    title: "INTELLIGENCE MAP",
    description:
      "Full-bleed operational map with real-time incident markers, drone telemetry, risk heatmaps, and settlement overlays across active conflict zones.",
  },
  {
    title: "HELIOS AGENT",
    description:
      "Natural language operational assistant that queries the intelligence picture, dispatches assets, and generates structured situation reports on demand.",
  },
  {
    title: "DRONE OPERATIONS",
    description:
      "Fleet-wide drone management — live positions, battery status, mission dispatch, flight path tracking, and reconnaissance coordination.",
  },
];

export default function Home() {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const capRef = useRef<HTMLDivElement>(null);
  const capInView = useInView(capRef, { once: true, margin: "-100px" });

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-page min-h-screen bg-background text-foreground">
      {/* Fixed globe — always visible, parallax on scroll */}
      <div className="fixed inset-0 z-0">
        <EarthAnimation scrollY={scrollY} />
      </div>
      <div className="relative z-10">
      <section className="relative flex min-h-screen flex-col items-start justify-center overflow-hidden pl-8 md:pl-16 lg:pl-24">
        <div className="relative z-10 flex flex-col items-start justify-center w-full max-w-md">
          <motion.div
            className="w-full"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.12,
                  delayChildren: 0.2,
                },
              },
            }}
            initial="hidden"
            animate="visible"
          >
            <motion.p
              variants={heroStagger}
              transition={easeGentle}
              className="font-impact text-[11px] tracking-[0.25em] uppercase text-primary mb-4 font-semibold"
            >
              Tribble
            </motion.p>
            <motion.h1
              variants={heroStaggerH1}
              transition={easeGentle}
              className="font-impact font-bold text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tight text-foreground mb-4"
            >
              Intelligence at the edge of crisis.
            </motion.h1>
            <motion.p
              variants={heroStagger}
              transition={easeGentle}
              className="font-impact text-lg text-foreground/90 mb-6 font-medium"
            >
              A unified operational picture for humanitarian response.
            </motion.p>
            <motion.div
              variants={heroStagger}
              transition={easeGentle}
              className="flex flex-col sm:flex-row items-start gap-4"
            >
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button className="bg-primary text-primary-foreground font-gov font-medium tracking-wider text-sm px-8 py-3 h-auto w-full sm:w-auto">
                  REQUEST ACCESS
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link href="/auth/signin">
                  <Button
                    variant="outline"
                    className="border-primary text-primary bg-transparent font-gov font-medium tracking-wider text-sm px-8 py-3 h-auto hover:bg-primary/10 w-full sm:w-auto"
                  >
                    SIGN IN
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section className="py-24 pl-8 md:pl-16 lg:pl-24 pr-8">
        <div className="max-w-md">
          <p className="font-impact font-bold text-lg text-foreground leading-relaxed text-left tracking-tight">
            Tribble provides a unified, real-time operational intelligence picture
            for humanitarian organisations operating in active conflict zones. It
            combines geospatial data, AI-driven analysis, and drone
            reconnaissance into a single, actionable interface.
          </p>
        </div>
      </section>

      <section ref={capRef} className="py-28 pl-8 md:pl-16 lg:pl-24 pr-8">
        <div className="max-w-md flex flex-col gap-8">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={cap.title}
              className="flex flex-col gap-1"
              initial={{ opacity: 0, y: 12 }}
              animate={capInView ? { opacity: 1, y: 0 } : {}}
              transition={{ ...easeGentle, delay: i * 0.06 }}
            >
              <h3 className="font-impact font-bold text-[11px] tracking-[0.25em] text-foreground uppercase">
                {cap.title}
              </h3>
              <p className="font-impact font-semibold text-[15px] text-foreground leading-[1.65] tracking-tight">
                {cap.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-24 px-6 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-xl mx-auto">
          <h2 className="font-heading font-bold text-xl tracking-wider text-foreground mb-8 text-center">
            REQUEST PLATFORM ACCESS
          </h2>
          {!formSubmitted ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setFormSubmitted(true);
              }}
            >
              <Input
                placeholder="Organisation Name"
                className="bg-card border-border font-body text-foreground placeholder:text-muted-foreground"
              />
              <Input
                placeholder="Contact Name"
                className="bg-card border-border font-body text-foreground placeholder:text-muted-foreground"
              />
              <Input
                type="email"
                placeholder="Email"
                className="bg-card border-border font-body text-foreground placeholder:text-muted-foreground"
              />
              <select className="w-full h-10 rounded-md border border-border bg-card px-3 py-2 text-sm font-body text-foreground">
                <option value="">Select Role</option>
                <option value="ngo_viewer">NGO</option>
                <option value="admin">Admin</option>
                <option value="individual">Individual</option>
              </select>
              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground font-heading font-semibold tracking-wider"
              >
                SUBMIT REQUEST
              </Button>
            </form>
          ) : (
            <motion.div
              className="text-center py-8"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
            >
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-2xl">✓</span>
              </div>
              <p className="font-body text-foreground">
                Request submitted successfully.
              </p>
              <p className="font-body text-sm text-muted-foreground mt-2">
                We will review your application within 48 hours.
              </p>
            </motion.div>
          )}
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="max-w-xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="font-mono text-xs text-primary tracking-widest">
                Tribble
              </p>
              <p className="font-body text-xs text-muted-foreground mt-1">
                Humanitarian Intelligence Platform
              </p>
            </div>
            <div className="flex items-center gap-6">
              {["Privacy Policy", "Terms of Use", "Security", "Contact"].map(
                (link) => (
                  <a
                    key={link}
                    href="#"
                    className="font-body text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link}
                  </a>
                )
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-[10px] text-muted-foreground">
                  All Systems Operational
                </span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                v2.4.1
              </span>
            </div>
          </div>
          <p className="text-center font-body text-[10px] text-muted-foreground mt-8">
            © 2024 Tribble. All rights reserved.
          </p>
        </div>
      </footer>
      </div>
    </div>
  );
}
