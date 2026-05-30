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

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

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
    return "text-[#c084fc]";
  }
  if (score >= 50) {
    return "text-amber-400";
  }
  return "text-red-500";
}

function scoreBarColor(score: number) {
  if (score > 75) {
    return "bg-[#c084fc]";
  }
  if (score >= 50) {
    return "bg-amber-400";
  }
  return "bg-red-500";
}

function signalAccent(severity: Signal["severity"]) {
  if (severity === "positive") {
    return {
      border: "border-[#c084fc]/40",
      icon: "✓",
      iconClass: "border-[#c084fc]/40 text-[#c084fc]"
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
    <div className="border border-[#4f3f78] bg-white p-5">
      <div className="text-xs font-semibold text-[#cfc4e9]">{label}</div>
      <div className={`mt-4 text-5xl font-bold ${scoreColor(score)}`}>{score}</div>
      <p className="mt-3 min-h-10 text-sm leading-5 text-[#cfc4e9]">{summary}</p>
      <div className="mt-5 h-1.5 w-full bg-[#4f3f78]">
        <div className={`h-full ${scoreBarColor(score)}`} style={{ width: `${Math.max(0, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}

function SignalCard({ signal }: { signal: Signal }) {
  const accent = signalAccent(signal.severity);

  return (
    <div className={`border bg-white p-5 ${accent.border}`}>
      <div className="flex gap-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center border text-sm font-bold ${accent.iconClass}`}
          aria-hidden="true"
        >
          {accent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-[#f6f0ff]">{signal.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#cfc4e9]">{signal.detail}</p>
          <div className="mt-4 inline-flex max-w-full border border-[#4f3f78] px-2 py-1 text-[10px] text-[#cfc4e9]">
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
    <div className="border border-[#9b5cff]/40 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="border border-[#9b5cff]/50 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">
            {prediction.timeframe}
          </span>
          <span className="border border-[#4f3f78] px-2 py-1 text-[10px] font-bold text-[#cfc4e9]">
            {categoryIcon(prediction.category)}
          </span>
        </div>
        <span className="text-2xl font-bold text-[#9b5cff]">{predictionArrow(prediction.signal_direction)}</span>
      </div>
      <h3 className="mt-5 text-lg font-bold leading-6 text-[#f6f0ff]">{prediction.prediction}</h3>
      <p className="mt-3 text-sm leading-6 text-[#cfc4e9]">{prediction.reasoning}</p>
      <div className="mt-5 inline-flex border border-[#9b5cff]/40 px-2 py-1 text-[10px] font-bold text-[#9b5cff]">
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
    <section className="border border-[#9b5cff]/40 bg-white p-5">
      <div className="mb-5 flex items-center gap-3">
        <h2 className="text-xl font-bold text-[#f6f0ff]">PREDICTIVE INTELLIGENCE</h2>
        <span className="border border-[#9b5cff]/40 px-2 py-1 text-xs font-bold text-[#9b5cff]">BETA</span>
      </div>

      {isLoading && <p className="text-sm text-[#9b5cff]">🔮 Analyzing patterns...</p>}
      {error && <p className="border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}

      {!isLoading && predictions?.message && <p className="text-sm text-[#cfc4e9]">{predictions.message}</p>}

      {!isLoading && predictions && predictions.predictions.length > 0 && (
        <div className="space-y-5">
          <div className="border border-[#9b5cff]/40 bg-[#171126] p-5">
            <div className="text-xs font-bold text-[#9b5cff]">OVERALL TRAJECTORY</div>
            <p className="mt-3 text-lg font-bold leading-7 text-[#f6f0ff]">{predictions.overall_trajectory}</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {predictions.predictions.slice(0, 3).map((prediction, index) => (
              <PredictionCard key={`${prediction.timeframe}-${prediction.category}-${index}`} prediction={prediction} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="border border-red-500/40 bg-white p-5">
              <div className="text-xs font-bold text-red-500">⚠️ BIGGEST RISK</div>
              <p className="mt-3 text-sm leading-6 text-[#2f4445]">{predictions.biggest_risk}</p>
            </div>
            <div className="border border-[#c084fc]/40 bg-white p-5">
              <div className="text-xs font-bold text-[#c084fc]">🚀 BIGGEST OPPORTUNITY</div>
              <p className="mt-3 text-sm leading-6 text-[#2f4445]">{predictions.biggest_opportunity}</p>
            </div>
          </div>

          <p className="text-[10px] text-[#9484b8]">Predictions based on pattern analysis. Not financial advice.</p>
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
    header: "bg-[#c084fc]",
    border: "border-[#c084fc]",
    text: "text-[#c084fc]",
    fill: "bg-[#c084fc]"
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
      <section className="border border-red-950 bg-white p-5">
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
      <section className="border border-[#c084fc]/40 bg-[#c084fc]/10 p-4 text-sm text-[#c084fc]">
        ✓ SENTINEL CLEAR — No collapse patterns detected for {company}
      </section>
    );
  }

  return (
    <section className={`overflow-hidden border ${classes.border} bg-white`}>
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
          <div className="text-sm font-bold text-[#cfc4e9]">MATCHES</div>
          <div className="mt-2 text-3xl font-black text-[#f6f0ff]">{pattern.name}</div>
          <div className={`mt-4 text-7xl font-black ${classes.text}`}>{pattern.match_percentage}%</div>
          <div className="mt-2 text-sm font-bold text-[#cfc4e9]">PATTERN MATCH</div>
          <p className="mt-4 text-sm leading-6 text-[#cfc4e9]">
            Historical precedent: {(pattern.historical_examples || []).join(" · ")}
          </p>
          <p className="mt-1 text-sm leading-6 text-[#cfc4e9]">
            Average time before collapse in historical cases: {pattern.avg_weeks_before_collapse} weeks
          </p>
        </div>

        <div className="border border-red-500/50 bg-red-950/30 p-5">
          <p className="text-lg font-bold leading-8 text-white">{pattern.alert_message}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(pattern.matched_signals || []).map((signal) => (
            <div className="border border-red-950 bg-[#090303] p-4" key={signal.signal_id}>
              <h3 className="text-sm font-bold text-[#f6f0ff]">{signal.description}</h3>
              <div className="mt-3 h-2 bg-[#4f3f78]">
                <div className={`h-full ${classes.fill}`} style={{ width: `${Math.round(signal.score * 100)}%` }} />
              </div>
              <p className="mt-3 text-xs leading-5 text-[#cfc4e9]">{signal.evidence}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {sentinel.all_patterns.map((item) => (
            <div
              className={`border p-4 ${item.id === pattern.id ? `${classes.border} bg-red-950/20` : "border-[#4f3f78] bg-white"}`}
              key={item.id}
            >
              <div className="text-xs font-bold text-[#cfc4e9]">{item.name}</div>
              <div className={`mt-2 text-2xl font-black ${item.id === pattern.id ? classes.text : "text-[#cfc4e9]"}`}>
                {item.match_percentage}%
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] leading-5 text-[#9484b8]">
          SENTINEL pattern matching is based on historical precedent analysis. Not financial advice. For informational purposes only.
        </p>
      </div>
    </section>
  );
}

function IntelligenceGraphic({
  mode = "analyze"
}: {
  mode?: "analyze" | "results";
}) {
  return (
    <div className="institutional-hero-panel relative overflow-hidden p-10">
      <span className="cosmic-spark left-[16%] top-[18%] h-2 w-2" />
      <span className="cosmic-spark right-[30%] top-[12%] h-1.5 w-1.5" />
      <span className="cosmic-spark bottom-[22%] left-[42%] h-1.5 w-1.5" />
      <span className="cosmic-orb right-[18%] top-[24%] h-20 w-20" />
      <span className="cosmic-orb bottom-[18%] left-[18%] h-12 w-12" />
      <div className="relative z-10 flex h-full max-w-[70%] flex-col justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.26em] text-[#f4c95d]">
            {mode === "results" ? "Evidence engine" : "Truth systems"}
          </p>
          <h2 className="mt-8 text-4xl font-black leading-tight">
            {mode === "results" ? "Signals are weighed, cross-checked, then scored." : "Risk signals, public evidence, anomaly trails."}
          </h2>
        </div>
        <div className="grid gap-4 text-sm text-white/75">
          <p>Every score is backed by source categories: hiring, reviews, pricing, news and security posture.</p>
          <p>Sentinel mode watches for historical collapse patterns without slowing the core analysis run.</p>
        </div>
      </div>
    </div>
  );
}

function BlueprintLoader({ lines }: { lines: string[] }) {
  const progressRatio = Math.max(0.08, Math.min(lines.length / loadingMessages.length, 0.96));
  const currentStep = Math.max(1, Math.min(4, Math.ceil(progressRatio * 4)));

  return (
    <div className="progress-lab w-full p-6 sm:p-8">
      <div className="relative z-10 grid min-w-0 gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="min-w-0">
          <div className="mb-8 flex items-center justify-between text-xs font-black uppercase tracking-[0.2em] text-[#c6c0b2]">
            <span>truth-terminal://analysis</span>
            <span className="text-[#f4c95d]">Running</span>
          </div>
          <div className="progress-track">
            <div className="h-full rounded-full bg-gradient-to-r from-[#5b21b6] to-[#9b5cff] transition-[width] duration-700" style={{ width: `${progressRatio * 100}%` }} />
          </div>
          <div className="mt-12 flex items-center">
            {[1, 2, 3, 4].map((step) => (
              <div className="flex flex-1 items-center" key={step}>
                <div className={`step-node ${step === currentStep ? "active" : ""}`}>{step < currentStep ? "✓" : step}</div>
                {step < 4 && <div className="h-0.5 flex-1 bg-[#f4c95d]/70" />}
              </div>
            ))}
          </div>
          <div className="scan-orbit mt-10 overflow-hidden border border-white/10 bg-black/20">
            <span className="scan-dot" />
            <span className="scan-dot" />
            <span className="scan-dot" />
            <span className="scan-beam" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#c6c0b2]">Source orbit</div>
                <div className="mt-1 text-xs text-[#c6c0b2]">Jobs · Reviews · News · Pricing</div>
              </div>
              <div className="text-3xl font-black text-[#f4c95d]">{Math.min(lines.length, loadingMessages.length)}/{loadingMessages.length}</div>
            </div>
          </div>
        </div>
        <div className="relative min-w-0">
          <div className="absolute left-4 top-10 h-[72%] w-px bg-[#f4c95d]/50" />
          <div className="space-y-4 pl-10 pr-2">
            {lines.map((message, index) => (
              <div
                className="loader-line break-words text-sm leading-7 text-[#fffaf0]"
                key={`${message}-${index}`}
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <span className="text-[#f4c95d]">{message.slice(0, 1)}</span>
                {message.slice(1)}
              </div>
            ))}
          </div>
          <div className="relative ml-10 mt-10 h-28 max-w-xl">
            <div className="loading-data-line absolute bottom-4 left-0 h-2 w-[58%] rounded-full bg-[#f4c95d]" />
            <div className="loading-data-line absolute bottom-10 left-[12%] h-2 w-[78%] rounded-full bg-white/85" />
            <div className="loading-data-line absolute bottom-16 left-[28%] h-2 w-[54%] rounded-full bg-[#9b5cff]" />
            <div className="absolute bottom-0 left-[22%] h-28 w-px bg-[#f4c95d]/60" />
            <div className="absolute bottom-0 left-[48%] h-28 w-px bg-[#f4c95d]/60" />
            <div className="absolute bottom-0 left-[74%] h-28 w-px bg-[#f4c95d]/60" />
          </div>
        </div>
      </div>
    </div>
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

    setLoadingLines([]);
    let messageIndex = 0;
    const interval = window.setInterval(() => {
      const nextMessage = loadingMessages[messageIndex];
      messageIndex += 1;
      if (nextMessage) {
        setLoadingLines((current) => [...current, nextMessage]);
      } else {
        window.clearInterval(interval);
      }
    }, 1450);

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
            <Link className="text-[#f4c95d]" href="/">
              ANALYZE
            </Link>
            <Link className="text-[#cfc4e9] transition hover:text-[#2f4445]" href="/watchlist">
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

      <section className="mx-auto flex min-h-[calc(100vh-92px)] w-full max-w-7xl flex-col justify-center px-6 py-12 sm:px-12">
        {!isLoading && !result && (
          <div className="grid w-full items-stretch gap-10 lg:grid-cols-[1fr_0.92fr]">
            <div className="py-8">
              <p className="institutional-section-label mb-5">Competitive intelligence</p>
              <h1 className="max-w-3xl text-5xl font-black leading-[0.98] tracking-tight text-[#f6f0ff] sm:text-7xl">
                Decode the company before the market does.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#cfc4e9]">
                Pull live public evidence into a focused risk readout: momentum, money pressure, security exposure and collapse-pattern drift.
              </p>

              <form className="institutional-card mt-10 grid gap-3 p-3 sm:grid-cols-[1fr_auto]" onSubmit={handleSubmit}>
                <input
                  className="institutional-field h-16 px-5 text-lg outline-none transition placeholder:text-[#9484b8]"
                  maxLength={100}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="try: stripe.com"
                  value={company}
                />

                {!inferredDomain && (
                  <input
                    className="institutional-field h-16 px-5 text-lg outline-none transition placeholder:text-[#9484b8] sm:col-span-2"
                    onChange={(event) => setDomain(event.target.value)}
                    placeholder="domain if not already above"
                    value={domain}
                  />
                )}

                <button
                  className="cosmic-cta h-16 px-8 text-sm font-black uppercase tracking-[0.16em] text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading}
                  type="submit"
                >
                  Analyze →
                </button>
              </form>

              <p className="mt-4 text-sm text-[#cfc4e9]">
                Live scan: jobs, reviews, pricing, news, source confidence and Sentinel collapse patterns.
              </p>
            </div>

            <IntelligenceGraphic />

            {error && <p className="mt-5 border border-red-950 bg-red-950/30 p-3 text-sm text-red-400">{error}</p>}
          </div>
        )}

        {isLoading && (
          <BlueprintLoader lines={loadingLines} />
        )}

        {!isLoading && result && (
          <div className="fade-in w-full space-y-8" ref={resultsRef}>
            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="institutional-card relative overflow-hidden p-8">
                <div className="relative z-10 grid min-h-72 gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <p className="institutional-section-label">Company readout</p>
                    <div className="mt-8 max-w-xs">
                      <p className="text-3xl font-black leading-tight text-[#f6f0ff]">{result.company}</p>
                      <p className="mt-2 font-mono text-sm text-[#c6c0b2]">{result.domain}</p>
                    </div>

                    <div className="mt-10 space-y-4">
                      {[
                        ["GTM", result.gtm_score, "bg-[#c084fc]"],
                        ["FIN", result.financial_score, "bg-[#9b5cff]"],
                        ["SEC", result.security_score, "bg-[#f4c95d]"]
                      ].map(([label, value, color]) => (
                        <div className="grid grid-cols-[42px_1fr_36px] items-center gap-3" key={label as string}>
                          <span className="font-mono text-[10px] font-black tracking-[0.18em] text-[#c6c0b2]">{label}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-[#f6f0ff]/14">
                            <span
                              className={`block h-full rounded-full ${color}`}
                              style={{ width: `${Math.max(0, Math.min(Number(value), 100))}%` }}
                            />
                          </span>
                          <span className="text-right font-mono text-xs font-black text-[#f6f0ff]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative flex h-44 w-44 items-center justify-center justify-self-center sm:h-52 sm:w-52">
                    <div className="absolute inset-0 rounded-full border border-[#f6f0ff]/10" />
                    <div className="absolute inset-5 rounded-full border border-[#c084fc]/30" />
                    <div className="absolute inset-10 rounded-full border border-[#f4c95d]/40" />
                    <div className="absolute left-2 top-8 h-3 w-3 rounded-full bg-[#c084fc] shadow-[0_0_24px_rgba(35,215,192,0.55)]" />
                    <div className="absolute bottom-6 right-7 h-3 w-3 rounded-full bg-[#f4c95d] shadow-[0_0_24px_rgba(206,246,107,0.45)]" />
                    <div className="relative text-center">
                      <div className="text-7xl font-black leading-none text-[#f4c95d] sm:text-8xl">{result.truth_score}</div>
                      <div className="mt-3 text-[10px] font-black uppercase tracking-[0.26em] text-[#c6c0b2]">Truth score</div>
                    </div>
                  </div>
                </div>
                <p className="relative z-10 mt-5 text-sm text-[#c6c0b2]">Analyzed just now</p>
              </div>
              <div className="institutional-card result-radar relative min-h-80 overflow-hidden p-8">
                <span className="cosmic-orb right-12 top-8 h-16 w-16" />
                <span className="cosmic-spark left-[18%] top-[24%] h-1.5 w-1.5" />
                <span className="cosmic-spark right-[28%] bottom-[22%] h-2 w-2" />
                <div className="relative z-10 max-w-lg">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-[#c084fc]">Evidence map</p>
                  <h2 className="mt-5 text-4xl font-black leading-tight text-white">This view is about one company: what changed, what matters, what to verify.</h2>
                  <p className="mt-6 text-sm leading-7 text-[#c6c0b2]">Battle Map ranks a market. Analyze stays surgical: source signals, prediction deltas, and Sentinel collapse-pattern checks for a single target.</p>
                </div>
              </div>
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
                <h2 className="text-xl font-bold text-[#f6f0ff]">LIVE SIGNALS</h2>
                <span className="border border-[#c084fc]/40 px-2 py-1 text-xs font-bold text-[#c084fc]">
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
              className="h-14 w-full border border-[#c084fc] bg-transparent text-sm font-bold text-[#c084fc] transition hover:bg-[#c084fc] hover:text-white"
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
