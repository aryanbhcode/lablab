"use client";

import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ReactNode, useEffect, useMemo, useState } from "react";

type HealthPayload = {
  status: string;
  timestamp: string;
  companies_monitored?: number;
  analyses_run?: number;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

function formatLastRun(timestamp: string) {
  if (!timestamp) {
    return "Last run unavailable";
  }

  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  if (minutes < 1) {
    return "Last run just now";
  }
  return `Last run ${minutes} min ago`;
}

export default function Layout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      if (!apiUrl) {
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) {
          return;
        }
        setHealth((await response.json()) as HealthPayload);
      } catch {
        setHealth(null);
      }
    }

    fetchHealth();
    const interval = window.setInterval(fetchHealth, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const statusText = useMemo(() => {
    const companies = health?.companies_monitored ?? 0;
    const analyses = health?.analyses_run ?? 0;
    return `${companies} companies monitored · ${analyses} analyses run`;
  }, [health]);

  return (
    <>
      <ProgressBar color="var(--accent)" height="2px" options={{ showSpinner: false }} shallowRouting />
      <nav className="fixed left-0 right-0 top-0 z-40 flex h-12 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 sm:px-6">
        <Link className="flex items-center gap-3" href="/">
          <span className="font-geist text-[15px] font-black text-[var(--accent)]">CTT</span>
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)] sm:inline">
            CORPORATE TRUTH TERMINAL
          </span>
        </Link>

        <div className="flex h-full items-center gap-5 text-[11px] font-bold uppercase tracking-[0.12em]">
          <Link
            className={`flex h-full items-center border-b-2 transition ${
              pathname === "/"
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
            href="/"
          >
            ANALYZE
          </Link>
          <Link
            className={`flex h-full items-center border-b-2 transition ${
              pathname === "/watchlist"
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
            href="/watchlist"
          >
            WATCHLIST
          </Link>
        </div>
      </nav>

      <AnimatePresence mode="wait">
        <motion.div key={pathname} className="min-h-screen pb-8 pt-12">
          {children}
        </motion.div>
      </AnimatePresence>

      <footer className="fixed bottom-0 left-0 right-0 z-40 grid h-8 grid-cols-2 items-center border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 text-[11px] text-[var(--text-tertiary)] md:grid-cols-3 md:px-6">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          Agent operational
        </div>
        <div className="hidden text-center md:block">{statusText}</div>
        <div className="text-right">{formatLastRun(health?.timestamp || "")}</div>
      </footer>
    </>
  );
}
