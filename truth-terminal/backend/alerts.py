import json
import os
from html import escape
from typing import Any

import resend
from dotenv import load_dotenv


load_dotenv()
resend.api_key = os.getenv("RESEND_API_KEY")


SCORE_FIELDS = ("truth_score", "gtm_score", "financial_score", "security_score")


def _as_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_signals(result: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not result:
        return []

    signals = result.get("signals", [])
    if isinstance(signals, str):
        try:
            signals = json.loads(signals)
        except json.JSONDecodeError:
            return []

    if not isinstance(signals, list):
        return []

    return [signal for signal in signals if isinstance(signal, dict)]


def _score_threshold(field: str) -> int:
    return 5 if field == "truth_score" else 10


def format_changes(old_result: dict[str, Any] | None, new_result: dict[str, Any]) -> list[dict[str, Any]]:
    changes: list[dict[str, Any]] = []

    for field in SCORE_FIELDS:
        old_score = _as_int(old_result.get(field) if old_result else None)
        new_score = _as_int(new_result.get(field))

        if old_score is None or new_score is None:
            continue

        if abs(new_score - old_score) > _score_threshold(field):
            changes.append(
                {
                    "field": field,
                    "old": old_score,
                    "new": new_score,
                    "direction": "up" if new_score > old_score else "down",
                }
            )

    old_signal_titles = {
        str(signal.get("title", "")).strip().lower()
        for signal in _parse_signals(old_result)
        if signal.get("title")
    }

    for signal in _parse_signals(new_result):
        title = str(signal.get("title", "")).strip()
        if title and title.lower() not in old_signal_titles:
            changes.append(
                {
                    "field": "new_signal",
                    "title": title,
                    "severity": signal.get("severity", "warning"),
                    "detail": signal.get("detail", ""),
                    "source": signal.get("source", ""),
                }
            )

    return changes


def _score_card(label: str, value: Any) -> str:
    score = escape(str(value if value is not None else "N/A"))
    return f"""
      <td style="padding:14px;border:1px solid #263241;background:#111820;">
        <div style="font-size:11px;color:#8a98aa;text-transform:uppercase;letter-spacing:1px;">{escape(label)}</div>
        <div style="font-size:30px;color:#f6f8fb;font-weight:800;margin-top:6px;">{score}</div>
      </td>
    """


def build_email_html(company: str, changes: list[dict[str, Any]], new_result: dict[str, Any]) -> str:
    score_changes = [change for change in changes if change.get("field") != "new_signal"]
    new_signals = [change for change in changes if change.get("field") == "new_signal"]

    if score_changes:
        changed_rows = "".join(
            f"""
            <tr>
              <td style="padding:12px 0;color:#dce5ef;">{escape(str(change["field"]).replace("_", " ").title())}</td>
              <td style="padding:12px 0;color:#7f8da0;text-align:right;">{escape(str(change["old"]))}</td>
              <td style="padding:12px 12px;color:{'#33d17a' if change["direction"] == "up" else '#ff5c7a'};text-align:center;font-weight:800;">
                {'↑' if change["direction"] == "up" else '↓'}
              </td>
              <td style="padding:12px 0;color:#f6f8fb;text-align:right;font-weight:800;">{escape(str(change["new"]))}</td>
            </tr>
            """
            for change in score_changes
        )
    else:
        changed_rows = """
            <tr>
              <td colspan="4" style="padding:12px 0;color:#7f8da0;">No major score changes crossed the alert threshold.</td>
            </tr>
        """

    if new_signals:
        signal_items = "".join(
            f"""
            <li style="margin:0 0 14px 0;padding:14px;border:1px solid #263241;background:#111820;list-style:none;">
              <div style="color:#ff5c7a;font-size:11px;text-transform:uppercase;letter-spacing:1px;">{escape(str(signal.get("severity", "warning")))}</div>
              <div style="color:#f6f8fb;font-size:16px;font-weight:800;margin-top:6px;">{escape(str(signal.get("title", "")))}</div>
              <div style="color:#aab6c5;font-size:13px;line-height:1.6;margin-top:8px;">{escape(str(signal.get("detail", "")))}</div>
              <div style="color:#6f7d8f;font-size:12px;margin-top:8px;">{escape(str(signal.get("source", "")))}</div>
            </li>
            """
            for signal in new_signals
        )
    else:
        signal_items = '<li style="color:#7f8da0;list-style:none;">No new signals detected.</li>'

    return f"""
<!doctype html>
<html>
  <body style="margin:0;background:#07090d;color:#f6f8fb;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;">
    <div style="max-width:720px;margin:0 auto;padding:32px 20px;">
      <div style="border:1px solid #263241;background:#0c1118;padding:28px;">
        <div style="color:#33d17a;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Corporate Truth Terminal</div>
        <h1 style="margin:10px 0 0 0;font-size:28px;line-height:1.2;color:#f6f8fb;">⚡ TRUTH TERMINAL ALERT — {escape(company)}</h1>
        <p style="margin:14px 0 0 0;color:#aab6c5;line-height:1.6;">Automated watchlist analysis detected material movement.</p>

        <h2 style="margin:32px 0 12px 0;color:#f6f8fb;font-size:15px;letter-spacing:2px;text-transform:uppercase;">WHAT CHANGED</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #263241;border-bottom:1px solid #263241;">
          {changed_rows}
        </table>

        <h2 style="margin:32px 0 12px 0;color:#f6f8fb;font-size:15px;letter-spacing:2px;text-transform:uppercase;">NEW SIGNALS</h2>
        <ul style="margin:0;padding:0;">{signal_items}</ul>

        <h2 style="margin:32px 0 12px 0;color:#f6f8fb;font-size:15px;letter-spacing:2px;text-transform:uppercase;">CURRENT SCORES</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
          <tr>
            {_score_card("Truth", new_result.get("truth_score"))}
            {_score_card("GTM", new_result.get("gtm_score"))}
          </tr>
          <tr>
            {_score_card("Financial", new_result.get("financial_score"))}
            {_score_card("Security", new_result.get("security_score"))}
          </tr>
        </table>

        <p style="margin:30px 0 0 0;color:#6f7d8f;font-size:12px;">Powered by Corporate Truth Terminal</p>
      </div>
    </div>
  </body>
</html>
""".strip()


async def send_alert(
    email: str,
    company: str,
    old_result: dict[str, Any] | None,
    new_result: dict[str, Any],
    changes: list[Any],
) -> None:
    formatted_changes = changes if changes and isinstance(changes[0], dict) else format_changes(old_result, new_result)

    if not formatted_changes:
        return

    try:
        html = build_email_html(company, formatted_changes, new_result)
        response = resend.Emails.send(
            {
                "from": "onboarding@resend.dev",
                "to": email,
                "subject": f"⚡ {company} truth score changed — Truth Terminal",
                "html": html,
            }
        )
        print(f"[truth-terminal] alert sent email={email} company={company} response={response}", flush=True)
    except Exception as exc:
        print(f"[truth-terminal] alert failed email={email} company={company} error={exc}", flush=True)
