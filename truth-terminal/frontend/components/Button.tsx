"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "purple";

type ButtonProps = Omit<HTMLMotionProps<"button">, "children" | "whileHover" | "whileTap"> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent)] text-black border border-[var(--accent)] hover:brightness-110 disabled:hover:brightness-100",
  secondary:
    "bg-transparent text-[var(--accent)] border border-[var(--border-default)] hover:border-[var(--accent)] hover:bg-[var(--accent-dim)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] border border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
  danger:
    "bg-transparent text-[var(--red)] border border-transparent hover:bg-[#FF444414]",
  purple:
    "bg-transparent text-[var(--purple)] border border-[var(--border-default)] hover:border-[var(--purple)] hover:bg-[var(--purple-dim)]"
};

export default function Button({ children, className = "", variant = "primary", ...props }: ButtonProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      className={`inline-flex h-10 items-center justify-center rounded-[4px] px-4 text-[11px] font-bold uppercase tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      whileHover={
        reduceMotion
          ? undefined
          : {
              scale: 1.01,
              boxShadow: variant === "primary" ? "var(--accent-glow)" : undefined
            }
      }
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
