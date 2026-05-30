from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from alerts import send_alert
from database import get_last_analysis, get_watchlist, save_analysis
from main import run_analysis


_scheduler: AsyncIOScheduler | None = None


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _score_changed(
    old_result: dict[str, Any] | None,
    new_result: dict[str, Any],
    field: str,
    threshold: int,
) -> bool:
    if old_result is None:
        return False

    old_score = old_result.get(field)
    new_score = new_result.get(field)
    if old_score is None or new_score is None:
        return False

    return abs(int(new_score) - int(old_score)) > threshold


def _parse_signals(result: dict[str, Any] | None) -> list[Any]:
    if not result:
        return []

    signals = result.get("signals", [])
    if isinstance(signals, str):
        try:
            parsed = json.loads(signals)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []

    return signals if isinstance(signals, list) else []


def _signal_key(signal: Any) -> str:
    return json.dumps(signal, sort_keys=True, default=str)


def _find_changes(old_result: dict[str, Any] | None, new_result: dict[str, Any]) -> list[str]:
    changes: list[str] = []

    if _score_changed(old_result, new_result, "truth_score", 5):
        changes.append("truth_score changed by more than 5 points")

    for field in ("gtm_score", "financial_score", "security_score"):
        if _score_changed(old_result, new_result, field, 10):
            changes.append(f"{field} changed by more than 10 points")

    old_signal_keys = {_signal_key(signal) for signal in _parse_signals(old_result)}
    new_signals = _parse_signals(new_result)
    new_signal_keys = {_signal_key(signal) for signal in new_signals}
    if new_signal_keys - old_signal_keys:
        changes.append("new signal appeared")

    return changes


async def check_watchlist() -> None:
    watchlist = get_watchlist()

    for entry in watchlist:
        company = entry["company"]
        domain = entry["domain"]
        email = entry["email"]

        print(f"[truth-terminal] watchlist check started company={company} timestamp={_iso_now()}", flush=True)

        old_result = get_last_analysis(company, domain)
        new_result = await run_analysis(company, domain)
        save_analysis(company, domain, new_result)

        changes = _find_changes(old_result, new_result)
        if changes:
            await send_alert(email, company, old_result, new_result, changes)

        print(f"[truth-terminal] watchlist checked company={company} timestamp={_iso_now()}", flush=True)


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler

    if _scheduler and _scheduler.running:
        return _scheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(check_watchlist, "interval", hours=24, id="watchlist_daily", replace_existing=True)
    scheduler.add_job(check_watchlist, "interval", hours=1, id="watchlist_demo_hourly", replace_existing=True)
    scheduler.start()

    _scheduler = scheduler
    return scheduler
