"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export default function MotionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const transition = reduced ? { duration: 0 } : { type: "tween" as const, duration: 0.45, ease: "easeInOut" as const };

  return (
    <>
      <div className="motion-field" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          className="relative z-10"
          exit={{ opacity: 0, y: 0, filter: "blur(8px)" }}
          initial={{ opacity: 0, y: 0, filter: "blur(8px)" }}
          key={pathname}
          transition={transition}
        >
          <motion.div
            animate={{ opacity: 0 }}
            className="page-transition-veil pointer-events-none fixed left-0 top-0 z-[60] h-screen w-screen"
            initial={{ opacity: 0.72 }}
            transition={reduced ? { duration: 0 } : { type: "tween", duration: 0.42, ease: "easeOut" }}
          />
          {children}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
