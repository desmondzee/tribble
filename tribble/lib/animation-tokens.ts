export const spring = {
  type: "spring",
  stiffness: 280,
  damping: 24,
} as const;

export const springFast = {
  type: "spring",
  stiffness: 400,
  damping: 30,
} as const;

export const easeSharp = { duration: 0.18, ease: [0.4, 0, 0.2, 1] } as const;
export const easeGentle = {
  duration: 0.35,
  ease: [0.25, 0.46, 0.45, 0.94],
} as const;
