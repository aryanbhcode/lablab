import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DB_PATH = Path(__file__).resolve().parent / "truth_terminal.db"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


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


def save_analysis(company: str, domain: str, result_dict: dict[str, Any]) -> int:
    signals = result_dict.get("signals", [])
    scraped_at = result_dict.get("scraped_at") or _iso_now()

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
                scraped_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                company,
                domain,
                result_dict.get("gtm_score"),
                result_dict.get("financial_score"),
                result_dict.get("security_score"),
                result_dict.get("truth_score"),
                json.dumps(signals, default=str),
                scraped_at,
            ),
        )
        return int(cursor.lastrowid)


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
                scraped_at
            FROM analyses
            WHERE company = ? AND domain = ?
            ORDER BY scraped_at DESC, id DESC
            LIMIT 1
            """,
            (company, domain),
        ).fetchone()
        return _row_to_dict(row)


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
