"use client";

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

export default function Page() {
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLines, setLoadingLines] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const inferredDomain = useMemo(() => inferDomain(company), [company]);
  const resolvedDomain = useMemo(() => domain.trim() || inferDomain(company), [company, domain]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

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
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1D9E75]">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#1D9E75]" />
          LIVE
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

            <button
              className="h-14 w-full border border-[#1D9E75] bg-transparent text-sm font-bold text-[#1D9E75] transition hover:bg-[#1D9E75] hover:text-black"
              onClick={() => {
                setCompany("");
                setDomain("");
                setResult(null);
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
