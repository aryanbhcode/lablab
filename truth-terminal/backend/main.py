from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncGenerator, Awaitable
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Optional

from anthropic import AsyncAnthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from database import (
    add_to_watchlist,
    delete_from_watchlist,
    get_analysis_history,
    get_last_analysis,
    get_last_analysis_by_domain,
    get_query_history,
    get_total_analyses_count,
    get_watchlist,
    init_db,
    save_analysis,
    save_query,
    save_sentinel_result,
)
from predictions import generate_predictions, generate_predictions_by_domain
from scraper import scrape_jobs, scrape_news, scrape_pricing, scrape_reviews
from sentinel import run_sentinel
from synthesizer import MODEL, _extract_json, _message_text, synthesize


ENV_VARS = [
    "ANTHROPIC_API_KEY",
    "BRIGHTDATA_API_TOKEN",
    "BRIGHTDATA_API_KEY",
    "BRIGHTDATA_ZONE",
    "BRIGHTDATA_SERP_ZONE",
    "RESEND_API_KEY",
]

load_dotenv()


class AnalyzeRequest(BaseModel):
    company: Optional[str] = Field(None, max_length=100)
    domain: str = Field(..., min_length=3)


class BattleMapRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=100)
    domain: str = Field(..., min_length=3)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)


class WatchlistRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=100)
    domain: str = Field(..., min_length=3)
    email: str = Field(..., min_length=3)


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stream_event(event: str, data: dict[str, Any]) -> str:
    return json.dumps({"event": event, **data}, default=str) + "\n"


def _log(message: str) -> None:
    print(f"[truth-terminal] {message}", flush=True)


def _normalize_domain(domain: str) -> str:
    return domain.strip().removeprefix("https://").removeprefix("http://").strip("/")


def _derive_company_from_domain(domain: str) -> str:
    name = domain.split(".")[0].replace("-", " ").replace("_", " ").strip()
    return name.title() if name else domain


def _watchlist_company_for_domain(domain: str) -> Optional[str]:
    for entry in get_watchlist():
        if entry["domain"] == domain:
            return entry["company"]
    return None


async def _timed_call(
    name: str,
    awaitable: Awaitable[dict[str, Any]],
    queue: Optional[asyncio.Queue[dict[str, Any]]] = None,
) -> dict[str, Any]:
    started = perf_counter()
    _log(f"{name} started")

    try:
        result = await awaitable
        elapsed = perf_counter() - started
        _log(f"{name} completed in {elapsed:.2f}s")
        if queue:
            await queue.put(
                {
                    "step": name,
                    "status": "completed",
                    "timestamp": _iso_now(),
                    "elapsed_seconds": round(elapsed, 2),
                }
            )
        return result
    except Exception as exc:
        elapsed = perf_counter() - started
        _log(f"{name} failed in {elapsed:.2f}s: {exc}")
        if queue:
            await queue.put(
                {
                    "step": name,
                    "status": "failed",
                    "timestamp": _iso_now(),
                    "elapsed_seconds": round(elapsed, 2),
                    "error": str(exc),
                }
            )
        return {"error": str(exc), "data": None}


async def _scrape_all(
    company: str,
    domain: str,
    queue: Optional[asyncio.Queue[dict[str, Any]]] = None,
) -> dict[str, Any]:
    jobs, reviews, pricing, news = await asyncio.gather(
        _timed_call("scrape_jobs", scrape_jobs(company, domain), queue),
        _timed_call("scrape_reviews", scrape_reviews(company), queue),
        _timed_call("scrape_pricing", scrape_pricing(domain), queue),
        _timed_call("scrape_news", scrape_news(company), queue),
    )

    return {
        "jobs": jobs,
        "reviews": reviews,
        "pricing": pricing,
        "news": news,
    }


async def run_analysis(company: str, domain: str) -> dict[str, Any]:
    started = perf_counter()
    scraped_at = _iso_now()

    _log(f"analysis started for company={company} domain={domain}")
    scraped_data = await _scrape_all(company, domain)

    synthesis_started = perf_counter()
    _log("synthesis started")
    synthesis = await synthesize(company, scraped_data)
    synthesis = _normalize_analysis_scores(synthesis)
    synthesis["source_status"] = _scrape_source_status(scraped_data)
    synthesis["data_quality"] = _analysis_quality(synthesis)
    synthesis_elapsed = perf_counter() - synthesis_started
    _log(f"synthesis completed in {synthesis_elapsed:.2f}s")

    elapsed = perf_counter() - started
    _log(f"analysis completed in {elapsed:.2f}s")

    return {
        **synthesis,
        "scraped_at": scraped_at,
        "company": company,
        "domain": domain,
    }


async def _claude_message(prompt: str, max_tokens: int = 1200) -> str:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    client = AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        temperature=0,
        messages=[{"role": "user", "content": prompt}],
    )
    return _message_text(response)


async def _identify_competitors(company: str, domain: str) -> list[dict[str, str]]:
    prompt = f"""
You are a market intelligence expert. For the company '{company}' (domain: {domain}),
identify their top 4 direct competitors. Return ONLY valid JSON:
{{
  "competitors": [
    {{ "company": "Brex", "domain": "brex.com" }},
    {{ "company": "Ramp", "domain": "ramp.com" }}
  ]
}}
""".strip()
    raw_text = await _claude_message(prompt)
    payload = _extract_json(raw_text)
    competitors: list[dict[str, str]] = []
    seen_domains = {domain.lower()}

    for item in payload.get("competitors", []):
        competitor_domain = _normalize_domain(str(item.get("domain", "")))
        competitor_company = str(item.get("company", "")).strip() or _derive_company_from_domain(competitor_domain)
        if not competitor_domain or "." not in competitor_domain:
            continue
        if competitor_domain.lower() in seen_domains:
            continue
        seen_domains.add(competitor_domain.lower())
        competitors.append({"company": competitor_company, "domain": competitor_domain})
        if len(competitors) == 4:
            break

    if len(competitors) < 1:
        raise ValueError("Claude did not return valid competitors")

    return competitors


def _safe_score(value: Any) -> int:
    try:
        return max(0, min(100, int(value)))
    except (TypeError, ValueError):
        return 0


def _weighted_truth_score(gtm_score: Any, financial_score: Any, security_score: Any) -> int:
    return round(
        _safe_score(gtm_score) * 0.3
        + _safe_score(financial_score) * 0.4
        + _safe_score(security_score) * 0.3
    )


def _normalize_analysis_scores(result: dict[str, Any]) -> dict[str, Any]:
    result["gtm_score"] = _safe_score(result.get("gtm_score"))
    result["financial_score"] = _safe_score(result.get("financial_score"))
    result["security_score"] = _safe_score(result.get("security_score"))
    result["truth_score"] = _weighted_truth_score(
        result["gtm_score"],
        result["financial_score"],
        result["security_score"],
    )
    return result


def _scrape_source_status(scraped_data: dict[str, Any]) -> dict[str, Any]:
    sources: dict[str, dict[str, Any]] = {}

    for name in ("jobs", "reviews", "pricing", "news"):
        payload = scraped_data.get(name)
        error = ""
        available = False

        if isinstance(payload, dict):
            raw_error = payload.get("error")
            error = str(raw_error) if raw_error else ""
            data = payload.get("data")
            if isinstance(data, dict):
                if name == "jobs":
                    available = bool(data.get("job_titles")) or _safe_score(data.get("total_job_count")) > 0
                elif name == "reviews":
                    available = bool(data.get("recent_review_excerpts")) or data.get("overall_rating") is not None
                elif name == "pricing":
                    available = bool(data.get("pricing_tiers")) or bool(data.get("prices")) or bool(data.get("enterprise_or_custom_tier_mentions"))
                elif name == "news":
                    available = bool(data.get("headlines"))

        sources[name] = {
            "ok": not error,
            "available": available,
            "error": error,
        }

    return sources


def _analysis_quality(result: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = []
    signals = result.get("signals") if isinstance(result.get("signals"), list) else []
    haystack = json.dumps(signals, default=str).lower()
    source_status = result.get("source_status") if isinstance(result.get("source_status"), dict) else {}
    failed_sources = [
        name
        for name, status in source_status.items()
        if isinstance(status, dict) and status.get("error")
    ]

    if failed_sources:
        warnings.append(f"Live data source failed: {', '.join(sorted(failed_sources))}.")
    if "zero job" in haystack or "no job" in haystack or (
        isinstance(source_status.get("jobs"), dict)
        and source_status["jobs"].get("ok")
        and not source_status["jobs"].get("available")
    ):
        warnings.append("Hiring signal may be incomplete or empty.")
    if "analysis incomplete" in haystack:
        warnings.append("Claude synthesis fell back to an incomplete-analysis result.")

    expected_truth = _weighted_truth_score(
        result.get("gtm_score"),
        result.get("financial_score"),
        result.get("security_score"),
    )
    if _safe_score(result.get("truth_score")) != expected_truth:
        warnings.append(f"Truth score was normalized to weighted score {expected_truth}.")

    return {
        "verified": len(warnings) == 0,
        "warnings": warnings,
    }


def _trend_direction(scores: list[int]) -> str:
    if len(scores) < 2:
        return "stable"
    delta = scores[-1] - scores[0]
    if delta >= 4:
        return "improving"
    if delta <= -4:
        return "declining"
    return "stable"


def _days_between(start_iso: Optional[str], end: datetime) -> int:
    if not start_iso:
        return 0
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        return max(0, (end - start).days)
    except ValueError:
        return 0


async def _build_query_context() -> dict[str, Any]:
    watchlist = get_watchlist()
    now = datetime.now(timezone.utc)
    monitored_companies = []
    prediction_tasks = [
        generate_predictions_by_domain(str(entry["domain"]))
        for entry in watchlist
    ]
    predictions = await asyncio.gather(*prediction_tasks, return_exceptions=True) if prediction_tasks else []

    for index, entry in enumerate(watchlist):
        company = str(entry["company"])
        domain = str(entry["domain"])
        latest = get_last_analysis(company, domain) or {}
        history = get_analysis_history(company, domain, limit=5)
        oldest_to_newest = list(reversed(history))
        score_trend = [_safe_score(analysis.get("truth_score")) for analysis in oldest_to_newest[-3:]]
        latest_signals = latest.get("signals", [])
        if isinstance(latest_signals, str):
            try:
                latest_signals = json.loads(latest_signals)
            except json.JSONDecodeError:
                latest_signals = []
        if not isinstance(latest_signals, list):
            latest_signals = []

        prediction_payload = predictions[index] if index < len(predictions) else {}
        if isinstance(prediction_payload, Exception):
            prediction_payload = {"error": str(prediction_payload)}

        monitored_companies.append(
            {
                "company": company,
                "domain": domain,
                "current_scores": {
                    "truth": _safe_score(latest.get("truth_score")),
                    "gtm": _safe_score(latest.get("gtm_score")),
                    "financial": _safe_score(latest.get("financial_score")),
                    "security": _safe_score(latest.get("security_score")),
                },
                "score_trend": score_trend,
                "trend_direction": _trend_direction(score_trend),
                "latest_signals": latest_signals[:5],
                "predictions": prediction_payload,
                "days_monitored": _days_between(str(entry.get("created_at") or ""), now),
            }
        )

    created_dates = [str(entry.get("created_at") or "") for entry in watchlist if entry.get("created_at")]

    return {
        "monitored_companies": monitored_companies,
        "total_analyses_run": get_total_analyses_count(),
        "monitoring_since": min(created_dates) if created_dates else None,
    }


def _query_prompt(context: dict[str, Any], question: str) -> str:
    return f"""
Here is my current intelligence data:
{json.dumps(context, indent=2, default=str)}

Question: {question}

Answer with specific data from the intelligence above. Reference company names,
exact scores, and specific signals. Format your response in clear paragraphs.
If the question asks to compare or rank, do so explicitly.
""".strip()


async def _query_stream(question: str) -> AsyncGenerator[str, None]:
    started = perf_counter()
    context = await _build_query_context()
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set")

    system_prompt = (
        "You are an elite market intelligence analyst with access to real-time web intelligence "
        "data on multiple companies. You have been continuously monitoring these companies using "
        "live web scraping across LinkedIn, Glassdoor, news sources, pricing pages, and security "
        "databases. Answer the user's question with specific data points, exact scores, and "
        "actionable insights. Be bold, specific, and direct. Reference actual numbers and signals "
        "from the data. If you see concerning patterns, say so clearly."
    )
    client = AsyncAnthropic(api_key=api_key)
    full_answer = ""
    _log("query started")

    async with client.messages.stream(
        model=MODEL,
        max_tokens=3000,
        temperature=0,
        system=system_prompt,
        messages=[{"role": "user", "content": _query_prompt(context, question)}],
    ) as stream:
        async for chunk in stream.text_stream:
            full_answer += chunk
            yield json.dumps({"chunk": chunk}) + "\n"

    save_query(question, full_answer)
    _log(f"query completed in {perf_counter() - started:.2f}s")
    yield json.dumps({"done": True}) + "\n"


async def _run_sentinel_and_save(company: str, domain: str, analysis_result: dict[str, Any]) -> None:
    try:
        sentinel_result = await run_sentinel(company, domain, analysis_result)
        save_sentinel_result(
            company,
            domain,
            sentinel_result,
            scraped_at=str(analysis_result.get("scraped_at") or ""),
        )
        _log(f"sentinel completed for company={company} domain={domain}")
    except Exception as exc:
        _log(f"sentinel failed for company={company} domain={domain}: {exc}")


def _battle_entry(result: dict[str, Any], is_subject: bool) -> dict[str, Any]:
    return {
        "company": str(result.get("company", "")),
        "domain": str(result.get("domain", "")),
        "truth_score": _safe_score(result.get("truth_score")),
        "gtm_score": _safe_score(result.get("gtm_score")),
        "financial_score": _safe_score(result.get("financial_score")),
        "security_score": _safe_score(result.get("security_score")),
        "gtm_summary": str(result.get("gtm_summary", "")),
        "financial_summary": str(result.get("financial_summary", "")),
        "security_summary": str(result.get("security_summary", "")),
        "signals": result.get("signals") if isinstance(result.get("signals"), list) else [],
        "data_quality": result.get("data_quality") if isinstance(result.get("data_quality"), dict) else _analysis_quality(result),
        "rank": 0,
        "is_subject": is_subject,
    }


async def _battle_threat(subject: dict[str, Any], entries: list[dict[str, Any]]) -> dict[str, str]:
    competitors = [entry for entry in entries if not entry["is_subject"]]
    prompt = f"""
You are a market intelligence expert. The subject company is {subject["company"]} ({subject["domain"]}).
Given this battle map data, identify the single competitor that poses the biggest threat and why.
Return ONLY valid JSON:
{{ "company": "Competitor", "domain": "competitor.com", "reason": "one concise sentence" }}

Battle map:
{json.dumps(competitors, default=str)}
""".strip()
    raw_text = await _claude_message(prompt, max_tokens=900)
    payload = _extract_json(raw_text)
    return {
        "company": str(payload.get("company", "")),
        "domain": str(payload.get("domain", "")),
        "reason": str(payload.get("reason", "")),
    }


async def _battle_market_summary(entries: list[dict[str, Any]]) -> str:
    prompt = f"""
You are a market intelligence expert. Summarize who's winning this market and why in exactly 2 sentences.
Return plain text only.

Battle map:
{json.dumps(entries, default=str)}
""".strip()
    return re.sub(r"\s+", " ", await _claude_message(prompt, max_tokens=700)).strip()


async def _build_battle_map(company: str, domain: str) -> dict[str, Any]:
    started = perf_counter()
    scraped_at = _iso_now()
    _log(f"battle_map started for company={company} domain={domain}")

    competitors_started = perf_counter()
    competitors = await _identify_competitors(company, domain)
    _log(f"battle_map competitors identified in {perf_counter() - competitors_started:.2f}s")

    targets = [{"company": company, "domain": domain, "is_subject": True}] + [
        {**competitor, "is_subject": False} for competitor in competitors
    ]

    analysis_started = perf_counter()
    analyses = await asyncio.gather(
        *[run_analysis(target["company"], target["domain"]) for target in targets]
    )
    _log(f"battle_map analyses completed in {perf_counter() - analysis_started:.2f}s")

    entries = []
    for target, analysis in zip(targets, analyses):
        save_analysis(target["company"], target["domain"], analysis)
        entries.append(_battle_entry(analysis, bool(target["is_subject"])))

    entries.sort(key=lambda entry: entry["truth_score"], reverse=True)
    for index, entry in enumerate(entries, start=1):
        entry["rank"] = index

    winner_entry = entries[0]
    subject_entry = next(entry for entry in entries if entry["is_subject"])

    insight_started = perf_counter()
    biggest_threat, market_summary = await asyncio.gather(
        _battle_threat(subject_entry, entries),
        _battle_market_summary(entries),
    )
    _log(f"battle_map insights completed in {perf_counter() - insight_started:.2f}s")

    elapsed = perf_counter() - started
    _log(f"battle_map completed in {elapsed:.2f}s")

    return {
        "battle_map": entries,
        "winner": {
            "company": winner_entry["company"],
            "domain": winner_entry["domain"],
            "truth_score": winner_entry["truth_score"],
        },
        "biggest_threat": biggest_threat,
        "market_summary": market_summary,
        "scraped_at": scraped_at,
    }


async def _analyze_stream(company: str, domain: str) -> AsyncGenerator[str, None]:
    started = perf_counter()
    scraped_at = _iso_now()

    _log(f"analysis started for company={company} domain={domain}")
    yield _stream_event("step", {"step": "scraping", "status": "started", "timestamp": _iso_now()})

    scrape_events: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    scrape_tasks = asyncio.create_task(_scrape_all(company, domain, scrape_events))

    for _ in range(4):
        event = await scrape_events.get()
        yield _stream_event("step", event)

    scraped_data = await scrape_tasks

    yield _stream_event(
        "step",
        {
            "step": "scraping",
            "status": "completed",
            "timestamp": _iso_now(),
            "sources": list(scraped_data.keys()),
        },
    )

    synthesis_started = perf_counter()
    _log("synthesis started")
    yield _stream_event("step", {"step": "synthesis", "status": "started", "timestamp": _iso_now()})

    synthesis = await synthesize(company, scraped_data)
    synthesis = _normalize_analysis_scores(synthesis)
    synthesis["data_quality"] = _analysis_quality(synthesis)
    synthesis_elapsed = perf_counter() - synthesis_started
    _log(f"synthesis completed in {synthesis_elapsed:.2f}s")

    result = {
        **synthesis,
        "scraped_at": scraped_at,
        "company": company,
        "domain": domain,
    }
    save_analysis(company, domain, result)
    asyncio.create_task(generate_predictions(company, domain))
    asyncio.create_task(_run_sentinel_and_save(company, domain, result))

    elapsed = perf_counter() - started
    _log(f"analysis completed in {elapsed:.2f}s")
    yield _stream_event(
        "result",
        {
            "data": result,
            "timestamp": _iso_now(),
            "elapsed_seconds": round(elapsed, 2),
        },
    )


def create_app() -> FastAPI:
    app = FastAPI(title="Truth Terminal")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    async def startup_message() -> None:
        init_db()
        from scheduler import start_scheduler

        start_scheduler()
        loaded = [name for name in ENV_VARS if os.getenv(name)]
        missing = [name for name in ENV_VARS if not os.getenv(name)]
        _log("startup complete")
        _log(f"env loaded: {', '.join(loaded) if loaded else 'none'}")
        _log(f"env missing: {', '.join(missing) if missing else 'none'}")

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"error": str(exc)})

    @app.exception_handler(Exception)
    async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"error": str(exc)})

    @app.get("/health")
    async def health_check() -> dict[str, str]:
        return {"status": "ok", "timestamp": _iso_now()}

    @app.post("/analyze")
    async def analyze(payload: AnalyzeRequest) -> StreamingResponse:
        domain = _normalize_domain(payload.domain)
        company = payload.company.strip() if payload.company else _derive_company_from_domain(domain)

        if len(company) > 100:
            raise HTTPException(status_code=422, detail="company must be 100 characters or fewer")
        if "." not in domain:
            raise HTTPException(status_code=422, detail="domain must contain a dot")

        return StreamingResponse(
            _analyze_stream(company, domain),
            media_type="application/x-ndjson",
        )

    @app.post("/battle-map")
    async def battle_map(payload: BattleMapRequest) -> dict[str, Any]:
        company = payload.company.strip()
        domain = _normalize_domain(payload.domain)

        if "." not in domain:
            raise HTTPException(status_code=422, detail="domain must contain a dot")

        try:
            return await asyncio.wait_for(_build_battle_map(company, domain), timeout=120)
        except asyncio.TimeoutError as exc:
            raise HTTPException(status_code=504, detail="battle map analysis timed out") from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @app.post("/query")
    async def query(payload: QueryRequest) -> StreamingResponse:
        question = payload.question.strip()
        if not question:
            raise HTTPException(status_code=422, detail="question is required")

        return StreamingResponse(
            _query_stream(question),
            media_type="application/x-ndjson",
        )

    @app.get("/query/history")
    async def query_history() -> dict[str, list[dict[str, Any]]]:
        return {"queries": get_query_history(limit=10)}

    @app.post("/watchlist")
    async def create_watchlist_entry(payload: WatchlistRequest) -> dict[str, Any]:
        company = payload.company.strip()
        domain = _normalize_domain(payload.domain)
        email = payload.email.strip()

        if "." not in domain:
            raise HTTPException(status_code=422, detail="domain must contain a dot")
        if "@" not in email:
            raise HTTPException(status_code=422, detail="email must contain @")

        row_id = add_to_watchlist(company, domain, email)
        return {"success": True, "id": row_id}

    @app.get("/watchlist")
    async def list_watchlist_entries() -> list[dict[str, Any]]:
        return get_watchlist()

    @app.get("/predictions/{domain}")
    async def predictions(domain: str) -> dict[str, Any]:
        normalized_domain = _normalize_domain(domain)
        company = _watchlist_company_for_domain(normalized_domain)
        if not company:
            raise HTTPException(status_code=404, detail="domain is not on the watchlist")

        from predictions import generate_predictions_by_domain
        return await generate_predictions_by_domain(normalized_domain)

    @app.get("/sentinel/{domain}")
    async def sentinel(domain: str) -> dict[str, Any]:
        normalized_domain = _normalize_domain(domain)
        analysis = get_last_analysis_by_domain(normalized_domain)
        if not analysis:
            raise HTTPException(status_code=404, detail="no analysis found for domain")

        if isinstance(analysis.get("sentinel_json"), dict):
            return analysis["sentinel_json"]

        company = str(analysis.get("company") or _derive_company_from_domain(normalized_domain))
        sentinel_result = await run_sentinel(company, normalized_domain, analysis)
        save_sentinel_result(
            company,
            normalized_domain,
            sentinel_result,
            scraped_at=str(analysis.get("scraped_at") or ""),
        )
        return sentinel_result

    @app.delete("/watchlist/{company}")
    async def remove_watchlist_entry(company: str) -> dict[str, Any]:
        deleted_count = delete_from_watchlist(company)
        return {"success": True, "deleted_count": deleted_count}

    return app


app = create_app()
