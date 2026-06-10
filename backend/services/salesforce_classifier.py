import os
import json
import logging
import asyncio
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# ── Fixed category taxonomy ────────────────────────────────────────────────────
CATEGORIES = [
    "UI / Frontend Issue",
    "Backend / API Issue",
    "Data / Database Issue",
    "Infrastructure / DevOps",
    "Product / Feature Request",
]

CATEGORY_COLORS = {
    "UI / Frontend Issue":       "#4ADE80",   # green
    "Backend / API Issue":       "#FF6B35",   # orange
    "Data / Database Issue":     "#3B82F6",   # blue
    "Infrastructure / DevOps":   "#8B5CF6",   # purple
    "Product / Feature Request": "#FFB347",   # amber
}

SYSTEM_PROMPT = f"""You are a technical support ticket classifier for an enterprise software company.

Your job is to classify support tickets into EXACTLY ONE of these 5 categories:
1. UI / Frontend Issue
2. Backend / API Issue
3. Data / Database Issue
4. Infrastructure / DevOps
5. Product / Feature Request

Category Guidance:
- "UI / Frontend Issue"       → button, display, layout, render, CSS, page, screen, visual, UX, click, form
- "Backend / API Issue"       → API, endpoint, server error, 500, timeout, request fails, integration, response
- "Data / Database Issue"     → data wrong, missing records, duplicate, report incorrect, sync, database, query
- "Infrastructure / DevOps"   → server down, deployment, pipeline, build failed, environment, slow, crash, memory
- "Product / Feature Request" → new feature, enhancement, improvement, request, suggestion, would like, should have

Rules:
- You MUST use one of the 5 category names EXACTLY as written above (case-sensitive).
- If the ticket is ambiguous, pick the single most likely category.
- The solution must be 2-3 sentences, actionable, and specific to the ticket content.
- Respond ONLY with valid JSON — no markdown, no extra text.

Response format:
{{
  "category": "<exact category name from the list above>",
  "confidence": <float between 0.0 and 1.0>,
  "solution": "<2-3 sentence actionable resolution suggestion>",
  "reasoning": "<1 sentence explaining the classification choice>"
}}"""


def _get_llm_client():
    """Build the Databricks OpenAI-compatible client."""
    try:
        from services.ai_engine import create_databricks_openai_client
        api_key = os.getenv("OPENAI_API_KEY", "")
        endpoint_url = os.getenv("OPENAI_API_ENDPOINT", "")
        if not api_key or not endpoint_url:
            logger.warning("⚠️ OPENAI_API_KEY or OPENAI_API_ENDPOINT not set — classifier will be unavailable")
            return None
        return create_databricks_openai_client(api_key, endpoint_url)
    except Exception as e:
        logger.error(f"❌ Failed to create LLM client for classifier: {e}")
        return None


def _validate_category(category: str) -> str:
    """Ensure the returned category is one of the 5 allowed values."""
    if category in CATEGORIES:
        return category
    # Fuzzy fallback: check if any known category is a substring
    category_lower = category.lower()
    for valid in CATEGORIES:
        if valid.lower() in category_lower or category_lower in valid.lower():
            return valid
    return "Product / Feature Request"  # safest default


def classify_and_solve_sync(subject: str, description: str) -> Dict[str, Any]:
    """
    Classify a single ticket and generate an AI solution.
    Uses the Databricks LLM synchronously.
    Returns a dict with: category, confidence, solution, reasoning, color.
    """
    client = _get_llm_client()
    if not client:
        return _fallback_classification(subject, description)

    model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")
    user_message = f"Subject: {subject}\nDescription: {description or 'No description provided.'}"

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.1,
            max_tokens=400,
        )
        raw = response.choices[0].message.content.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)
        category = _validate_category(result.get("category", ""))
        return {
            "category": category,
            "confidence": float(result.get("confidence", 0.8)),
            "solution": result.get("solution", "Please investigate the reported issue."),
            "reasoning": result.get("reasoning", ""),
            "color": CATEGORY_COLORS.get(category, "#8A9AB8"),
        }

    except json.JSONDecodeError as e:
        logger.warning(f"⚠️ LLM returned non-JSON for ticket '{subject}': {e}")
        return _fallback_classification(subject, description)
    except Exception as e:
        logger.error(f"❌ LLM classification error for ticket '{subject}': {e}")
        return _fallback_classification(subject, description)


async def classify_and_solve(subject: str, description: str) -> Dict[str, Any]:
    """Async wrapper — runs the synchronous LLM call in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, classify_and_solve_sync, subject, description)


async def batch_classify(cases: List[Dict[str, Any]], concurrency: int = 5) -> List[Dict[str, Any]]:
    """
    Classify a list of cases concurrently.
    Each case dict must have 'subject' and 'description' keys.
    Returns the same list with category/confidence/solution/reasoning/color added.
    """
    semaphore = asyncio.Semaphore(concurrency)

    async def classify_one(case: Dict[str, Any]) -> Dict[str, Any]:
        async with semaphore:
            subject = case.get("subject", "")
            description = case.get("description", "")
            result = await classify_and_solve(subject, description)
            return {**case, **result}

    tasks = [classify_one(c) for c in cases]
    return await asyncio.gather(*tasks)


def _fallback_classification(subject: str, description: str) -> Dict[str, Any]:
    """
    Keyword-based fallback when the LLM is unavailable.
    Ensures the system degrades gracefully.
    """
    text = f"{subject} {description}".lower()

    ui_keywords = ["button", "display", "layout", "render", "css", "page", "screen", "ui", "ux", "click", "form", "visual"]
    backend_keywords = ["api", "endpoint", "server", "500", "timeout", "request", "response", "integration", "http"]
    data_keywords = ["data", "database", "record", "duplicate", "report", "sync", "query", "missing", "incorrect", "wrong"]
    infra_keywords = ["deploy", "server down", "pipeline", "build", "environment", "slow", "crash", "memory", "disk"]

    scores = {
        "UI / Frontend Issue": sum(1 for k in ui_keywords if k in text),
        "Backend / API Issue": sum(1 for k in backend_keywords if k in text),
        "Data / Database Issue": sum(1 for k in data_keywords if k in text),
        "Infrastructure / DevOps": sum(1 for k in infra_keywords if k in text),
        "Product / Feature Request": 0,
    }

    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        best = "Product / Feature Request"

    return {
        "category": best,
        "confidence": 0.55,
        "solution": "Please review the ticket details and route to the appropriate team for investigation.",
        "reasoning": "Classified via keyword matching (LLM unavailable).",
        "color": CATEGORY_COLORS.get(best, "#8A9AB8"),
    }


def get_category_colors() -> Dict[str, str]:
    """Return the color map for all categories (used by frontend)."""
    return CATEGORY_COLORS


def get_categories() -> List[str]:
    """Return the ordered list of all valid categories."""
    return CATEGORIES
