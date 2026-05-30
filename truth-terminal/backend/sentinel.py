from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any

from anthropic import AsyncAnthropic

from synthesizer import MODEL, _extract_json, _message_text


COLLAPSE_PATTERNS = {
    "silent_unravel": {
        "name": "The Silent Unravel",
        "description": "Pattern preceding sudden collapses like FTX and Theranos",
        "historical_examples": ["FTX (2022)", "Theranos (2018)", "Wirecard (2020)"],
        "avg_weeks_before_collapse": 6,
        "signals": [
            {
                "id": "exec_social_quiet",
                "description": "Executive social media activity drops significantly",
                "weight": 0.20,
                "check": "Look in news and signals for: executive departures, CEO quiet, leadership changes, founder stepping back",
            },
            {
                "id": "pr_firm_hiring",
                "description": "Hiring PR/communications roles urgently",
                "weight": 0.15,
                "check": "Look in job signals for: PR manager, communications director, crisis communications, media relations",
            },
            {
                "id": "legal_compliance_spike",
                "description": "Sudden spike in legal and compliance hiring",
                "weight": 0.20,
                "check": "Look in job signals for: general counsel, compliance officer, legal counsel, regulatory affairs",
            },
            {
                "id": "transparency_reviews",
                "description": "Glassdoor reviews mention lack of transparency",
                "weight": 0.25,
                "check": "Look in review signals for: transparency, trust issues, leadership not communicating, kept in dark",
            },
            {
                "id": "pricing_forced_contact",
                "description": "Pricing page removes self-serve, forces contact sales",
                "weight": 0.20,
                "check": "Look in pricing signals for: removed free tier, contact sales only, enterprise only pricing",
            },
        ],
    },
    "slow_bleed": {
        "name": "The Slow Bleed",
        "description": "Pattern preceding gradual collapses like WeWork and Peloton",
        "historical_examples": ["WeWork (2023)", "Peloton (2022)", "Bird Scooters (2023)"],
        "avg_weeks_before_collapse": 12,
        "signals": [
            {
                "id": "headcount_declining",
                "description": "Headcount and hiring declining week over week",
                "weight": 0.25,
                "check": "Look in job signals for: hiring freeze, layoffs, reduced headcount, fewer open roles than expected",
            },
            {
                "id": "customer_success_gone",
                "description": "Customer success and support roles disappearing",
                "weight": 0.20,
                "check": "Look in job signals for: reduced customer success, no support hiring, cutting customer facing roles",
            },
            {
                "id": "review_score_drop",
                "description": "Review scores dropping significantly",
                "weight": 0.25,
                "check": "Look in review signals for: rating dropped, declining satisfaction, worse than last year",
            },
            {
                "id": "news_sentiment_negative",
                "description": "News sentiment consistently negative",
                "weight": 0.15,
                "check": "Look in news signals for: negative coverage, criticism, controversy, declining metrics reported",
            },
            {
                "id": "upmarket_pivot",
                "description": "Desperate upmarket pivot while core metrics decline",
                "weight": 0.15,
                "check": "Look in pricing/job signals for: enterprise pivot, targeting larger customers while SMB abandoned",
            },
        ],
    },
    "overextension": {
        "name": "The Overextension",
        "description": "Pattern preceding collapses from growing too fast like SVB",
        "historical_examples": ["SVB (2023)", "Celsius Network (2022)", "Fast.co (2022)"],
        "avg_weeks_before_collapse": 8,
        "signals": [
            {
                "id": "hiring_all_directions",
                "description": "Hiring in too many directions simultaneously",
                "weight": 0.20,
                "check": "Look in job signals for: hiring across 10+ departments, roles in unrelated areas, chaotic expansion",
            },
            {
                "id": "pr_over_product",
                "description": "PR announcements outpacing actual product news",
                "weight": 0.20,
                "check": "Look in news signals for: more press releases than product launches, hype without substance",
            },
            {
                "id": "prestige_executive_hiring",
                "description": "Hiring executives from prestige firms for optics",
                "weight": 0.15,
                "check": "Look in job/news signals for: hiring from Goldman, McKinsey, ex-Google, ex-Apple for non-technical roles",
            },
            {
                "id": "security_ignored",
                "description": "Security exposure signals ignored or worsening",
                "weight": 0.25,
                "check": "Look in security signals for: breach exposure, credentials found, security score declining",
            },
            {
                "id": "pricing_expansion",
                "description": "Aggressive pricing expansion while reviews decline",
                "weight": 0.20,
                "check": "Look in pricing signals for: price increases, new expensive tiers while customer satisfaction drops",
            },
        ],
    },
}


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clamp_score(value: Any) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _risk_level(match_percentage: int) -> str:
    if match_percentage > 70:
        return "CRITICAL"
    if match_percentage >= 50:
        return "HIGH"
    if match_percentage >= 30:
        return "ELEVATED"
    return "LOW"


def _signals_text(analysis_result: dict[str, Any]) -> str:
    parts = [
        str(analysis_result.get("gtm_summary", "")),
        str(analysis_result.get("financial_summary", "")),
        str(analysis_result.get("security_summary", "")),
    ]
    signals = analysis_result.get("signals", [])
    if isinstance(signals, str):
        try:
            signals = json.loads(signals)
        except json.JSONDecodeError:
            signals = []

    if isinstance(signals, list):
        for signal in signals:
            if not isinstance(signal, dict):
                continue
            parts.extend(
                [
                    str(signal.get("title", "")),
                    str(signal.get("detail", "")),
                    str(signal.get("source", "")),
                ]
            )

    return "\n".join(part for part in parts if part.strip())


async def _claude_json(prompt: str, max_tokens: int = 600) -> dict[str, Any]:
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
    return _extract_json(_message_text(response))


async def _claude_text(prompt: str, max_tokens: int = 900) -> str:
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


async def _score_signal(company: str, signals_text: str, signal: dict[str, Any]) -> dict[str, Any]:
    prompt = f"""
Given this intelligence data about {company}:
{signals_text}

Rate from 0.0 to 1.0 how strongly this collapse warning signal is present:
Signal: {signal['description']}
What to look for: {signal['check']}

0.0 = no evidence at all
0.5 = some weak evidence
1.0 = strong clear evidence

Return ONLY a JSON object: {{"score": 0.0, "evidence": "one sentence explanation"}}
""".strip()
    try:
        payload = await _claude_json(prompt)
        score = _clamp_score(payload.get("score"))
        evidence = str(payload.get("evidence", "No evidence found."))
    except Exception as exc:
        score = 0.0
        evidence = f"Sentinel scoring unavailable: {exc}"

    return {
        "signal_id": str(signal["id"]),
        "description": str(signal["description"]),
        "score": score,
        "evidence": evidence,
        "weighted_score": score * float(signal["weight"]),
    }


async def _alert_message(
    company: str,
    signals_text: str,
    pattern_id: str,
    pattern: dict[str, Any],
    match_percentage: int,
) -> str:
    examples = ", ".join(pattern["historical_examples"])
    prompt = f"""
Based on this intelligence about {company} and the fact it matches {pattern['name']}
at {match_percentage}% — the same pattern seen before {examples} collapsed —
write a 2-3 sentence SENTINEL ALERT explaining specifically what signals are
most concerning and what could happen in the next 4-8 weeks if the trend continues.
Be specific. Reference actual signals found. This is for professional analysts.

Pattern id: {pattern_id}
Intelligence:
{signals_text}
""".strip()
    try:
        return await _claude_text(prompt)
    except Exception as exc:
        return f"Sentinel alert generation unavailable: {exc}"


async def run_sentinel(company: str, domain: str, analysis_result: dict[str, Any]) -> dict[str, Any]:
    signals_text = _signals_text(analysis_result)
    all_patterns = []
    pattern_details = {}

    for pattern_id, pattern in COLLAPSE_PATTERNS.items():
        scored_signals = await asyncio.gather(
            *[_score_signal(company, signals_text, signal) for signal in pattern["signals"]]
        )
        match_percentage = round(sum(signal["weighted_score"] for signal in scored_signals) * 100)
        matched_signals = [
            {
                "signal_id": signal["signal_id"],
                "description": signal["description"],
                "score": signal["score"],
                "evidence": signal["evidence"],
            }
            for signal in scored_signals
            if signal["score"] >= 0.2
        ]
        all_patterns.append(
            {
                "id": pattern_id,
                "name": pattern["name"],
                "match_percentage": match_percentage,
            }
        )
        pattern_details[pattern_id] = {
            "id": pattern_id,
            "name": pattern["name"],
            "match_percentage": match_percentage,
            "historical_examples": pattern["historical_examples"],
            "avg_weeks_before_collapse": pattern["avg_weeks_before_collapse"],
            "alert_message": "",
            "matched_signals": matched_signals,
        }

    all_patterns.sort(key=lambda item: item["match_percentage"], reverse=True)
    highest_id = str(all_patterns[0]["id"])
    highest_pattern = pattern_details[highest_id]

    if highest_pattern["match_percentage"] >= 30:
        highest_pattern["alert_message"] = await _alert_message(
            company,
            signals_text,
            highest_id,
            COLLAPSE_PATTERNS[highest_id],
            highest_pattern["match_percentage"],
        )

    return {
        "sentinel_active": highest_pattern["match_percentage"] >= 30,
        "highest_pattern": highest_pattern,
        "all_patterns": all_patterns,
        "risk_level": _risk_level(highest_pattern["match_percentage"]),
        "company": company,
        "domain": domain,
        "analyzed_at": _iso_now(),
    }
