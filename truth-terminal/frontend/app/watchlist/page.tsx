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

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

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
    return "border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]";
  }
  return "border-[#4f3f78] bg-[#171126] text-[#9484b8]";
}

function PredictionsPanel({ predictions }: { predictions: PredictionsResult }) {
  if (predictions.message) {
    return <p className="mt-4 border border-[#9b5cff]/40 bg-white p-4 text-sm text-[#cfc4e9]">{predictions.message}</p>;
  }

  return (
    <div className="mt-5 border border-[#9b5cff]/40 bg-[#171126] p-4">
      <div className="mb-4 flex items-center gap-3">
        <h4 className="text-sm font-bold text-[#f6f0ff]">PREDICTIVE INTELLIGENCE</h4>
        <span className="border border-[#9b5cff]/40 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">LIVE</span>
      </div>

      {predictions.overall_trajectory && (
        <div className="mb-4 border border-[#9b5cff]/40 bg-[#171126] p-4">
          <div className="text-[10px] font-bold text-[#9b5cff]">OVERALL TRAJECTORY</div>
          <p className="mt-2 text-sm font-bold leading-6 text-[#f6f0ff]">{predictions.overall_trajectory}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {predictions.predictions.slice(0, 3).map((prediction, index) => (
          <div className="border border-[#9b5cff]/40 bg-white p-4" key={`${prediction.timeframe}-${index}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="border border-[#9b5cff]/50 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">
                  {prediction.timeframe}
                </span>
                <span className="border border-[#4f3f78] px-2 py-1 text-[10px] font-bold text-[#cfc4e9]">
                  {categoryIcon(prediction.category)}
                </span>
              </div>
              <span className="text-xl font-bold text-[#9b5cff]">{predictionArrow(prediction.signal_direction)}</span>
            </div>
            <p className="mt-3 text-sm font-bold leading-6 text-[#f6f0ff]">{prediction.prediction}</p>
            <p className="mt-2 text-xs leading-5 text-[#cfc4e9]">{prediction.reasoning}</p>
            <div className="mt-3 inline-flex border border-[#9b5cff]/40 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">
              {prediction.confidence.toUpperCase()} CONFIDENCE
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="border border-red-500/40 bg-white p-4">
          <div className="text-[10px] font-bold text-red-500">⚠️ BIGGEST RISK</div>
          <p className="mt-2 text-xs leading-5 text-[#cfc4e9]">{predictions.biggest_risk}</p>
        </div>
        <div className="border border-[#c084fc]/40 bg-white p-4">
          <div className="text-[10px] font-bold text-[#c084fc]">🚀 BIGGEST OPPORTUNITY</div>
          <p className="mt-2 text-xs leading-5 text-[#cfc4e9]">{predictions.biggest_opportunity}</p>
        </div>
      </div>

      <p className="mt-4 text-[10px] text-[#9484b8]">Predictions based on pattern analysis. Not financial advice.</p>
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
    <main className="institutional-shell min-h-screen">
      <header className="institutional-header sticky top-0 z-20 flex min-h-[92px] items-center justify-between px-6 sm:px-12">
        <div>
          <div className="text-lg font-black tracking-[0.28em] text-white">CORPORATE TRUTH TERMINAL</div>
          <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#cfc4e9]">
            Public web intelligence for company risk
          </div>
        </div>
        <div className="flex items-center gap-5">
          <nav className="flex items-center gap-4 text-xs font-bold">
            <Link className="text-[#cfc4e9] transition hover:text-[#2f4445]" href="/">
              ANALYZE
            </Link>
            <Link className="text-[#f4c95d]" href="/watchlist">
              WATCHLIST
            </Link>
            <Link className="text-[#cfc4e9] transition hover:text-[#2f4445]" href="/battle-map">
              BATTLE MAP
            </Link>
          </nav>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#f4c95d]">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#f4c95d]" />
            LIVE
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-12">
        <div className="mb-10 grid gap-8 lg:grid-cols-[1fr_0.7fr]">
          <div>
            <p className="institutional-section-label mb-4">Watchlist</p>
            <h1 className="text-5xl font-black leading-tight text-[#f6f0ff]">Mission control for monitored companies.</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[#cfc4e9]">
              Keep the portfolio moving: ask the agent, check Sentinel risk, and jump straight into fresh scans.
            </p>
          </div>
          <div className="institutional-hero-panel relative min-h-72 overflow-hidden p-8">
            <span className="cosmic-orb right-12 top-10 h-20 w-20" />
            <span className="cosmic-spark left-[20%] top-[28%] h-2 w-2" />
            <div className="relative z-10 max-w-[72%]">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f4c95d]">Live desk</p>
              <h2 className="mt-6 text-3xl font-black leading-tight text-white">Monitors, questions, alerts and predictions in one operating surface.</h2>
              <p className="mt-6 text-sm leading-7 text-white/75">The page now has its own command-center identity instead of borrowing the Analyze layout.</p>
            </div>
          </div>
        </div>

        <form className="institutional-card p-6 sm:p-8" onSubmit={handleSubmit}>
          <h2 className="text-2xl font-black text-[#f6f0ff]">Monitor a company</h2>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              className="institutional-field h-12 px-4 text-sm outline-none transition placeholder:text-[#9484b8]"
              maxLength={100}
              onChange={(event) => setCompany(event.target.value)}
              placeholder="stripe.com"
              value={company}
            />

            {!inferredDomain && (
              <input
                className="institutional-field h-12 px-4 text-sm outline-none transition placeholder:text-[#9484b8]"
                onChange={(event) => setDomain(event.target.value)}
                placeholder="stripe.com"
                value={domain}
              />
            )}

            <input
              className="institutional-field h-12 px-4 text-sm outline-none transition placeholder:text-[#9484b8]"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              type="email"
              value={email}
            />
          </div>

          <button
            className="cosmic-cta mt-4 h-12 w-full text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "ADDING..." : "ADD TO WATCHLIST"}
          </button>

          {formMessage && (
            <p className="mt-4 border border-[#c084fc]/40 bg-[#c084fc]/10 p-3 text-sm text-[#c084fc]">{formMessage}</p>
          )}
          {formError && <p className="mt-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{formError}</p>}
        </form>

        <section className="institutional-card mt-10 p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-[#f6f0ff]">ASK THE INTELLIGENCE AGENT</h2>
                <span className="border border-[#9b5cff]/40 bg-[#9b5cff]/10 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">
                  AI
                </span>
              </div>
              <p className="mt-2 text-sm text-[#cfc4e9]">Ask anything about your monitored companies.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {exampleQuestions.map((question) => (
              <button
                className="border border-[#4f3f78] bg-[#171126] px-3 py-2 text-left text-xs text-[#cfc4e9] transition hover:border-[#9b5cff]/60 hover:text-[#9b5cff]"
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
              className="min-h-28 w-full resize-y border border-[#4f3f78] bg-[#171126] p-4 text-sm leading-6 text-[#f6f0ff] outline-none transition placeholder:text-[#9484b8] focus:border-[#9b5cff]"
              onChange={(event) => setAgentQuestion(event.target.value)}
              placeholder="Ask anything about your monitored companies..."
              rows={3}
              value={agentQuestion}
            />
            <button
              className="mt-3 h-12 w-full bg-[#9b5cff] text-sm font-bold text-white transition hover:bg-[#b991ff] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isAgentStreaming}
              type="submit"
            >
              {isAgentStreaming ? "ASKING AGENT..." : "ASK AGENT"}
            </button>
          </form>

          {agentError && <p className="mt-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{agentError}</p>}

          {(agentResponse || isAgentStreaming) && (
            <div className="mt-5 border border-[#4f3f78] border-l-4 border-l-[#9b5cff] bg-[#171126] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-bold tracking-[0.2em] text-[#9b5cff]">AGENT RESPONSE</h3>
                {isAgentStreaming && (
                  <span className="flex items-center gap-1 text-xs text-[#9b5cff]">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#9b5cff]" />
                    thinking
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap font-mono text-sm leading-8 text-[#203436]">
                {agentResponse || "Preparing context..."}
              </div>
              <div className="mt-5 border-t border-[#4f3f78] pt-4">
                <p className="font-mono text-[10px] uppercase tracking-wide text-[#9484b8]">
                  ASKED AT: {formatTimestamp(agentAskedAt)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="h-8 border border-[#4f3f78] px-3 text-[10px] font-bold text-[#cfc4e9] transition hover:border-[#9b5cff]/60 hover:text-[#9b5cff]"
                    onClick={() => navigator.clipboard.writeText(agentResponse)}
                    type="button"
                  >
                    COPY RESPONSE
                  </button>
                  <button
                    className="h-8 border border-[#4f3f78] px-3 text-[10px] font-bold text-[#cfc4e9] transition hover:border-[#9b5cff]/60 hover:text-[#9b5cff]"
                    onClick={() => setAgentQuestion(`${agentQuestion}\n\nFollow-up: `)}
                    type="button"
                  >
                    ASK FOLLOW-UP
                  </button>
                  <button
                    className="h-8 border border-[#4f3f78] px-3 text-[10px] font-bold text-[#cfc4e9] transition hover:border-red-500/60 hover:text-red-400"
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

          <div className="mt-6 border-t border-[#4f3f78] pt-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-[#f6f0ff]">RECENT QUERIES</h3>
              <button
                className="text-xs font-bold text-[#9b5cff] transition hover:text-[#b991ff]"
                onClick={() => setShowQueryHistory((current) => !current)}
                type="button"
              >
                {showQueryHistory ? "HIDE HISTORY" : "SHOW HISTORY"}
              </button>
            </div>

            {showQueryHistory && (
              <div className="mt-4 space-y-3">
                {queryHistory.slice(0, 5).length === 0 && (
                  <p className="text-sm text-[#9484b8]">No agent queries yet.</p>
                )}
                {queryHistory.slice(0, 5).map((item, index) => {
                  const key = `${item.asked_at}-${index}`;
                  const isExpanded = expandedQuery === key;
                  return (
                    <div className="border border-[#4f3f78] bg-[#171126] p-4" key={key}>
                      <button
                        className="w-full text-left text-sm font-bold text-[#c084fc]"
                        onClick={() => setExpandedQuery(isExpanded ? "" : key)}
                        type="button"
                      >
                        {item.question}
                      </button>
                      {isExpanded && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#cfc4e9]">
                          {item.answer}
                        </p>
                      )}
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-[#87928f]">
                        {formatTimestamp(item.asked_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-4 flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#f6f0ff]">ACTIVE MONITORS</h2>
            <span className="border border-[#c084fc]/40 px-2 py-1 text-xs font-bold text-[#c084fc]">
              {entries.length}
            </span>
          </div>

          {listError && <p className="mb-4 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{listError}</p>}

          {isLoading && <p className="text-sm text-[#cfc4e9]">Loading monitors...</p>}

          {!isLoading && entries.length === 0 && (
            <p className="border border-[#4f3f78] bg-white p-5 text-sm text-[#cfc4e9]">
              No companies monitored yet. Add one above.
            </p>
          )}

          <div className="space-y-4">
            {entries.map((entry) => {
              const analyzedAt = lastAnalyzed(entry);
              const analyzeHref = `/?company=${encodeURIComponent(entry.company)}&domain=${encodeURIComponent(entry.domain)}`;
              const sentinelRisk = sentinelByDomain[entry.domain]?.risk_level;

              return (
                <article className="border border-[#4f3f78] bg-white p-5" key={entry.id}>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-bold text-[#f6f0ff]">
                        {entry.company} <span className="text-[#cfc4e9]">/</span> {entry.domain}
                      </h3>
                      <span className={`mt-3 inline-flex border px-2 py-1 text-[10px] font-bold ${sentinelBadgeClass(sentinelRisk)}`}>
                        SENTINEL: {sentinelRisk || "SCANNING"}
                      </span>
                      <p className="mt-2 text-sm text-[#cfc4e9]">{entry.email}</p>
                      <p className="mt-4 text-[10px] uppercase tracking-wide text-[#9484b8]">
                        Added {formatTimestamp(entry.created_at)}
                      </p>
                      {analyzedAt && (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-[#9484b8]">
                          Last analyzed {formatTimestamp(analyzedAt)}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                      <Link
                        className="inline-flex h-9 items-center border border-[#c084fc] px-3 text-xs font-bold text-[#c084fc] transition hover:bg-[#c084fc] hover:text-white"
                        href={analyzeHref}
                      >
                        ANALYZE NOW
                      </Link>
                      <button
                        className="h-9 border border-[#9b5cff]/60 px-3 text-xs font-bold text-[#9b5cff] transition hover:bg-[#9b5cff] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingPredictionDomain === entry.domain}
                        onClick={() => handleViewPredictions(entry)}
                        type="button"
                      >
                        {loadingPredictionDomain === entry.domain ? "LOADING..." : "VIEW PREDICTIONS"}
                      </button>
                      <button
                        className="h-9 border border-red-500/50 px-3 text-xs font-bold text-red-500 transition hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                        <p className="mt-4 border border-[#9b5cff]/40 bg-white p-4 text-sm text-[#9b5cff]">
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
