"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type Signal = {
  category: "gtm" | "financial" | "security";
  severity: "positive" | "warning" | "critical";
  title: string;
  detail: string;
  source: string;
};

type BattleMapEntry = {
  company: string;
  domain: string;
  truth_score: number;
  gtm_score: number;
  financial_score: number;
  security_score: number;
  gtm_summary: string;
  financial_summary: string;
  security_summary: string;
  signals: Signal[];
  data_quality?: {
    verified: boolean;
    warnings: string[];
  };
  rank: number;
  is_subject: boolean;
};

type BattleMapResult = {
  battle_map: BattleMapEntry[];
  winner: { company: string; domain: string; truth_score: number };
  biggest_threat: { company: string; domain: string; reason: string };
  market_summary: string;
  scraped_at: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const loadingMessages = [
  "→ Identifying top competitors via AI...",
  "→ Scraping all 5 companies simultaneously...",
  "→ Running Claude synthesis on each...",
  "→ Building battle map..."
];

function normalizeInput(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

function companyFromInput(value: string) {
  const normalized = normalizeInput(value);
  const base = normalized.includes(".") ? normalized.split(".")[0] : normalized;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function domainFromInput(value: string) {
  const normalized = normalizeInput(value).toLowerCase();
  if (normalized.includes(".")) {
    return normalized;
  }
  return `${normalized.replace(/\s+/g, "").replace(/[^a-z0-9-]/g, "")}.com`;
}

function scoreTone(score: number) {
  if (score >= 70) return "text-[#1D9E75]";
  if (score >= 45) return "text-[#F5A623]";
  return "text-red-500";
}

function barTone(score: number) {
  if (score >= 70) return "bg-[#1D9E75]";
  if (score >= 45) return "bg-[#F5A623]";
  return "bg-red-500";
}

function statusForScore(score: number) {
  if (score >= 75) return { label: "LEADING", className: "border-[#1D9E75]/40 bg-[#1D9E75]/10 text-[#1D9E75]" };
  if (score >= 50) return { label: "COMPETITIVE", className: "border-[#F5A623]/40 bg-[#F5A623]/10 text-[#F5A623]" };
  return { label: "AT RISK", className: "border-red-500/40 bg-red-500/10 text-red-400" };
}

function severityClass(severity: Signal["severity"]) {
  if (severity === "positive") return "border-[#1D9E75]/40 bg-[#1D9E75]/10 text-[#1D9E75]";
  if (severity === "warning") return "border-[#F5A623]/40 bg-[#F5A623]/10 text-[#F5A623]";
  return "border-red-500/40 bg-red-500/10 text-red-400";
}

function MetricCell({ value }: { value: number }) {
  return (
    <div className="min-w-[92px]">
      <div className={`text-sm font-bold ${scoreTone(value)}`}>{value}</div>
      <div className="mt-2 h-1.5 w-full bg-zinc-900">
        <div className={`h-full ${barTone(value)}`} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-zinc-900 px-5 sm:px-8">
      <div className="text-sm font-semibold text-zinc-100">CORPORATE TRUTH TERMINAL</div>
      <div className="flex items-center gap-5">
        <nav className="flex items-center gap-4 text-xs font-bold">
          <Link className="text-zinc-500 transition hover:text-zinc-300" href="/">ANALYZE</Link>
          <Link className="text-zinc-500 transition hover:text-zinc-300" href="/watchlist">WATCHLIST</Link>
          <Link className="text-[#1D9E75]" href="/battle-map">BATTLE MAP</Link>
        </nav>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1D9E75]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
          LIVE
        </div>
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <div className="border border-zinc-900 bg-black p-5 shadow-2xl shadow-black">
      <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3 text-xs text-zinc-500">
        <span>truth-terminal://battle-map</span>
        <span className="text-[#1D9E75]">60-90 SEC RUN</span>
      </div>
      <div className="min-h-40 space-y-3 text-sm text-[#1D9E75] sm:text-base">
        {loadingMessages.map((message, index) => (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="terminal-typewriter overflow-hidden whitespace-nowrap"
            initial={{ opacity: 0, x: -8 }}
            key={message}
            transition={{ type: "tween", duration: 0.2, delay: index * 1.2 }}
          >
            {message}
          </motion.div>
        ))}
      </div>
      <div className="mt-6 h-1.5 overflow-hidden bg-zinc-900">
        <motion.div
          animate={{ width: "92%" }}
          className="h-full bg-[#1D9E75]"
          initial={{ width: 0 }}
          transition={{ type: "tween", duration: 80, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export default function BattleMapPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BattleMapResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [watchlistProgress, setWatchlistProgress] = useState("");

  const derivedCompany = useMemo(() => companyFromInput(query), [query]);
  const derivedDomain = useMemo(() => domainFromInput(query), [query]);
  const qualityWarnings = result?.battle_map.flatMap((entry) =>
    entry.data_quality?.warnings.map((warning) => `${entry.company}: ${warning}`) || []
  ) || [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setWatchlistProgress("");

    if (!query.trim()) {
      setError("Enter a company or domain.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${apiUrl}/battle-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: derivedCompany, domain: derivedDomain })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Battle map failed.");
      }

      setResult((await response.json()) as BattleMapResult);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Battle map failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function addAllToWatchlist() {
    if (!result) return;
    setWatchlistProgress("Adding companies to watchlist...");
    let added = 0;

    for (const entry of result.battle_map) {
      try {
        await fetch(`${apiUrl}/watchlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: entry.company,
            domain: entry.domain,
            email: "alerts@truth-terminal.local"
          })
        });
        added += 1;
        setWatchlistProgress(`Added ${added}/${result.battle_map.length} companies to watchlist...`);
      } catch {
        setWatchlistProgress(`Added ${added}/${result.battle_map.length}; one entry failed.`);
      }
    }

    setWatchlistProgress(`Added ${added}/${result.battle_map.length} companies to watchlist.`);
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <Header />

      <section className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
        {!result && (
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 text-center">
              <p className="text-xs font-bold tracking-[0.3em] text-[#1D9E75]">COMPETITIVE WAR ROOM</p>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-100 sm:text-6xl">COMPETITOR BATTLE MAP</h1>
              <p className="mt-4 text-sm text-zinc-500">
                See how any company stacks up against its top competitors in real time.
              </p>
            </div>

            {!isLoading && (
              <form className="border border-zinc-900 bg-black p-5" onSubmit={handleSubmit}>
                <input
                  className="h-14 w-full border border-zinc-800 bg-[#0a0a0a] px-4 text-base text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="stripe.com or Stripe"
                  value={query}
                />
                <button
                  className="mt-4 h-14 w-full bg-[#1D9E75] text-sm font-bold text-black transition hover:bg-[#22ba8a] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  type="submit"
                >
                  ANALYZE MARKET
                </button>
              </form>
            )}

            {isLoading && <LoadingState />}
            {error && <p className="mt-5 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
              initial={{ opacity: 0, y: 10 }}
              key="battle-results"
              transition={{ type: "tween", duration: 0.24, ease: "easeOut" }}
            >
              <div>
                <p className="text-xs font-bold tracking-[0.3em] text-[#1D9E75]">BATTLE MAP</p>
                <h1 className="mt-3 text-4xl font-bold text-zinc-100">Market ranking</h1>
                <p className="mt-2 text-sm text-zinc-500">Scraped {new Date(result.scraped_at).toLocaleString()}</p>
                {qualityWarnings.length > 0 && (
                  <div className="mt-4 border border-[#F5A623]/40 bg-[#F5A623]/10 p-4 text-sm leading-6 text-[#F5A623]">
                    <strong>DATA QUALITY WARNING:</strong> Some scores are based on incomplete source data. Fix the source warnings below, then rerun the battle map.
                    <ul className="mt-2 list-disc pl-5">
                      {qualityWarnings.slice(0, 5).map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="overflow-x-auto border border-zinc-900 bg-black">
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead className="border-b border-zinc-900 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                    <tr>
                      <th className="p-4">Rank</th>
                      <th className="p-4">Company</th>
                      <th className="p-4">Truth</th>
                      <th className="p-4">GTM</th>
                      <th className="p-4">Financial</th>
                      <th className="p-4">Security</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.battle_map.map((entry, index) => {
                      const status = statusForScore(entry.truth_score);
                      return (
                        <motion.tr
                          animate={{ opacity: 1, y: 0 }}
                          className={`border-b border-zinc-900 transition hover:bg-zinc-950 ${entry.is_subject ? "border-l-4 border-l-[#1D9E75]" : "border-l-4 border-l-transparent"}`}
                          initial={{ opacity: 0, y: 8 }}
                          key={entry.domain}
                          transition={{ type: "tween", duration: 0.18, delay: index * 0.08 }}
                        >
                          <td className={`p-4 text-lg font-bold ${entry.rank === 1 ? "text-[#F5A623]" : "text-zinc-500"}`}>#{entry.rank}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-zinc-100">{entry.company}</span>
                              {entry.is_subject && <span className="border border-[#1D9E75]/40 px-2 py-1 text-[10px] font-bold text-[#1D9E75]">YOU</span>}
                              {entry.data_quality && !entry.data_quality.verified && <span className="border border-[#F5A623]/40 px-2 py-1 text-[10px] font-bold text-[#F5A623]">UNVERIFIED</span>}
                            </div>
                            <div className="mt-1 font-mono text-xs text-zinc-600">{entry.domain}</div>
                          </td>
                          <td className={`p-4 text-3xl font-bold ${scoreTone(entry.truth_score)}`}>{entry.truth_score}</td>
                          <td className="p-4"><MetricCell value={entry.gtm_score} /></td>
                          <td className="p-4"><MetricCell value={entry.financial_score} /></td>
                          <td className="p-4"><MetricCell value={entry.security_score} /></td>
                          <td className="p-4">
                            <span className={`inline-flex border px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="border border-[#1D9E75]/40 bg-black p-5">
                  <div className="text-xs font-bold text-[#1D9E75]">🏆 MARKET LEADER</div>
                  <p className="mt-4 text-2xl font-bold text-zinc-100">{result.winner.company}</p>
                  <p className="mt-1 text-sm text-zinc-500">{result.winner.truth_score} truth score</p>
                </div>
                <div className="border border-red-500/40 bg-black p-5">
                  <div className="text-xs font-bold text-red-400">⚔️ BIGGEST THREAT</div>
                  <p className="mt-4 text-2xl font-bold text-zinc-100">{result.biggest_threat.company}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">Reason: {result.biggest_threat.reason}</p>
                </div>
                <div className="border border-[#7C3AED]/40 bg-black p-5">
                  <div className="text-xs font-bold text-[#7C3AED]">📊 MARKET SUMMARY</div>
                  <p className="mt-4 text-sm leading-6 text-zinc-400">{result.market_summary}</p>
                </div>
              </section>

              <section>
                <h2 className="mb-4 text-xl font-bold text-zinc-100">SIGNAL COMPARISON</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  {result.battle_map.map((entry) => (
                    <div className="border border-zinc-900 bg-black p-4" key={`signals-${entry.domain}`}>
                      <h3 className="font-bold text-zinc-100">{entry.company}</h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {entry.signals.slice(0, 3).map((signal, index) => (
                          <span
                            className={`border px-2 py-1 text-[10px] font-bold ${severityClass(signal.severity)}`}
                            key={`${entry.domain}-${signal.title}-${index}`}
                            title={signal.detail}
                          >
                            {signal.title}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="space-y-3">
                <button
                  className="h-14 w-full border border-[#1D9E75] bg-transparent text-sm font-bold text-[#1D9E75] transition hover:bg-[#1D9E75] hover:text-black"
                  onClick={addAllToWatchlist}
                  type="button"
                >
                  ADD ALL TO WATCHLIST
                </button>
                {watchlistProgress && <p className="text-center text-sm text-[#1D9E75]">{watchlistProgress}</p>}
                <button
                  className="h-14 w-full border border-zinc-800 bg-black text-sm font-bold text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100"
                  onClick={() => {
                    setQuery("");
                    setResult(null);
                    setError("");
                    setWatchlistProgress("");
                  }}
                  type="button"
                >
                  ANALYZE ANOTHER MARKET
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  );
}
