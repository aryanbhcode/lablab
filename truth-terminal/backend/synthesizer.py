import json
import os
import re
from typing import Any

from anthropic import AsyncAnthropic
from dotenv import load_dotenv


MODEL = "claude-sonnet-4-20250514"

load_dotenv()


def _fallback_synthesis() -> dict[str, Any]:
    return {
        "gtm_score": 50,
        "financial_score": 50,
        "security_score": 50,
        "truth_score": 50,
        "gtm_summary": "Analysis incomplete because the model response could not be parsed.",
        "financial_summary": "Analysis incomplete because the model response could not be parsed.",
        "security_summary": "Analysis incomplete because the model response could not be parsed.",
        "signals": [
            {
                "category": "gtm",
                "severity": "warning",
                "title": "Analysis incomplete - raw data available",
                "detail": "Claude returned a response that was not valid JSON. The scraped source data is still available for a retry or manual review.",
                "source": "Claude synthesis",
            }
        ],
    }


def _build_prompt(company: str, scraped_data: dict[str, Any]) -> str:
    scraped_json = json.dumps(scraped_data, indent=2, sort_keys=True, default=str)

    return f"""
You are analyzing scraped company intelligence for {company}.

The raw scraped_data dict contains these top-level keys: jobs, reviews, pricing, news.
Use only the data below. Be specific and cite the actual data found.

Scoring instructions:
- gtm_score: based on hiring velocity, sales/marketing headcount, expansion signals.
- financial_score: based on pricing changes, headcount changes, revenue signals in news.
- security_score: 100 = totally clean, lower = more exposure found, including paste sites or breach mentions.
- truth_score: weighted average using gtm 30%, financial 40%, security 30%.
- Return 5-8 signals total across all categories.

Return ONLY valid JSON. Do not include markdown, code fences, commentary, or explanations.
The JSON must match this exact schema:
{{
  "gtm_score": 0-100,
  "financial_score": 0-100,
  "security_score": 0-100,
  "truth_score": 0-100,
  "gtm_summary": "1 sentence",
  "financial_summary": "1 sentence",
  "security_summary": "1 sentence",
  "signals": [
    {{
      "category": "gtm" | "financial" | "security",
      "severity": "positive" | "warning" | "critical",
      "title": "short title",
      "detail": "2 sentence explanation",
      "source": "where this came from"
    }}
  ]
}}

Scraped data:
{scraped_json}
""".strip()


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


async def synthesize(company: str, scraped_data: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return {"error": "ANTHROPIC_API_KEY is not set", "data": None}

    try:
        client = AsyncAnthropic(api_key=api_key)
        response = await client.messages.create(
            model=MODEL,
            max_tokens=4000,
            temperature=0,
            messages=[
                {
                    "role": "user",
                    "content": _build_prompt(company, scraped_data),
                }
            ],
        )
        raw_text = _message_text(response)
        try:
            return _extract_json(raw_text)
        except json.JSONDecodeError:
            print(f"[truth-terminal] invalid Claude JSON response: {raw_text}", flush=True)
            return _fallback_synthesis()
    except json.JSONDecodeError as exc:
        print(f"[truth-terminal] failed to parse Claude JSON response: {exc}", flush=True)
        return _fallback_synthesis()
    except Exception as exc:
        return {"error": str(exc), "data": None}
