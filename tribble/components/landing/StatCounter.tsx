"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";

interface StatCounterProps {
  value: number;
  label: string;
}

export const StatCounter = ({ value, label }: StatCounterProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const duration = 2000;
    const increment = value / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, value]);

  return (
    <motion.div ref={ref} className="text-center">
      <p className="font-mono text-3xl md:text-4xl font-medium text-primary">
        {count.toLocaleString()}
      </p>
      <p className="font-heading text-xs tracking-wider text-muted-foreground mt-2 uppercase">
        {label}
      </p>
    </motion.div>
  );
};
