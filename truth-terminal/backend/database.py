from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DB_PATH = Path(os.getenv("DATABASE_PATH", Path(__file__).resolve().parent / "truth_terminal.db")).expanduser()


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


def _parse_signals(row: dict[str, Any]) -> dict[str, Any]:
    signals = row.get("signals")
    if isinstance(signals, str):
        try:
            row["signals"] = json.loads(signals)
        except json.JSONDecodeError:
            row["signals"] = []
    elif signals is None:
        row["signals"] = []
    return row


def _parse_json_field(row: dict[str, Any], key: str, fallback: Any) -> dict[str, Any]:
    value = row.get(key)
    if isinstance(value, str) and value:
        try:
            row[key] = json.loads(value)
        except json.JSONDecodeError:
            row[key] = fallback
    elif value is None:
        row[key] = fallback
    return row


def _ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table})").fetchall()
    }
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                domain TEXT NOT NULL,
                email TEXT NOT NULL,
                created_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company TEXT NOT NULL,
                domain TEXT NOT NULL,
                gtm_score INTEGER,
                financial_score INTEGER,
                security_score INTEGER,
                truth_score INTEGER,
                signals TEXT,
                scraped_at TEXT
            )
            """
        )
        _ensure_column(connection, "analyses", "gtm_summary", "TEXT")
        _ensure_column(connection, "analyses", "financial_summary", "TEXT")
        _ensure_column(connection, "analyses", "security_summary", "TEXT")
        _ensure_column(connection, "analyses", "sentinel_json", "TEXT")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS queries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                answer TEXT NOT NULL,
                asked_at TEXT
            )
            """
        )


def add_to_watchlist(company: str, domain: str, email: str) -> int:
    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO watchlist (company, domain, email, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (company, domain, email, _iso_now()),
        )
        return int(cursor.lastrowid)


def get_watchlist() -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, company, domain, email, created_at
            FROM watchlist
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
        return [dict(row) for row in rows]


def save_analysis(company: str, domain: str, result_dict: dict[str, Any], sentinel_json: dict[str, Any] | None = None) -> int:
    signals = result_dict.get("signals", [])
    scraped_at = result_dict.get("scraped_at") or _iso_now()
    sentinel_payload = sentinel_json if sentinel_json is not None else result_dict.get("sentinel")

    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO analyses (
                company,
                domain,
                gtm_score,
                financial_score,
                security_score,
                truth_score,
                signals,
                gtm_summary,
                financial_summary,
                security_summary,
                sentinel_json,
                scraped_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company,
                domain,
                result_dict.get("gtm_score"),
                result_dict.get("financial_score"),
                result_dict.get("security_score"),
                result_dict.get("truth_score"),
                json.dumps(signals, default=str),
                result_dict.get("gtm_summary"),
                result_dict.get("financial_summary"),
                result_dict.get("security_summary"),
                json.dumps(sentinel_payload, default=str) if sentinel_payload else None,
                scraped_at,
            ),
        )
        return int(cursor.lastrowid)


def save_sentinel_result(company: str, domain: str, sentinel_result: dict[str, Any], scraped_at: str | None = None) -> int:
    with _connect() as connection:
        if scraped_at:
            cursor = connection.execute(
                """
                UPDATE analyses
                SET sentinel_json = ?
                WHERE id = (
                    SELECT id FROM analyses
                    WHERE company = ? AND domain = ? AND scraped_at = ?
                    ORDER BY id DESC
                    LIMIT 1
                )
                """,
                (json.dumps(sentinel_result, default=str), company, domain, scraped_at),
            )
            if cursor.rowcount:
                return cursor.rowcount

        cursor = connection.execute(
            """
            UPDATE analyses
            SET sentinel_json = ?
            WHERE id = (
                SELECT id FROM analyses
                WHERE company = ? AND domain = ?
                ORDER BY scraped_at DESC, id DESC
                LIMIT 1
            )
            """,
            (json.dumps(sentinel_result, default=str), company, domain),
        )
        return cursor.rowcount


def get_last_analysis(company: str, domain: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                company,
                domain,
                gtm_score,
                financial_score,
                security_score,
                truth_score,
                signals,
                gtm_summary,
                financial_summary,
                security_summary,
                sentinel_json,
                scraped_at
            FROM analyses
            WHERE company = ? AND domain = ?
            ORDER BY scraped_at DESC, id DESC
            LIMIT 1
            """,
            (company, domain),
        ).fetchone()
        parsed = _row_to_dict(row)
        if parsed is None:
            return None
        _parse_signals(parsed)
        return _parse_json_field(parsed, "sentinel_json", None)


def get_last_analysis_by_domain(domain: str) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                company,
                domain,
                gtm_score,
                financial_score,
                security_score,
                truth_score,
                signals,
                gtm_summary,
                financial_summary,
                security_summary,
                sentinel_json,
                scraped_at
            FROM analyses
            WHERE domain = ?
            ORDER BY scraped_at DESC, id DESC
            LIMIT 1
            """,
            (domain,),
        ).fetchone()
        parsed = _row_to_dict(row)
        if parsed is None:
            return None
        _parse_signals(parsed)
        return _parse_json_field(parsed, "sentinel_json", None)


def get_analysis_history(company: str, domain: str, limit: int = 10) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                company,
                domain,
                gtm_score,
                financial_score,
                security_score,
                truth_score,
                signals,
                gtm_summary,
                financial_summary,
                security_summary,
                sentinel_json,
                scraped_at
            FROM analyses
            WHERE company = ? AND domain = ?
            ORDER BY scraped_at DESC
            LIMIT ?
            """,
            (company, domain, limit),
        ).fetchall()
        history = []
        for row in rows:
            parsed = _parse_signals(dict(row))
            history.append(_parse_json_field(parsed, "sentinel_json", None))
        return history


def get_total_analyses_count() -> int:
    with _connect() as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM analyses").fetchone()
        return int(row["count"] if row else 0)


def save_query(question: str, answer: str) -> int:
    with _connect() as connection:
        cursor = connection.execute(
            """
            INSERT INTO queries (question, answer, asked_at)
            VALUES (?, ?, ?)
            """,
            (question, answer, _iso_now()),
        )
        return int(cursor.lastrowid)


def get_query_history(limit: int = 10) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT question, answer, asked_at
            FROM queries
            ORDER BY asked_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def delete_from_watchlist(company: str, domain: str | None = None) -> int:
    with _connect() as connection:
        if domain is None:
            cursor = connection.execute(
                """
                DELETE FROM watchlist
                WHERE company = ?
                """,
                (company,),
            )
        else:
            cursor = connection.execute(
                """
                DELETE FROM watchlist
                WHERE company = ? AND domain = ?
                """,
                (company, domain),
            )
        return cursor.rowcount
