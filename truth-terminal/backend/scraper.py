import os
import re
from collections import Counter
from typing import Any
from urllib.parse import quote_plus

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv


BRIGHTDATA_ENDPOINT = "https://api.brightdata.com/request"
REQUEST_TIMEOUT_SECONDS = 30

load_dotenv()


def _empty_jobs_data(company: str, domain: str, error: str | None = None) -> dict[str, Any]:
    return {
        "error": error,
        "data": {
            "company": company,
            "domain": domain,
            "sources": {
                "linkedin": f"https://www.linkedin.com/jobs/search/?keywords={quote_plus(company)}",
                "company_jobs": {
                    "url": f"https://jobs.{domain.strip('/')}",
                    "exists": False,
                },
            },
            "total_job_count": 0,
            "job_titles": [],
            "departments": [],
            "locations": [],
        },
    }


def _empty_reviews_data(company: str, error: str | None = None) -> dict[str, Any]:
    slug = quote_plus(company.replace(" ", "-"))
    return {
        "error": error,
        "data": {
            "company": company,
            "source": f"https://www.glassdoor.com/Reviews/{slug}-reviews.htm",
            "overall_rating": None,
            "rating_90_days_ago": None,
            "rating_now": None,
            "recent_review_excerpts": [],
            "common_complaints": [],
        },
    }


def _empty_pricing_data(domain: str, error: str | None = None) -> dict[str, Any]:
    return {
        "error": error,
        "data": {
            "domain": domain,
            "source": f"https://{domain.strip('/')}/pricing",
            "pricing_tiers": [],
            "prices": [],
            "enterprise_or_custom_tier_mentions": [],
        },
    }


def _empty_news_data(company: str, error: str | None = None) -> dict[str, Any]:
    return {
        "error": error,
        "data": {
            "company": company,
            "source": f"https://www.google.com/search?q={quote_plus(company + ' news')}&tbm=nws",
            "headlines": [],
        },
    }


async def _fetch_with_brightdata(url: str, zone: str | None = None) -> str:
    api_token = os.getenv("BRIGHTDATA_API_TOKEN")
    brightdata_zone = zone or os.getenv("BRIGHTDATA_ZONE")

    if not api_token:
        raise ValueError("BRIGHTDATA_API_TOKEN is not set")
    if not brightdata_zone:
        raise ValueError("BRIGHTDATA_ZONE is not set")

    headers = {"Authorization": f"Bearer {api_token}"}
    payload = {"zone": brightdata_zone, "url": url, "format": "raw"}

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.post(BRIGHTDATA_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        return response.text


def _soup(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "lxml")


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    results: list[str] = []

    for value in values:
        clean_value = _clean_text(value)
        key = clean_value.lower()
        if clean_value and key not in seen:
            seen.add(key)
            results.append(clean_value)

    return results


def _texts_for_selectors(soup: BeautifulSoup, selectors: list[str]) -> list[str]:
    values: list[str] = []

    for selector in selectors:
        values.extend(element.get_text(" ", strip=True) for element in soup.select(selector))

    return _unique(values)


def _extract_rating(text: str) -> str | None:
    rating_match = re.search(r"\b([0-5](?:\.\d)?)\s*(?:out of\s*)?5\b", text, re.IGNORECASE)
    if rating_match:
        return rating_match.group(1)
    return None


def _extract_prices(text: str) -> list[str]:
    return _unique(re.findall(r"\$\s?\d+(?:,\d{3})*(?:\.\d{2})?(?:\s*/\s?\w+)?", text))


def _infer_departments(titles: list[str]) -> list[str]:
    department_keywords = {
        "Engineering": ["engineer", "developer", "software", "devops", "platform", "frontend", "backend"],
        "Product": ["product manager", "product designer", "ux", "ui"],
        "Sales": ["sales", "account executive", "business development"],
        "Marketing": ["marketing", "growth", "content", "brand"],
        "Customer Success": ["customer success", "support", "solutions"],
        "Operations": ["operations", "people", "recruiter", "talent", "finance", "legal"],
        "Data": ["data", "analytics", "scientist", "machine learning", "ai"],
    }
    departments: list[str] = []

    for title in titles:
        title_lower = title.lower()
        for department, keywords in department_keywords.items():
            if any(keyword in title_lower for keyword in keywords):
                departments.append(department)

    return _unique(departments)


def _sentiment_for_text(text: str) -> str:
    positive_terms = {"growth", "raises", "launches", "wins", "profit", "record", "expands", "partnership"}
    negative_terms = {"layoff", "lawsuit", "loss", "decline", "probe", "breach", "cuts", "bankruptcy"}
    words = set(re.findall(r"[a-z]+", text.lower()))

    positive_score = len(words & positive_terms)
    negative_score = len(words & negative_terms)

    if positive_score > negative_score:
        return "positive"
    if negative_score > positive_score:
        return "negative"
    return "neutral"


async def scrape_jobs(company: str, domain: str) -> dict[str, Any]:
    try:
        linkedin_url = f"https://www.linkedin.com/jobs/search/?keywords={quote_plus(company)}"
        linkedin_html = await _fetch_with_brightdata(linkedin_url)
        linkedin_soup = _soup(linkedin_html)

        title_selectors = [
            ".base-search-card__title",
            ".job-card-list__title",
            "[data-tracking-control-name='public_jobs_jserp-result_search-card'] h3",
            "h3",
        ]
        location_selectors = [
            ".job-search-card__location",
            ".job-card-container__metadata-item",
            ".base-search-card__metadata",
        ]

        titles = _texts_for_selectors(linkedin_soup, title_selectors)
        locations = _texts_for_selectors(linkedin_soup, location_selectors)
        count_text = linkedin_soup.get_text(" ", strip=True)
        count_match = re.search(r"([\d,]+)\s+(?:jobs|results)", count_text, re.IGNORECASE)
        total_job_count = int(count_match.group(1).replace(",", "")) if count_match else len(titles)

        company_jobs_url = f"https://jobs.{domain.strip('/')}"
        company_jobs_data: dict[str, Any] = {"url": company_jobs_url, "exists": False}

        try:
            company_jobs_html = await _fetch_with_brightdata(company_jobs_url)
            company_jobs_soup = _soup(company_jobs_html)
            company_titles = _texts_for_selectors(company_jobs_soup, ["h1", "h2", "h3", "[class*='job']"])
            company_locations = _texts_for_selectors(
                company_jobs_soup,
                ["[class*='location']", "[class*='office']", "[class*='city']"],
            )
            titles = _unique(titles + company_titles)
            locations = _unique(locations + company_locations)
            company_jobs_data = {
                "url": company_jobs_url,
                "exists": True,
                "job_titles": company_titles,
                "locations": company_locations,
            }
        except Exception as exc:
            company_jobs_data = {"url": company_jobs_url, "exists": False, "error": str(exc)}

        return {
            "error": None,
            "data": {
                "company": company,
                "domain": domain,
                "sources": {
                    "linkedin": linkedin_url,
                    "company_jobs": company_jobs_data,
                },
                "total_job_count": total_job_count,
                "job_titles": titles,
                "departments": _infer_departments(titles),
                "locations": locations,
            },
        }
    except (httpx.HTTPError, TimeoutError, ValueError) as exc:
        return _empty_jobs_data(company, domain, str(exc))
    except Exception as exc:
        return _empty_jobs_data(company, domain, str(exc))


async def scrape_reviews(company: str) -> dict[str, Any]:
    try:
        slug = quote_plus(company.replace(" ", "-"))
        url = f"https://www.glassdoor.com/Reviews/{slug}-reviews.htm"
        html = await _fetch_with_brightdata(url)
        soup = _soup(html)
        page_text = soup.get_text(" ", strip=True)

        review_selectors = [
            "[data-test='review-details-container']",
            ".gdReview",
            "[class*='review']",
        ]
        review_texts = _texts_for_selectors(soup, review_selectors)
        recent_excerpts = [_clean_text(text)[:300] for text in review_texts[:5]]

        complaint_terms = [
            "management",
            "compensation",
            "work life balance",
            "benefits",
            "career growth",
            "culture",
            "leadership",
            "workload",
            "communication",
        ]
        complaints = Counter()
        lower_text = page_text.lower()
        for term in complaint_terms:
            complaints[term] = lower_text.count(term)

        ratings = re.findall(r"\b[0-5](?:\.\d)?\b", page_text)

        return {
            "error": None,
            "data": {
                "company": company,
                "source": url,
                "overall_rating": _extract_rating(page_text),
                "rating_90_days_ago": ratings[1] if len(ratings) > 1 else None,
                "rating_now": ratings[0] if ratings else _extract_rating(page_text),
                "recent_review_excerpts": recent_excerpts,
                "common_complaints": [term for term, count in complaints.most_common(5) if count > 0],
            },
        }
    except (httpx.HTTPError, TimeoutError, ValueError) as exc:
        return _empty_reviews_data(company, str(exc))
    except Exception as exc:
        return _empty_reviews_data(company, str(exc))


async def scrape_pricing(domain: str) -> dict[str, Any]:
    try:
        url = f"https://{domain.strip('/')}/pricing"
        html = await _fetch_with_brightdata(url)
        soup = _soup(html)
        page_text = soup.get_text(" ", strip=True)
        tier_blocks = soup.select("[class*='pricing'], [class*='plan'], [class*='tier'], article, section")

        tiers: list[dict[str, Any]] = []
        for block in tier_blocks:
            block_text = _clean_text(block.get_text(" ", strip=True))
            heading = block.find(["h1", "h2", "h3", "h4"])
            if not heading or len(block_text) < 3:
                continue

            tiers.append(
                {
                    "name": _clean_text(heading.get_text(" ", strip=True)),
                    "prices": _extract_prices(block_text),
                    "description": block_text[:500],
                }
            )

        enterprise_terms = re.findall(r"\b(?:enterprise|custom|contact sales|talk to sales)\b", page_text, re.IGNORECASE)

        return {
            "error": None,
            "data": {
                "domain": domain,
                "source": url,
                "pricing_tiers": tiers,
                "prices": _extract_prices(page_text),
                "enterprise_or_custom_tier_mentions": _unique(enterprise_terms),
            },
        }
    except (httpx.HTTPError, TimeoutError, ValueError) as exc:
        return _empty_pricing_data(domain, str(exc))
    except Exception as exc:
        return _empty_pricing_data(domain, str(exc))


async def scrape_news(company: str) -> dict[str, Any]:
    try:
        serp_zone = os.getenv("BRIGHTDATA_SERP_ZONE")
        if not serp_zone:
            raise ValueError("BRIGHTDATA_SERP_ZONE is not set")

        url = f"https://www.google.com/search?q={quote_plus(company + ' news')}&tbm=nws"
        html = await _fetch_with_brightdata(url, zone=serp_zone)
        soup = _soup(html)
        results: list[dict[str, str | None]] = []

        for result in soup.select("a"):
            headline = _clean_text(result.get_text(" ", strip=True))
            if not headline or len(headline) < 10:
                continue

            parent_text = _clean_text(result.parent.get_text(" ", strip=True) if result.parent else headline)
            date_match = re.search(
                r"\b(?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b",
                parent_text,
            )
            results.append(
                {
                    "headline": headline,
                    "date": date_match.group(0) if date_match else None,
                    "sentiment": _sentiment_for_text(headline),
                }
            )

            if len(results) == 10:
                break

        return {
            "error": None,
            "data": {
                "company": company,
                "source": url,
                "headlines": results,
            },
        }
    except (httpx.HTTPError, TimeoutError, ValueError) as exc:
        return _empty_news_data(company, str(exc))
    except Exception as exc:
        return _empty_news_data(company, str(exc))
