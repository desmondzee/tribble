"use client";

import { motion } from "framer-motion";

export const ClassificationBanner = ({
  text = "UNCLASSIFIED // FOR AUTHORISED USE ONLY",
}: {
  text?: string;
}) => (
  <motion.div
    className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center h-6 bg-background/80 backdrop-blur-sm border-b border-border"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.5, duration: 0.5 }}
  >
    <p className="font-mono text-[10px] text-muted-foreground tracking-wider">
      {text}
    </p>
  </motion.div>
);
