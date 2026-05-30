import json
import os
import re
from typing import Any

from anthropic import AsyncAnthropic
from dotenv import load_dotenv

from database import get_analysis_history


MODEL = "claude-sonnet-4-5"

load_dotenv()


def _extract_json(raw_text: str) -> dict[str, Any]:
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        json_match = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if not json_match:
            raise
        return json.loads(json_match.group(0))


def _message_text(response: Any) -> str:
    text_parts: list[str] = []

    for block in response.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)

    return "".join(text_parts).strip()


def _signal_titles(analysis: dict[str, Any]) -> str:
    signals = analysis.get("signals", [])
    if not isinstance(signals, list):
        return "none"

    titles = [str(signal.get("title", "")).strip() for signal in signals if isinstance(signal, dict)]
    titles = [title for title in titles if title]
    return ", ".join(titles) if titles else "none"


def _build_prompt(company: str, history: list[dict[str, Any]]) -> str:
    ordered_history = list(reversed(history))
    lines = []

    for analysis in ordered_history:
        lines.append(
            "\n".join(
                [
                    f"Date: {analysis.get('scraped_at')}",
                    f"truth_score: {analysis.get('truth_score')}",
                    f"gtm_score: {analysis.get('gtm_score')}",
                    f"financial_score: {analysis.get('financial_score')}",
                    f"security_score: {analysis.get('security_score')}",
                    f"signal titles: {_signal_titles(analysis)}",
                ]
            )
        )

    historical_data = "\n\n".join(lines)

    return f"""
You are a predictive intelligence analyst. Here is the historical analysis data for {company}
over the last {len(history)} monitoring runs, ordered from oldest to newest:

{historical_data}

Based on these patterns, provide 3 specific predictions about what will happen with this company
in the next 30-90 days. Be specific and bold. Reference the actual data patterns you see.

Return ONLY valid JSON with double-quoted keys and string values:
{{
  "predictions": [
    {{
      "timeframe": "30 days" | "60 days" | "90 days",
      "category": "gtm" | "financial" | "security",
      "prediction": "specific bold prediction in one sentence",
      "reasoning": "what pattern in the data led to this prediction",
      "confidence": "high" | "medium" | "low",
      "signal_direction": "positive" | "negative" | "neutral"
    }}
  ],
  "overall_trajectory": "one sentence summary of where this company is headed",
  "biggest_risk": "the single most important thing to watch",
  "biggest_opportunity": "the single most important positive signal"
}}
""".strip()


async def generate_predictions(company: str, domain: str) -> dict[str, Any]:
    try:
        history = get_analysis_history(company, domain)

        if len(history) < 2:
            return {
                "predictions": [],
                "confidence": "low",
                "message": "Need more data points to predict",
            }

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return {"predictions": [], "error": "ANTHROPIC_API_KEY is not set"}

        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=MODEL,
            max_tokens=2500,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": _build_prompt(company, history),
                }
            ],
        )

        return _extract_json(_message_text(response))
    except Exception as exc:
        return {"predictions": [], "error": str(exc)}

async def generate_predictions_by_domain(domain: str) -> dict:
    # Try domain as company name first, then try capitalized, then just use domain
    from database import DB_PATH
    import sqlite3

    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT DISTINCT company FROM analyses WHERE domain = ? ORDER BY scraped_at DESC LIMIT 1",
        (domain,)
    ).fetchone()
    conn.close()
    
    if rows:
        company = rows[0]
    else:
        company = domain
    
    return await generate_predictions(company, domain)
