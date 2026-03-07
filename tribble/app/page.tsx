"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, useInView } from "framer-motion";
import { Map, Brain, Navigation } from "lucide-react";
import { spring, easeGentle } from "@/lib/animation-tokens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClassificationBanner } from "@/components/shared/ClassificationBanner";
import { StatCounter } from "@/components/landing/StatCounter";

const GlobeCanvas = dynamic(() => import("@/components/landing/GlobeCanvas").then((m) => m.GlobeCanvas), { ssr: false });

const CAPABILITIES = [
  {
    icon: Map,
    title: "INTELLIGENCE MAP",
    description:
      "Full-bleed operational map with real-time incident markers, drone telemetry, risk heatmaps, and settlement overlays across active conflict zones.",
  },
  {
    icon: Brain,
    title: "HELIOS AGENT",
    description:
      "Natural language operational assistant that queries the intelligence picture, dispatches assets, and generates structured situation reports on demand.",
  },
  {
    icon: Navigation,
    title: "DRONE OPERATIONS",
    description:
      "Fleet-wide drone management — live positions, battery status, mission dispatch, flight path tracking, and reconnaissance coordination.",
  },
];

const PARTNERS = ["RELIEF.IO", "AID NEXUS", "CIVITAS", "MEDFRONT", "GROUNDLINK"];

export default function Home() {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const capRef = useRef<HTMLDivElement>(null);
  const capInView = useInView(capRef, { once: true, margin: "-100px" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden">
        <ClassificationBanner />
        <div className="absolute inset-0 z-0 flex items-center justify-center">
          <GlobeCanvas />
        </div>
        <motion.div
          className="relative z-10 px-6 text-center max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeGentle}
        >
          <p className="font-mono text-[11px] tracking-widest text-primary mb-4">
            HIP
          </p>
          <h1 className="font-heading font-bold text-5xl md:text-7xl tracking-tight text-foreground mb-4">
            Intelligence at the edge of crisis.
          </h1>
          <p className="font-body text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            A unified operational picture for humanitarian response.
          </p>
          <div className="flex items-center justify-center gap-4">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button className="bg-primary text-primary-foreground font-heading font-semibold tracking-wider text-sm px-8 py-3 h-auto">
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
                  className="border-primary text-primary bg-transparent font-heading font-semibold tracking-wider text-sm px-8 py-3 h-auto hover:bg-primary/10"
                >
                  SIGN IN
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>
        <div className="absolute bottom-6 right-6 z-10">
          <motion.p
            className="font-mono text-[11px] text-primary tracking-wider"
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            2,841 INCIDENTS TRACKED
          </motion.p>
        </div>
        <div className="absolute bottom-6 left-6 z-10">
          <p className="font-mono text-[10px] text-muted-foreground tracking-wider">
            UNCLASSIFIED // FOR AUTHORISED USE ONLY
          </p>
        </div>
      </section>

      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto text-center">
          <p className="font-body text-lg text-muted-foreground mb-12 leading-relaxed">
            HIP provides a unified, real-time operational intelligence picture
            for humanitarian organisations operating in active conflict zones. It
            combines geospatial data, AI-driven analysis, and drone
            reconnaissance into a single, actionable interface.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <StatCounter value={2841} label="Incidents Tracked" />
            <StatCounter value={120} label="Settlements Monitored" />
            <StatCounter value={5} label="Partner Organisations" />
          </div>
        </div>
      </section>

      <section ref={capRef} className="py-24 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={cap.title}
              className="bg-popover border border-border rounded-sm overflow-hidden"
              initial={{ opacity: 0, y: 30 }}
              animate={capInView ? { opacity: 1, y: 0 } : {}}
              transition={{ ...easeGentle, delay: i * 0.15 }}
            >
              <div className="h-[3px] bg-primary" />
              <div className="p-6">
                <cap.icon className="w-6 h-6 text-primary mb-4" />
                <h3 className="font-heading font-bold text-sm tracking-wider text-foreground mb-3">
                  {cap.title}
                </h3>
                <p className="font-body text-sm text-muted-foreground leading-relaxed">
                  {cap.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="py-12 border-t border-border overflow-hidden">
        <div className="relative">
          <div className="animate-marquee flex gap-12 whitespace-nowrap">
            {[...PARTNERS, ...PARTNERS, ...PARTNERS].map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="font-mono text-sm text-muted-foreground border border-border rounded-sm px-6 py-2 inline-block"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-md mx-auto">
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
                <option value="ngo_viewer">NGO Viewer</option>
                <option value="analyst">Analyst</option>
                <option value="admin">Admin</option>
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
              <div className="w-12 h-12 rounded-full bg-hip-green/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-hip-green text-2xl">✓</span>
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

      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="font-mono text-xs text-primary tracking-widest">
                HIP
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
                <span className="w-2 h-2 rounded-full bg-hip-green animate-pulse" />
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
            © 2024 HIP. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
