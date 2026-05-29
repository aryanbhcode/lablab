import asyncio
import json
import os
from collections.abc import AsyncGenerator, Awaitable
from datetime import datetime, timezone
from time import perf_counter
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from database import add_to_watchlist, delete_from_watchlist, get_watchlist, init_db
from scraper import scrape_jobs, scrape_news, scrape_pricing, scrape_reviews
from synthesizer import synthesize


ENV_VARS = [
    "ANTHROPIC_API_KEY",
    "BRIGHTDATA_API_TOKEN",
    "BRIGHTDATA_ZONE",
    "BRIGHTDATA_SERP_ZONE",
    "RESEND_API_KEY",
]

load_dotenv()


class AnalyzeRequest(BaseModel):
    company: str = Field(..., min_length=1, max_length=100)
    domain: str = Field(..., min_length=3)


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


async def _timed_call(
    name: str,
    awaitable: Awaitable[dict[str, Any]],
    queue: asyncio.Queue[dict[str, Any]] | None = None,
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
    queue: asyncio.Queue[dict[str, Any]] | None = None,
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
    synthesis_elapsed = perf_counter() - synthesis_started
    _log(f"synthesis completed in {synthesis_elapsed:.2f}s")

    result = {
        **synthesis,
        "scraped_at": scraped_at,
        "company": company,
    }

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
        company = payload.company.strip()
        domain = _normalize_domain(payload.domain)

        if len(company) > 100:
            raise HTTPException(status_code=422, detail="company must be 100 characters or fewer")
        if "." not in domain:
            raise HTTPException(status_code=422, detail="domain must contain a dot")

        return StreamingResponse(
            _analyze_stream(company, domain),
            media_type="application/x-ndjson",
        )

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

    @app.delete("/watchlist/{company}")
    async def remove_watchlist_entry(company: str) -> dict[str, Any]:
        deleted_count = delete_from_watchlist(company)
        return {"success": True, "deleted_count": deleted_count}

    return app


app = create_app()
