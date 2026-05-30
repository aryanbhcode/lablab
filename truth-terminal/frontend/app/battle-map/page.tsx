"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

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
  if (score >= 70) return "text-[#c084fc]";
  if (score >= 45) return "text-[#F5A623]";
  return "text-red-500";
}

function barTone(score: number) {
  if (score >= 70) return "bg-[#c084fc]";
  if (score >= 45) return "bg-[#F5A623]";
  return "bg-red-500";
}

function statusForScore(score: number) {
  if (score >= 75) return { label: "LEADING", className: "border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]" };
  if (score >= 50) return { label: "COMPETITIVE", className: "border-[#F5A623]/40 bg-[#F5A623]/10 text-[#F5A623]" };
  return { label: "AT RISK", className: "border-red-500/40 bg-red-500/10 text-red-400" };
}

function severityClass(severity: Signal["severity"]) {
  if (severity === "positive") return "border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]";
  if (severity === "warning") return "border-[#F5A623]/40 bg-[#F5A623]/10 text-[#F5A623]";
  return "border-red-500/40 bg-red-500/10 text-red-400";
}

function MetricCell({ value }: { value: number }) {
  return (
    <div className="min-w-[92px]">
      <div className={`text-sm font-bold ${scoreTone(value)}`}>{value}</div>
      <div className="mt-2 h-1.5 w-full bg-[#4f3f78]">
        <div className={`h-full ${barTone(value)}`} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="institutional-header sticky top-0 z-20 flex min-h-[92px] items-center justify-between px-6 sm:px-12">
      <div>
        <div className="text-lg font-black tracking-[0.28em] text-white">CORPORATE TRUTH TERMINAL</div>
        <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#cfc4e9]">
          Public web intelligence for company risk
        </div>
      </div>
      <div className="flex items-center gap-5">
        <nav className="flex items-center gap-4 text-xs font-bold">
          <Link className="text-[#cfc4e9] transition hover:text-[#2f4445]" href="/">ANALYZE</Link>
          <Link className="text-[#cfc4e9] transition hover:text-[#2f4445]" href="/watchlist">WATCHLIST</Link>
          <Link className="text-[#f4c95d]" href="/battle-map">BATTLE MAP</Link>
        </nav>
        <div className="flex items-center gap-2 text-xs font-semibold text-[#f4c95d]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#f4c95d]" />
          LIVE
        </div>
      </div>
    </header>
  );
}

function LoadingState({ stage }: { stage: number }) {
  const visibleMessages = loadingMessages.slice(0, Math.max(1, Math.min(stage + 1, loadingMessages.length)));
  const progressRatio = Math.max(0.12, Math.min((stage + 1) / loadingMessages.length, 0.96));
  const processedCompanies = Math.max(1, Math.min(5, Math.ceil(progressRatio * 5)));

  return (
    <div className="progress-lab p-6 sm:p-8">
      <div className="relative z-10 mb-8 flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-[#c6c0b2]">
        <span>truth-terminal://battle-map</span>
        <span className="text-[#f4c95d]">60-90 sec run</span>
      </div>
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="min-w-0">
          <div className="progress-track">
            <motion.div
              animate={{ width: `${progressRatio * 100}%` }}
              className="h-full rounded-full bg-gradient-to-r from-[#5b21b6] to-[#9b5cff]"
              initial={{ width: 0 }}
              transition={{ type: "tween", duration: 0.7, ease: "easeOut" }}
            />
          </div>
          <div className="mt-12 flex items-center">
            {[1, 2, 3, 4, 5].map((step) => (
              <div className="flex flex-1 items-center" key={step}>
                <div className={`step-node ${step === processedCompanies ? "active" : ""}`}>{step < processedCompanies ? "✓" : step}</div>
                {step < 5 && <div className="h-0.5 flex-1 bg-[#f4c95d]/70" />}
              </div>
            ))}
          </div>
          <div className="scan-orbit mt-12 overflow-hidden border border-white/10 bg-black/25">
            <span className="scan-dot" />
            <span className="scan-dot" />
            <span className="scan-dot" />
            <span className="scan-beam" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#c6c0b2]">Parallel market scan</div>
                <div className="mt-1 text-xs text-[#c6c0b2]">Subject + 4 competitors</div>
              </div>
              <div className="text-3xl font-black text-[#f4c95d]">{processedCompanies}/5</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          {visibleMessages.map((message, index) => (
            <motion.div
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              className="break-words text-sm leading-7 text-[#fffaf0]"
              initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
              key={message}
              transition={{ type: "tween", duration: 0.32, delay: index * 0.24, ease: "easeOut" }}
            >
              <span className="text-[#f4c95d]">{message.slice(0, 1)}</span>{message.slice(1)}
            </motion.div>
          ))}
          <div className="pt-4">
            <div className="loading-data-line h-2 w-[72%] rounded-full bg-[#f4c95d]" />
            <div className="loading-data-line mt-5 h-2 w-[94%] rounded-full bg-white/85" />
            <div className="loading-data-line mt-5 h-2 w-[62%] rounded-full bg-[#9b5cff]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BattleMapPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<BattleMapResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState(0);
  const [watchlistProgress, setWatchlistProgress] = useState("");

  const derivedCompany = useMemo(() => companyFromInput(query), [query]);
  const derivedDomain = useMemo(() => domainFromInput(query), [query]);
  const qualityWarnings = result?.battle_map.flatMap((entry) =>
    entry.data_quality?.warnings.map((warning) => `${entry.company}: ${warning}`) || []
  ) || [];

  useEffect(() => {
    if (!isLoading) {
      setLoadingStage(0);
      return;
    }

    setLoadingStage(0);
    const interval = window.setInterval(() => {
      setLoadingStage((current) => {
        if (current >= loadingMessages.length - 1) {
          window.clearInterval(interval);
          return current;
        }
        return current + 1;
      });
    }, 2600);

    return () => window.clearInterval(interval);
  }, [isLoading]);

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
    <main className="institutional-shell min-h-screen">
      <Header />

      <section className="mx-auto w-full max-w-7xl px-6 py-12 sm:px-12">
        {!result && (
          <div className={`grid min-w-0 items-stretch gap-10 ${isLoading ? "" : "lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]"}`}>
            <div className="py-8">
              <p className="institutional-section-label">Competitive war room</p>
              <h1 className="mt-5 text-5xl font-black leading-[1] tracking-tight text-[#f6f0ff] sm:text-7xl">Competitor battle map</h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#cfc4e9]">
                See how any company stacks up against its top competitors in real time.
              </p>

              {!isLoading && (
                <form className="institutional-card mt-10 grid gap-3 p-3 sm:grid-cols-[1fr_auto]" onSubmit={handleSubmit}>
                  <input
                    className="institutional-field h-16 px-5 text-base outline-none transition placeholder:text-[#9484b8]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="stripe.com or Stripe"
                    value={query}
                  />
                  <button
                    className="cosmic-cta h-16 px-8 text-sm font-black uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isLoading}
                    type="submit"
                  >
                    Analyze market
                  </button>
                </form>
              )}

              {isLoading && <LoadingState stage={loadingStage} />}
              {error && <p className="mt-5 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
            </div>

            {!isLoading && <div className="institutional-hero-panel relative min-w-0 overflow-hidden p-10">
              <span className="cosmic-spark left-[18%] top-[18%] h-2 w-2" />
              <span className="cosmic-spark right-[34%] top-[22%] h-1.5 w-1.5" />
              <span className="cosmic-orb right-[20%] top-[30%] h-24 w-24" />
              <span className="cosmic-orb bottom-[18%] left-[15%] h-14 w-14" />
              <div className="relative z-10 max-w-[70%]">
                <p className="text-xs font-black uppercase tracking-[0.26em] text-[#f4c95d]">Market structure</p>
                <h2 className="mt-8 text-4xl font-black leading-tight text-white">Five-company field view, one winner, one threat vector.</h2>
                <p className="mt-8 text-sm leading-7 text-white/75">This panel now explains what Battle Map does: competitor discovery, parallel scans, ranked scores, and threat reasoning in one competitive readout.</p>
              </div>
            </div>}
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
                <p className="text-xs font-bold tracking-[0.3em] text-[#c084fc]">BATTLE MAP</p>
                <h1 className="mt-3 text-5xl font-black text-[#f6f0ff]">Competitive arena</h1>
                <p className="mt-2 text-sm text-[#cfc4e9]">Scraped {new Date(result.scraped_at).toLocaleString()}</p>
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

              <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="institutional-card relative overflow-hidden p-6">
                  <div className="relative z-10">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f4c95d]">Market leader</p>
                    <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-5xl font-black text-white">{result.winner.company}</h2>
                        <p className="mt-2 font-mono text-sm text-[#c6c0b2]">{result.winner.domain}</p>
                      </div>
                      <div className="solar-score flex h-40 w-40 shrink-0 items-center justify-center self-center text-center sm:self-auto">
                        <span className="solar-moon" />
                        <div className="relative z-10">
                          <div className="text-6xl font-black leading-none text-[#f4c95d]">{result.winner.truth_score}</div>
                          <div className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#c6c0b2]">truth score</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="institutional-card p-6">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-red-400">Threat vector</p>
                  <h3 className="mt-5 text-3xl font-black text-white">{result.biggest_threat.company}</h3>
                  <p className="mt-4 text-sm leading-7 text-[#c6c0b2]">{result.biggest_threat.reason}</p>
                </div>
              </section>

              <div className="overflow-x-auto border border-[#4f3f78] bg-white">
                <table className="w-full min-w-[880px] border-collapse text-left">
                  <thead className="border-b border-[#4f3f78] text-[10px] font-bold uppercase tracking-[0.2em] text-[#9484b8]">
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
                          className={`border-b border-[#4f3f78] transition hover:bg-[#171126] ${entry.is_subject ? "border-l-4 border-l-[#1D9E75]" : "border-l-4 border-l-transparent"}`}
                          initial={{ opacity: 0, y: 8 }}
                          key={entry.domain}
                          transition={{ type: "tween", duration: 0.18, delay: index * 0.08 }}
                        >
                          <td className={`p-4 text-lg font-bold ${entry.rank === 1 ? "text-[#F5A623]" : "text-[#cfc4e9]"}`}>#{entry.rank}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#f6f0ff]">{entry.company}</span>
                              {entry.is_subject && <span className="border border-[#c084fc]/40 px-2 py-1 text-[10px] font-bold text-[#c084fc]">YOU</span>}
                              {entry.data_quality && !entry.data_quality.verified && <span className="border border-[#F5A623]/40 px-2 py-1 text-[10px] font-bold text-[#F5A623]">UNVERIFIED</span>}
                            </div>
                            <div className="mt-1 font-mono text-xs text-[#9484b8]">{entry.domain}</div>
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
                <div className="border border-[#c084fc]/40 bg-white p-5">
                  <div className="text-xs font-bold text-[#c084fc]">🏆 MARKET LEADER</div>
                  <p className="mt-4 text-2xl font-bold text-[#f6f0ff]">{result.winner.company}</p>
                  <p className="mt-1 text-sm text-[#cfc4e9]">{result.winner.truth_score} truth score</p>
                </div>
                <div className="border border-red-500/40 bg-white p-5">
                  <div className="text-xs font-bold text-red-400">⚔️ BIGGEST THREAT</div>
                  <p className="mt-4 text-2xl font-bold text-[#f6f0ff]">{result.biggest_threat.company}</p>
                  <p className="mt-2 text-sm leading-6 text-[#cfc4e9]">Reason: {result.biggest_threat.reason}</p>
                </div>
                <div className="border border-[#9b5cff]/40 bg-white p-5">
                  <div className="text-xs font-bold text-[#9b5cff]">📊 MARKET SUMMARY</div>
                  <p className="mt-4 text-sm leading-6 text-[#cfc4e9]">{result.market_summary}</p>
                </div>
              </section>

              <section>
                <h2 className="mb-4 text-xl font-bold text-[#f6f0ff]">SIGNAL COMPARISON</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
                  {result.battle_map.map((entry) => (
                    <div className="border border-[#4f3f78] bg-white p-4" key={`signals-${entry.domain}`}>
                      <h3 className="font-bold text-[#f6f0ff]">{entry.company}</h3>
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
                  className="h-14 w-full border border-[#c084fc] bg-transparent text-sm font-bold text-[#c084fc] transition hover:bg-[#c084fc] hover:text-white"
                  onClick={addAllToWatchlist}
                  type="button"
                >
                  ADD ALL TO WATCHLIST
                </button>
                {watchlistProgress && <p className="text-center text-sm text-[#c084fc]">{watchlistProgress}</p>}
                <button
                  className="h-14 w-full border border-[#4f3f78] bg-white text-sm font-bold text-[#cfc4e9] transition hover:border-[#aebbb1] hover:text-[#f6f0ff]"
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
