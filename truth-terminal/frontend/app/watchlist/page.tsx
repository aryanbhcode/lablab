"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type WatchlistEntry = {
  id: number;
  company: string;
  domain: string;
  email: string;
  created_at: string;
};

type EnrichedWatchlistEntry = WatchlistEntry & {
  last_analyzed_at?: string;
  scraped_at?: string;
};

type Prediction = {
  timeframe: "30 days" | "60 days" | "90 days";
  category: "gtm" | "financial" | "security";
  prediction: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  signal_direction: "positive" | "negative" | "neutral";
};

type PredictionsResult = {
  predictions: Prediction[];
  overall_trajectory?: string;
  biggest_risk?: string;
  biggest_opportunity?: string;
  confidence?: string;
  message?: string;
  error?: string;
};

type QueryResponse = {
  chunk?: string;
  done?: boolean;
};

type QueryHistory = {
  question: string;
  answer: string;
  asked_at: string;
};

type SentinelResult = {
  risk_level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  domain: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const exampleQuestions = [
  "Which company is most at risk right now?",
  "Which of my companies shows the strongest buying signals?",
  "Where should I focus my sales team this week?",
  "Which company is most likely to have a security incident?",
  "Compare the financial health of all monitored companies",
  "Which company is closest to a major announcement?"
];

function inferDomain(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return trimmed.includes(".") ? trimmed : "";
}

function formatTimestamp(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function lastAnalyzed(entry: WatchlistEntry) {
  const enriched = entry as EnrichedWatchlistEntry;
  return enriched.last_analyzed_at || enriched.scraped_at || "";
}

function predictionArrow(direction: Prediction["signal_direction"]) {
  if (direction === "positive") {
    return "↑";
  }
  if (direction === "negative") {
    return "↓";
  }
  return "→";
}

function categoryIcon(category: Prediction["category"]) {
  if (category === "gtm") {
    return "GTM";
  }
  if (category === "financial") {
    return "$";
  }
  return "SEC";
}

function sentinelBadgeClass(riskLevel?: SentinelResult["risk_level"]) {
  if (riskLevel === "CRITICAL") {
    return "border-red-500/50 bg-red-500/10 text-red-400";
  }
  if (riskLevel === "HIGH") {
    return "border-orange-500/50 bg-orange-500/10 text-orange-400";
  }
  if (riskLevel === "ELEVATED") {
    return "border-amber-400/50 bg-amber-400/10 text-amber-400";
  }
  if (riskLevel === "LOW") {
    return "border-[#1D9E75]/40 bg-[#1D9E75]/10 text-[#1D9E75]";
  }
  return "border-zinc-800 bg-zinc-950 text-zinc-600";
}

function PredictionsPanel({ predictions }: { predictions: PredictionsResult }) {
  if (predictions.message) {
    return <p className="mt-4 border border-[#7C3AED]/40 bg-black p-4 text-sm text-zinc-500">{predictions.message}</p>;
  }

  return (
    <div className="mt-5 border border-[#7C3AED]/40 bg-[#08060d] p-4">
      <div className="mb-4 flex items-center gap-3">
        <h4 className="text-sm font-bold text-zinc-100">PREDICTIVE INTELLIGENCE</h4>
        <span className="border border-[#7C3AED]/40 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">LIVE</span>
      </div>

      {predictions.overall_trajectory && (
        <div className="mb-4 border border-[#7C3AED]/40 bg-[#12091f] p-4">
          <div className="text-[10px] font-bold text-[#7C3AED]">OVERALL TRAJECTORY</div>
          <p className="mt-2 text-sm font-bold leading-6 text-zinc-100">{predictions.overall_trajectory}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {predictions.predictions.slice(0, 3).map((prediction, index) => (
          <div className="border border-[#7C3AED]/40 bg-black p-4" key={`${prediction.timeframe}-${index}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="border border-[#7C3AED]/50 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">
                  {prediction.timeframe}
                </span>
                <span className="border border-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-500">
                  {categoryIcon(prediction.category)}
                </span>
              </div>
              <span className="text-xl font-bold text-[#7C3AED]">{predictionArrow(prediction.signal_direction)}</span>
            </div>
            <p className="mt-3 text-sm font-bold leading-6 text-zinc-100">{prediction.prediction}</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{prediction.reasoning}</p>
            <div className="mt-3 inline-flex border border-[#7C3AED]/40 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">
              {prediction.confidence.toUpperCase()} CONFIDENCE
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border border-red-500/40 bg-black p-4">
          <div className="text-[10px] font-bold text-red-500">⚠️ BIGGEST RISK</div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">{predictions.biggest_risk}</p>
        </div>
        <div className="border border-[#1D9E75]/40 bg-black p-4">
          <div className="text-[10px] font-bold text-[#1D9E75]">🚀 BIGGEST OPPORTUNITY</div>
          <p className="mt-2 text-xs leading-5 text-zinc-400">{predictions.biggest_opportunity}</p>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-zinc-600">Predictions based on pattern analysis. Not financial advice.</p>
    </div>
  );
}

export default function WatchlistPage() {
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [email, setEmail] = useState("");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [formMessage, setFormMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [listError, setListError] = useState("");
  const [removingCompany, setRemovingCompany] = useState("");
  const [expandedDomain, setExpandedDomain] = useState("");
  const [loadingPredictionDomain, setLoadingPredictionDomain] = useState("");
  const [predictionsByDomain, setPredictionsByDomain] = useState<Record<string, PredictionsResult>>({});
  const [predictionErrorsByDomain, setPredictionErrorsByDomain] = useState<Record<string, string>>({});
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentResponse, setAgentResponse] = useState("");
  const [agentAskedAt, setAgentAskedAt] = useState("");
  const [agentError, setAgentError] = useState("");
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);
  const [queryHistory, setQueryHistory] = useState<QueryHistory[]>([]);
  const [showQueryHistory, setShowQueryHistory] = useState(false);
  const [expandedQuery, setExpandedQuery] = useState("");
  const [sentinelByDomain, setSentinelByDomain] = useState<Record<string, SentinelResult>>({});

  const inferredDomain = useMemo(() => inferDomain(company), [company]);
  const resolvedDomain = useMemo(() => domain.trim() || inferDomain(company), [company, domain]);

  const fetchWatchlist = useCallback(async () => {
    setListError("");

    try {
      const response = await fetch(`${apiUrl}/watchlist`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to load watchlist.");
      }

      const payload = (await response.json()) as WatchlistEntry[];
      setEntries(payload);
    } catch (caughtError) {
      setListError(caughtError instanceof Error ? caughtError.message : "Failed to load watchlist.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
    const interval = window.setInterval(fetchWatchlist, 30000);

    return () => window.clearInterval(interval);
  }, [fetchWatchlist]);

  const fetchQueryHistory = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/query/history`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { queries: QueryHistory[] };
      setQueryHistory(payload.queries || []);
    } catch {
      setQueryHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchQueryHistory();
  }, [fetchQueryHistory]);

  useEffect(() => {
    const missingEntries = entries.filter((entry) => !sentinelByDomain[entry.domain]);
    if (missingEntries.length === 0) {
      return;
    }

    let cancelled = false;

    async function fetchSentinelBadges() {
      const results = await Promise.all(
        missingEntries.map(async (entry) => {
          try {
            const response = await fetch(`${apiUrl}/sentinel/${encodeURIComponent(entry.domain)}`);
            if (!response.ok) {
              return null;
            }
            return [entry.domain, (await response.json()) as SentinelResult] as const;
          } catch {
            return null;
          }
        })
      );

      if (cancelled) {
        return;
      }

      setSentinelByDomain((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result) {
            next[result[0]] = result[1];
          }
        }
        return next;
      });
    }

    fetchSentinelBadges();

    return () => {
      cancelled = true;
    };
  }, [entries, sentinelByDomain]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setFormMessage("");

    const nextCompany = company.trim();
    const nextDomain = resolvedDomain.trim();
    const nextEmail = email.trim();

    if (!nextCompany) {
      setFormError("Company is required.");
      return;
    }

    if (!nextDomain || !nextDomain.includes(".")) {
      setFormError("Domain must contain a dot.");
      return;
    }

    if (!nextEmail.includes("@")) {
      setFormError("Email must contain @.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiUrl}/watchlist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          company: nextCompany,
          domain: nextDomain,
          email: nextEmail
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to add watchlist entry.");
      }

      setFormMessage(`✓ ${nextCompany} added to watchlist. You'll be alerted when anything changes.`);
      setCompany("");
      setDomain("");
      setEmail("");
      await fetchWatchlist();
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : "Failed to add watchlist entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(entry: WatchlistEntry) {
    setListError("");
    setRemovingCompany(entry.company);

    try {
      const response = await fetch(`${apiUrl}/watchlist/${encodeURIComponent(entry.company)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to remove watchlist entry.");
      }

      await fetchWatchlist();
    } catch (caughtError) {
      setListError(caughtError instanceof Error ? caughtError.message : "Failed to remove watchlist entry.");
    } finally {
      setRemovingCompany("");
    }
  }

  async function handleViewPredictions(entry: WatchlistEntry) {
    if (expandedDomain === entry.domain) {
      setExpandedDomain("");
      return;
    }

    setExpandedDomain(entry.domain);

    if (predictionsByDomain[entry.domain]) {
      return;
    }

    setPredictionErrorsByDomain((current) => ({ ...current, [entry.domain]: "" }));
    setLoadingPredictionDomain(entry.domain);

    try {
      const response = await fetch(`${apiUrl}/predictions/${encodeURIComponent(entry.domain)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Prediction analysis failed.");
      }

      const payload = (await response.json()) as PredictionsResult;
      if (payload.error) {
        throw new Error(payload.error);
      }
      setPredictionsByDomain((current) => ({ ...current, [entry.domain]: payload }));
    } catch (caughtError) {
      setPredictionErrorsByDomain((current) => ({
        ...current,
        [entry.domain]: caughtError instanceof Error ? caughtError.message : "Prediction analysis failed."
      }));
    } finally {
      setLoadingPredictionDomain("");
    }
  }

  async function handleAskAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = agentQuestion.trim();
    if (!question) {
      setAgentError("Ask a question first.");
      return;
    }

    setAgentError("");
    setAgentResponse("");
    setAgentAskedAt(new Date().toISOString());
    setIsAgentStreaming(true);

    try {
      const response = await fetch(`${apiUrl}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Agent query failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          const parsed = JSON.parse(line) as QueryResponse;
          if (parsed.chunk) {
            fullAnswer += parsed.chunk;
            setAgentResponse(fullAnswer);
          }
        }
      }

      if (buffer.trim()) {
        const parsed = JSON.parse(buffer) as QueryResponse;
        if (parsed.chunk) {
          fullAnswer += parsed.chunk;
          setAgentResponse(fullAnswer);
        }
      }

      await fetchQueryHistory();
    } catch (caughtError) {
      setAgentError(caughtError instanceof Error ? caughtError.message : "Agent query failed.");
    } finally {
      setIsAgentStreaming(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="flex h-16 items-center justify-between border-b border-zinc-900 px-5 sm:px-8">
        <div className="text-sm font-semibold text-zinc-100">CORPORATE TRUTH TERMINAL</div>
        <div className="flex items-center gap-5">
          <nav className="flex items-center gap-4 text-xs font-bold">
            <Link className="text-zinc-500 transition hover:text-zinc-300" href="/">
              ANALYZE
            </Link>
            <Link className="text-[#1D9E75]" href="/watchlist">
              WATCHLIST
            </Link>
            <Link className="text-zinc-500 transition hover:text-zinc-300" href="/battle-map">
              BATTLE MAP
            </Link>
          </nav>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1D9E75]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
            LIVE
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
        <form className="border border-zinc-900 bg-black p-5 sm:p-6" onSubmit={handleSubmit}>
          <h1 className="text-2xl font-bold text-zinc-100">MONITOR A COMPANY</h1>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              className="h-12 border border-zinc-800 bg-[#0a0a0a] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
              maxLength={100}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="stripe.com"
              value={company}
            />

            {!inferredDomain && (
              <input
                className="h-12 border border-zinc-800 bg-[#0a0a0a] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
                onChange={(event) => setDomain(event.target.value)}
                placeholder="stripe.com"
                value={domain}
              />
            )}

            <input
              className="h-12 border border-zinc-800 bg-[#0a0a0a] px-4 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              type="email"
              value={email}
            />
          </div>

          <button
            className="mt-4 h-12 w-full bg-[#1D9E75] text-sm font-bold text-black transition hover:bg-[#22ba8a] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "ADDING..." : "ADD TO WATCHLIST"}
          </button>

          {formMessage && (
            <p className="mt-4 border border-[#1D9E75]/40 bg-[#1D9E75]/10 p-3 text-sm text-[#1D9E75]">{formMessage}</p>
          )}
          {formError && <p className="mt-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{formError}</p>}
        </form>

        <section className="mt-10 border border-[#7C3AED]/40 bg-black p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-zinc-100">ASK THE INTELLIGENCE AGENT</h2>
                <span className="border border-[#7C3AED]/40 bg-[#7C3AED]/10 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">
                  AI
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">Ask anything about your monitored companies.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {exampleQuestions.map((question) => (
              <button
                className="border border-zinc-800 bg-[#0a0a0a] px-3 py-2 text-left text-xs text-zinc-500 transition hover:border-[#7C3AED]/60 hover:text-[#7C3AED]"
                key={question}
                onClick={() => setAgentQuestion(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>

          <form className="mt-5" onSubmit={handleAskAgent}>
            <textarea
              className="min-h-28 w-full resize-y border border-zinc-800 bg-[#0a0a0a] p-4 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#7C3AED]"
              onChange={(event) => setAgentQuestion(event.target.value)}
              placeholder="Ask anything about your monitored companies..."
              rows={3}
              value={agentQuestion}
            />
            <button
              className="mt-3 h-12 w-full bg-[#7C3AED] text-sm font-bold text-white transition hover:bg-[#8B5CF6] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isAgentStreaming}
              type="submit"
            >
              {isAgentStreaming ? "ASKING AGENT..." : "ASK AGENT"}
            </button>
          </form>

          {agentError && <p className="mt-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{agentError}</p>}

          {(agentResponse || isAgentStreaming) && (
            <div className="mt-5 border border-zinc-900 border-l-4 border-l-[#7C3AED] bg-[#08060d] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-[0.2em] text-[#7C3AED]">AGENT RESPONSE</h3>
                {isAgentStreaming && (
                  <span className="flex items-center gap-1 text-xs text-[#7C3AED]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#7C3AED]" />
                    thinking
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap font-mono text-sm leading-8 text-zinc-200">
                {agentResponse || "Preparing context..."}
              </div>
              <div className="mt-5 border-t border-zinc-900 pt-4">
                <p className="font-mono text-[10px] uppercase tracking-wide text-zinc-600">
                  ASKED AT: {formatTimestamp(agentAskedAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="h-8 border border-zinc-800 px-3 text-[10px] font-bold text-zinc-400 transition hover:border-[#7C3AED]/60 hover:text-[#7C3AED]"
                    onClick={() => navigator.clipboard.writeText(agentResponse)}
                    type="button"
                  >
                    COPY RESPONSE
                  </button>
                  <button
                    className="h-8 border border-zinc-800 px-3 text-[10px] font-bold text-zinc-400 transition hover:border-[#7C3AED]/60 hover:text-[#7C3AED]"
                    onClick={() => setAgentQuestion(`${agentQuestion}\n\nFollow-up: `)}
                    type="button"
                  >
                    ASK FOLLOW-UP
                  </button>
                  <button
                    className="h-8 border border-zinc-800 px-3 text-[10px] font-bold text-zinc-400 transition hover:border-red-500/60 hover:text-red-400"
                    onClick={() => {
                      setAgentResponse("");
                      setAgentError("");
                      setAgentAskedAt("");
                    }}
                    type="button"
                  >
                    CLEAR
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-zinc-900 pt-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-zinc-100">RECENT QUERIES</h3>
              <button
                className="text-xs font-bold text-[#7C3AED] transition hover:text-[#8B5CF6]"
                onClick={() => setShowQueryHistory((current) => !current)}
                type="button"
              >
                {showQueryHistory ? "HIDE HISTORY" : "SHOW HISTORY"}
              </button>
            </div>

            {showQueryHistory && (
              <div className="mt-4 space-y-3">
                {queryHistory.slice(0, 5).length === 0 && (
                  <p className="text-sm text-zinc-600">No agent queries yet.</p>
                )}
                {queryHistory.slice(0, 5).map((item, index) => {
                  const key = `${item.asked_at}-${index}`;
                  const isExpanded = expandedQuery === key;
                  return (
                    <div className="border border-zinc-900 bg-[#0a0a0a] p-4" key={key}>
                      <button
                        className="w-full text-left text-sm font-bold text-[#1D9E75]"
                        onClick={() => setExpandedQuery(isExpanded ? "" : key)}
                        type="button"
                      >
                        {item.question}
                      </button>
                      {isExpanded && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-400">
                          {item.answer}
                        </p>
                      )}
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-zinc-700">
                        {formatTimestamp(item.asked_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-bold text-zinc-100">ACTIVE MONITORS</h2>
            <span className="border border-[#1D9E75]/40 px-2 py-1 text-xs font-bold text-[#1D9E75]">
              {entries.length}
            </span>
          </div>

          {listError && <p className="mb-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{listError}</p>}

          {isLoading && <p className="text-sm text-zinc-500">Loading monitors...</p>}

          {!isLoading && entries.length === 0 && (
            <p className="border border-zinc-900 bg-black p-5 text-sm text-zinc-500">
              No companies monitored yet. Add one above.
            </p>
          )}

          <div className="space-y-4">
            {entries.map((entry) => {
              const analyzedAt = lastAnalyzed(entry);
              const analyzeHref = `/?company=${encodeURIComponent(entry.company)}&domain=${encodeURIComponent(entry.domain)}`;
              const sentinelRisk = sentinelByDomain[entry.domain]?.risk_level;

              return (
                <article className="border border-zinc-900 bg-black p-5" key={entry.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-zinc-100">
                        {entry.company} <span className="text-zinc-500">/</span> {entry.domain}
                      </h3>
                      <span className={`mt-3 inline-flex border px-2 py-1 text-[10px] font-bold ${sentinelBadgeClass(sentinelRisk)}`}>
                        SENTINEL: {sentinelRisk || "SCANNING"}
                      </span>
                      <p className="mt-2 text-sm text-zinc-500">{entry.email}</p>
                      <p className="mt-4 text-[10px] uppercase tracking-wide text-zinc-600">
                        Added {formatTimestamp(entry.created_at)}
                      </p>
                      {analyzedAt && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">
                          Last analyzed {formatTimestamp(analyzedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                      <Link
                        className="inline-flex h-9 items-center border border-[#1D9E75] px-3 text-xs font-bold text-[#1D9E75] transition hover:bg-[#1D9E75] hover:text-black"
                        href={analyzeHref}
                      >
                        ANALYZE NOW
                      </Link>
                      <button
                        className="h-9 border border-[#7C3AED]/60 px-3 text-xs font-bold text-[#7C3AED] transition hover:bg-[#7C3AED] hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingPredictionDomain === entry.domain}
                        onClick={() => handleViewPredictions(entry)}
                        type="button"
                      >
                        {loadingPredictionDomain === entry.domain ? "LOADING..." : "VIEW PREDICTIONS"}
                      </button>
                      <button
                        className="h-9 border border-red-500/50 px-3 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={removingCompany === entry.company}
                        onClick={() => handleRemove(entry)}
                        type="button"
                      >
                        {removingCompany === entry.company ? "REMOVING..." : "REMOVE"}
                      </button>
                    </div>
                  </div>

                  {expandedDomain === entry.domain && (
                    <>
                      {loadingPredictionDomain === entry.domain && (
                        <p className="mt-4 border border-[#7C3AED]/40 bg-black p-4 text-sm text-[#7C3AED]">
                          🔮 Analyzing patterns...
                        </p>
                      )}
                      {predictionErrorsByDomain[entry.domain] && (
                        <p className="mt-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">
                          {predictionErrorsByDomain[entry.domain]}
                        </p>
                      )}
                      {predictionsByDomain[entry.domain] && (
                        <PredictionsPanel predictions={predictionsByDomain[entry.domain]} />
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
