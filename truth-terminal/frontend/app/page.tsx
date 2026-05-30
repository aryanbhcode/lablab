"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Signal = {
  category: "gtm" | "financial" | "security";
  severity: "positive" | "warning" | "critical";
  title: string;
  detail: string;
  source: string;
};

interface Result {
  gtm_score: number;
  financial_score: number;
  security_score: number;
  truth_score: number;
  gtm_summary: string;
  financial_summary: string;
  security_summary: string;
  signals: Signal[];
  scraped_at: string;
  company: string;
  domain: string;
}

type AnalysisErrorResult = {
  error: string;
  data: null;
  scraped_at: string;
  company: string;
};

type StreamEvent = {
  event?: string;
  data?: Result | AnalysisErrorResult;
  error?: string;
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

type SentinelSignal = {
  signal_id: string;
  description: string;
  score: number;
  evidence: string;
};

type SentinelPattern = {
  id: string;
  name: string;
  match_percentage: number;
  historical_examples?: string[];
  avg_weeks_before_collapse?: number;
  alert_message?: string;
  matched_signals?: SentinelSignal[];
};

type SentinelResult = {
  sentinel_active: boolean;
  highest_pattern: SentinelPattern;
  all_patterns: SentinelPattern[];
  risk_level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  company: string;
  domain: string;
  analyzed_at: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const loadingMessages = [
  "→ Connecting to Bright Data scraping network...",
  "→ Scraping LinkedIn job postings...",
  "→ Analyzing Glassdoor reviews...",
  "→ Checking pricing page changes...",
  "→ Scanning news & press coverage...",
  "→ Running Claude AI synthesis...",
  "→ Computing truth scores..."
];

function inferDomain(value: string) {
  const trimmed = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return trimmed.includes(".") ? trimmed : "";
}

function scoreColor(score: number) {
  if (score > 75) {
    return "text-[#1D9E75]";
  }
  if (score >= 50) {
    return "text-amber-400";
  }
  return "text-red-500";
}

function scoreBarColor(score: number) {
  if (score > 75) {
    return "bg-[#1D9E75]";
  }
  if (score >= 50) {
    return "bg-amber-400";
  }
  return "bg-red-500";
}

function signalAccent(severity: Signal["severity"]) {
  if (severity === "positive") {
    return {
      border: "border-[#1D9E75]/40",
      icon: "✓",
      iconClass: "border-[#1D9E75]/40 text-[#1D9E75]"
    };
  }
  if (severity === "warning") {
    return {
      border: "border-amber-400/40",
      icon: "!",
      iconClass: "border-amber-400/40 text-amber-400"
    };
  }
  return {
    border: "border-red-500/40",
    icon: "X",
    iconClass: "border-red-500/40 text-red-500"
  };
}

function ScoreCard({
  label,
  score,
  summary
}: {
  label: string;
  score: number;
  summary: string;
}) {
  return (
    <div className="border border-zinc-900 bg-black p-5">
      <div className="text-xs font-semibold text-zinc-500">{label}</div>
      <div className={`mt-4 text-5xl font-bold ${scoreColor(score)}`}>{score}</div>
      <p className="mt-3 min-h-10 text-sm leading-5 text-zinc-400">{summary}</p>
      <div className="mt-5 h-1.5 w-full bg-zinc-900">
        <div className={`h-full ${scoreBarColor(score)}`} style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const accent = signalAccent(signal.severity);

  return (
    <div className={`border bg-black p-5 ${accent.border}`}>
      <div className="flex gap-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center border text-sm font-bold ${accent.iconClass}`}
          aria-hidden="true"
        >
          {accent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-zinc-100">{signal.title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{signal.detail}</p>
          <div className="mt-4 inline-flex max-w-full border border-zinc-800 px-2 py-1 text-[10px] text-zinc-500">
            <span className="truncate">{signal.source}</span>
          </div>
        </div>
      </div>
    </div>
  );
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

function PredictionCard({ prediction }: { prediction: Prediction }) {
  return (
    <div className="border border-[#7C3AED]/40 bg-black p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="border border-[#7C3AED]/50 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">
            {prediction.timeframe}
          </span>
          <span className="border border-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-500">
            {categoryIcon(prediction.category)}
          </span>
        </div>
        <span className="text-2xl font-bold text-[#7C3AED]">{predictionArrow(prediction.signal_direction)}</span>
      </div>
      <h3 className="mt-5 text-lg font-bold leading-6 text-zinc-100">{prediction.prediction}</h3>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{prediction.reasoning}</p>
      <div className="mt-5 inline-flex border border-[#7C3AED]/40 px-2 py-1 text-[10px] font-bold text-[#7C3AED]">
        {prediction.confidence.toUpperCase()} CONFIDENCE
      </div>
    </div>
  );
}

function PredictiveIntelligence({
  predictions,
  isLoading,
  error
}: {
  predictions: PredictionsResult | null;
  isLoading: boolean;
  error: string;
}) {
  return (
    <section className="border border-[#7C3AED]/40 bg-black p-5">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-bold text-zinc-100">PREDICTIVE INTELLIGENCE</h2>
        <span className="border border-[#7C3AED]/40 px-2 py-1 text-xs font-bold text-[#7C3AED]">BETA</span>
      </div>

      {isLoading && <p className="text-sm text-[#7C3AED]">🔮 Analyzing patterns...</p>}
      {error && <p className="border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}

      {!isLoading && predictions?.message && <p className="text-sm text-zinc-500">{predictions.message}</p>}

      {!isLoading && predictions && predictions.predictions.length > 0 && (
        <div className="space-y-5">
          <div className="border border-[#7C3AED]/40 bg-[#12091f] p-5">
            <div className="text-xs font-bold text-[#7C3AED]">OVERALL TRAJECTORY</div>
            <p className="mt-3 text-lg font-bold leading-7 text-zinc-100">{predictions.overall_trajectory}</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {predictions.predictions.slice(0, 3).map((prediction, index) => (
              <PredictionCard key={`${prediction.timeframe}-${prediction.category}-${index}`} prediction={prediction} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-red-500/40 bg-black p-5">
              <div className="text-xs font-bold text-red-500">⚠️ BIGGEST RISK</div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{predictions.biggest_risk}</p>
            </div>
            <div className="border border-[#1D9E75]/40 bg-black p-5">
              <div className="text-xs font-bold text-[#1D9E75]">🚀 BIGGEST OPPORTUNITY</div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{predictions.biggest_opportunity}</p>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600">Predictions based on pattern analysis. Not financial advice.</p>
        </div>
      )}
    </section>
  );
}

function sentinelRiskClasses(riskLevel: SentinelResult["risk_level"]) {
  if (riskLevel === "CRITICAL") {
    return {
      header: "bg-red-600 animate-pulse",
      border: "border-red-500",
      text: "text-red-400",
      fill: "bg-red-500"
    };
  }
  if (riskLevel === "HIGH") {
    return {
      header: "bg-orange-600",
      border: "border-orange-500",
      text: "text-orange-400",
      fill: "bg-orange-500"
    };
  }
  if (riskLevel === "ELEVATED") {
    return {
      header: "bg-amber-500",
      border: "border-amber-400",
      text: "text-amber-400",
      fill: "bg-amber-400"
    };
  }
  return {
    header: "bg-[#1D9E75]",
    border: "border-[#1D9E75]",
    text: "text-[#1D9E75]",
    fill: "bg-[#1D9E75]"
  };
}

function SentinelMode({
  company,
  error,
  isLoading,
  sentinel
}: {
  company: string;
  error: string;
  isLoading: boolean;
  sentinel: SentinelResult | null;
}) {
  if (isLoading) {
    return (
      <section className="border border-red-950 bg-black p-5">
        <p className="text-sm text-red-400">🔍 Scanning for collapse patterns...</p>
      </section>
    );
  }

  if (error) {
    return <p className="border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>;
  }

  if (!sentinel) {
    return null;
  }

  const classes = sentinelRiskClasses(sentinel.risk_level);
  const pattern = sentinel.highest_pattern;

  if (sentinel.risk_level === "LOW") {
    return (
      <section className="border border-[#1D9E75]/40 bg-[#1D9E75]/10 p-4 text-sm text-[#1D9E75]">
        ✓ SENTINEL CLEAR — No collapse patterns detected for {company}
      </section>
    );
  }

  return (
    <section className={`overflow-hidden border ${classes.border} bg-black`}>
      <div className={`${classes.header} p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-3xl font-black text-white">⚠ SENTINEL ALERT</h2>
          <span className="inline-flex border border-white/40 px-3 py-1 text-xs font-black text-white">
            {sentinel.risk_level} RISK
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div className="border border-red-950 bg-[#130303] p-5">
          <div className="text-sm font-bold text-zinc-500">MATCHES</div>
          <div className="mt-2 text-3xl font-black text-zinc-100">{pattern.name}</div>
          <div className={`mt-4 text-7xl font-black ${classes.text}`}>{pattern.match_percentage}%</div>
          <div className="mt-2 text-sm font-bold text-zinc-500">PATTERN MATCH</div>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            Historical precedent: {(pattern.historical_examples || []).join(" · ")}
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-400">
            Average time before collapse in historical cases: {pattern.avg_weeks_before_collapse} weeks
          </p>
        </div>

        <div className="border border-red-500/50 bg-red-950/30 p-5">
          <p className="text-lg font-bold leading-8 text-white">{pattern.alert_message}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(pattern.matched_signals || []).map((signal) => (
            <div className="border border-red-950 bg-[#090303] p-4" key={signal.signal_id}>
              <h3 className="text-sm font-bold text-zinc-100">{signal.description}</h3>
              <div className="mt-3 h-2 bg-zinc-900">
                <div className={`h-full ${classes.fill}`} style={{ width: `${Math.round(signal.score * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-500">{signal.evidence}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sentinel.all_patterns.map((item) => (
            <div
              className={`border p-4 ${item.id === pattern.id ? `${classes.border} bg-red-950/20` : "border-zinc-900 bg-black"}`}
              key={item.id}
            >
              <div className="text-xs font-bold text-zinc-500">{item.name}</div>
              <div className={`mt-2 text-2xl font-black ${item.id === pattern.id ? classes.text : "text-zinc-400"}`}>
                {item.match_percentage}%
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-5 text-zinc-600">
          SENTINEL pattern matching is based on historical precedent analysis. Not financial advice. For informational purposes only.
        </p>
      </div>
    </section>
  );
}

export default function Page() {
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLines, setLoadingLines] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [predictions, setPredictions] = useState<PredictionsResult | null>(null);
  const [isPredictionsLoading, setIsPredictionsLoading] = useState(false);
  const [predictionsError, setPredictionsError] = useState("");
  const [sentinel, setSentinel] = useState<SentinelResult | null>(null);
  const [isSentinelLoading, setIsSentinelLoading] = useState(false);
  const [sentinelError, setSentinelError] = useState("");
  const [error, setError] = useState("");
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const inferredDomain = useMemo(() => inferDomain(company), [company]);
  const resolvedDomain = useMemo(() => domain.trim() || inferDomain(company), [company, domain]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextCompany = params.get("company") || "";
    const nextDomain = params.get("domain") || "";

    if (nextCompany) {
      setCompany(nextCompany);
    }
    if (nextDomain) {
      setDomain(nextDomain);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setLoadingLines([]);
      return;
    }

    setLoadingLines([loadingMessages[0]]);
    let messageIndex = 1;
    const interval = window.setInterval(() => {
      const nextMessage = loadingMessages[messageIndex % loadingMessages.length];
      messageIndex += 1;
      setLoadingLines((current) => [...current.slice(-9), nextMessage]);
    }, 1500);

    return () => window.clearInterval(interval);
  }, [isLoading]);

  useEffect(() => {
    if (result && !isLoading) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isLoading, result]);

  useEffect(() => {
    if (!result) {
      return;
    }

    const predictionDomain = result.domain || inferDomain(result.company);
    if (!predictionDomain) {
      return;
    }

    async function fetchPredictions() {
      setPredictions(null);
      setPredictionsError("");
      setIsPredictionsLoading(true);

      try {
        const response = await fetch(`${apiUrl}/predictions/${encodeURIComponent(predictionDomain)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Prediction analysis failed.");
        }

        const payload = (await response.json()) as PredictionsResult;
        if (payload.error) {
          throw new Error(payload.error);
        }
        setPredictions(payload);
      } catch (caughtError) {
        setPredictionsError(caughtError instanceof Error ? caughtError.message : "Prediction analysis failed.");
      } finally {
        setIsPredictionsLoading(false);
      }
    }

    fetchPredictions();
  }, [result]);

  useEffect(() => {
    if (!result) {
      return;
    }

    const sentinelDomain = result.domain || inferDomain(result.company);
    if (!sentinelDomain) {
      return;
    }

    async function fetchSentinel() {
      setSentinel(null);
      setSentinelError("");
      setIsSentinelLoading(true);

      try {
        const response = await fetch(`${apiUrl}/sentinel/${encodeURIComponent(sentinelDomain)}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Sentinel scan failed.");
        }

        setSentinel((await response.json()) as SentinelResult);
      } catch (caughtError) {
        setSentinelError(caughtError instanceof Error ? caughtError.message : "Sentinel scan failed.");
      } finally {
        setIsSentinelLoading(false);
      }
    }

    fetchSentinel();
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setPredictions(null);
    setPredictionsError("");
    setSentinel(null);
    setSentinelError("");

    const nextCompany = company.trim();
    const nextDomain = resolvedDomain.trim();

    if (!nextCompany) {
      setError("Company is required.");
      return;
    }

    if (!nextDomain || !nextDomain.includes(".")) {
      setError("Domain must contain a dot.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          company: nextCompany,
          domain: nextDomain
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Analysis failed.");
      }

      if (!response.body) {
        const payload = (await response.json()) as Result;
        setResult(payload);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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

          const eventPayload = JSON.parse(line) as StreamEvent;
          if (eventPayload.error) {
            throw new Error(eventPayload.error);
          }
          if (eventPayload.event === "result" && eventPayload.data) {
            if ("error" in eventPayload.data) {
              throw new Error(eventPayload.data.error);
            }
            setResult(eventPayload.data);
          }
        }
      }

      if (buffer.trim()) {
        const eventPayload = JSON.parse(buffer) as StreamEvent;
        if (eventPayload.error) {
          throw new Error(eventPayload.error);
        }
        if (eventPayload.event === "result" && eventPayload.data) {
          if ("error" in eventPayload.data) {
            throw new Error(eventPayload.data.error);
          }
          setResult(eventPayload.data);
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Analysis failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="flex h-16 items-center justify-between border-b border-zinc-900 px-5 sm:px-8">
        <div className="text-sm font-semibold text-zinc-100">
          CORPORATE TRUTH TERMINAL
        </div>
        <div className="flex items-center gap-5">
          <nav className="flex items-center gap-4 text-xs font-bold">
            <Link className="text-[#1D9E75]" href="/">
              ANALYZE
            </Link>
            <Link className="text-zinc-500 transition hover:text-zinc-300" href="/watchlist">
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

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl flex-col justify-center px-5 py-12 sm:px-8">
        {!isLoading && !result && (
          <div className="w-full">
            <p className="mb-8 text-4xl font-bold leading-tight text-zinc-100 sm:text-6xl">
              WHAT DOES THE INTERNET KNOW ABOUT...
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <input
                className="h-14 w-full border border-zinc-800 bg-black px-4 text-base text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
                maxLength={100}
                onChange={(event) => setCompany(event.target.value)}
                placeholder="try: stripe.com"
                value={company}
              />

              {!inferredDomain && (
                <input
                  className="h-14 w-full border border-zinc-800 bg-black px-4 text-base text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-[#1D9E75]"
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="domain if not already above"
                  value={domain}
                />
              )}

              <button
                className="h-14 w-full bg-[#1D9E75] text-sm font-bold text-black transition hover:bg-[#22ba8a] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
                type="submit"
              >
                ANALYZE
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-zinc-500">
              Pulls live data from LinkedIn, Glassdoor, news, pricing pages & more
            </p>

            {error && <p className="mt-5 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
          </div>
        )}

        {isLoading && (
          <div className="w-full border border-zinc-900 bg-black p-5 shadow-2xl shadow-black">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-900 pb-3 text-xs text-zinc-500">
              <span>truth-terminal://analysis</span>
              <span className="text-[#1D9E75]">RUNNING</span>
            </div>
            <div className="min-h-72 space-y-3 text-sm text-[#1D9E75] sm:text-base">
              {loadingLines.map((message, index) => (
                <div className="terminal-typewriter overflow-hidden whitespace-nowrap" key={`${message}-${index}`}>
                  {message}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isLoading && result && (
          <div className="fade-in w-full space-y-8" ref={resultsRef}>
            <section className="text-center">
              <div className="text-8xl font-bold leading-none text-[#1D9E75] sm:text-9xl">{result.truth_score}</div>
              <div className="mt-4 text-sm font-semibold text-zinc-500">OVERALL TRUTH SCORE</div>
              <p className="mt-2 text-sm text-zinc-500">{result.company} analyzed just now</p>
            </section>

            <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ScoreCard label="GTM SIGNAL" score={result.gtm_score} summary={result.gtm_summary} />
              <ScoreCard label="FINANCIAL HEALTH" score={result.financial_score} summary={result.financial_summary} />
              <ScoreCard
                label="SECURITY EXPOSURE"
                score={result.security_score}
                summary={result.security_summary}
              />
              <ScoreCard label="DATA FRESHNESS" score={100} summary={`Scraped live data at ${result.scraped_at}.`} />
            </section>

            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-xl font-bold text-zinc-100">LIVE SIGNALS</h2>
                <span className="border border-[#1D9E75]/40 px-2 py-1 text-xs font-bold text-[#1D9E75]">
                  {result.signals.length}
                </span>
              </div>

              <div className="space-y-4">
                {result.signals.map((signal, index) => (
                  <SignalCard key={`${signal.title}-${index}`} signal={signal} />
                ))}
              </div>
            </section>

            <PredictiveIntelligence
              error={predictionsError}
              isLoading={isPredictionsLoading}
              predictions={predictions}
            />

            <SentinelMode
              company={result.company}
              error={sentinelError}
              isLoading={isSentinelLoading}
              sentinel={sentinel}
            />

            <button
              className="h-14 w-full border border-[#1D9E75] bg-transparent text-sm font-bold text-[#1D9E75] transition hover:bg-[#1D9E75] hover:text-black"
              onClick={() => {
                setCompany("");
                setDomain("");
                setResult(null);
                setPredictions(null);
                setPredictionsError("");
                setSentinel(null);
                setSentinelError("");
                setError("");
              }}
              type="button"
            >
              ANALYZE ANOTHER COMPANY
            </button>

            {error && <p className="mt-5 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
