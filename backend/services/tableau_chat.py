"""
Tableau chat handler — natural-language queries over the Tableau integration.

Standalone module routed from /api/chat via an additive early-exit guard
(should_handle). Non-Tableau queries never reach this module, so existing
chat behavior is unchanged. Mirrors the existing handler architecture:
lazy module singleton (get_tableau_chat_handler, like get_jira_rag_handler),
LLM answer synthesis through the same Databricks OpenAI-compatible client
the AI engine uses, and a no-LLM markdown fallback.
"""

import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Same context cap the Confluence synthesis path uses
MAX_DATA_SUMMARY = 10000

# Words that identify Tableau content types but carry no search meaning
_STOPWORDS = {
    "tableau", "dashboard", "dashboards", "view", "views", "workbook",
    "workbooks", "report", "reports", "sheet", "sheets", "metric", "metrics",
    "show", "list", "find", "search", "give", "what", "whats", "which",
    "the", "a", "an", "me", "my", "our", "in", "on", "of", "for", "from",
    "is", "are", "was", "were", "and", "or", "to", "with", "about", "all",
    "please", "can", "you", "get", "tell", "how", "many", "much", "data",
    "current", "latest", "number", "value", "percentage", "percent",
}

# Plural forms only: "find testing dashboards" is a browse request, but data
# questions legitimately name a single view ("...according to the Top 7 View")
_LIST_INTENT = re.compile(
    r"\b(list|show|what|which|find|search|browse|available)\b.*"
    r"\b(dashboards|views|workbooks|reports)\b",
    re.IGNORECASE | re.DOTALL,
)
_STATUS_INTENT = re.compile(
    r"\b(status|connected|connection|health|working|available)\b", re.IGNORECASE
)


class TableauChatHandler:
    """Routes and answers Tableau natural-language chat queries."""

    def __init__(self):
        self._llm = None
        self._llm_initialized = False
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    # ---------- routing guard ----------

    @staticmethod
    def should_handle(
        source: Optional[str], integrations: List[str], message: str
    ) -> bool:
        """
        True only when the request is explicitly for Tableau:
        - the frontend sent source='tableau' (Tableau checkbox selected), or
        - auto mode (no integrations selected) and the message names Tableau.
        Everything else falls through to the existing pipeline untouched.
        """
        if (source or "").lower() == "tableau":
            return True
        if integrations:
            # User explicitly scoped to other sources — never intercept
            return False
        if (source or "auto").lower() not in ("", "auto"):
            return False
        return "tableau" in (message or "").lower()

    # ---------- LLM (lazy, same factory as the AI engine) ----------

    def _get_llm(self):
        if self._llm_initialized:
            return self._llm
        self._llm_initialized = True
        try:
            api_key = os.getenv("OPENAI_API_KEY")
            endpoint_url = os.getenv("OPENAI_API_ENDPOINT")
            if not api_key or api_key.startswith("sk-your-actual"):
                logger.warning("Tableau chat: no LLM key — using basic formatting")
                return None
            from services.ai_engine import create_databricks_async_openai_client
            if endpoint_url:
                self._llm = create_databricks_async_openai_client(api_key, endpoint_url)
            else:
                from openai import AsyncOpenAI
                self._llm = AsyncOpenAI(api_key=api_key)
            logger.info("Tableau chat: LLM client initialized")
        except Exception as e:
            logger.error(f"Tableau chat: LLM init failed, using basic formatting: {e}")
            self._llm = None
        return self._llm

    # ---------- main entry ----------

    async def handle_query(self, message: str, tableau_client) -> Dict[str, Any]:
        """
        Answer a Tableau question. Returns {success, response, source, intent}.
        `tableau_client` is the shared TableauClient from app_state, injected
        at call time (same injection style as the AI engine's clients).
        """
        lower = (message or "").lower()

        if _STATUS_INTENT.search(lower) and "tableau" in lower:
            return await self._handle_status(tableau_client)

        try:
            views = await tableau_client.get_views()
        except Exception as e:
            logger.error(f"❌ Tableau chat: view listing failed: {e}")
            return {
                "success": False,
                "response": f"I couldn't reach Tableau to look that up ({e}).",
                "source": "tableau",
                "intent": "error",
            }

        terms = self._search_terms(message)

        if _LIST_INTENT.search(message or ""):
            return self._handle_list(views, terms)

        # Data question: pull the best-matching view and answer from its data
        match, score = self._best_view_match(views, terms)
        if not match or score < 2:
            # Nothing confidently matched — help the user pick instead of guessing
            return self._handle_list(views, terms, not_found=True)

        try:
            data = await tableau_client.get_view_data(match["id"])
        except Exception as e:
            logger.error(f"❌ Tableau chat: data export failed: {e}")
            return {
                "success": False,
                "response": (
                    f"I found the view **{match['name']}** (workbook "
                    f"*{match['workbook_name']}*) but couldn't export its data ({e})."
                ),
                "source": "tableau",
                "intent": "view_data",
            }

        answer = await self._synthesize_answer(message, match, data)
        return {
            "success": True,
            "response": answer,
            "source": "tableau",
            "intent": "view_data",
        }

    # ---------- intents ----------

    async def _handle_status(self, tableau_client) -> Dict[str, Any]:
        status = await tableau_client.get_status()
        if status.get("connected"):
            response = (
                f"✅ **Tableau is connected.**\n\n"
                f"- Server: {status.get('server_url')}\n"
                f"- Site: {status.get('site')}\n"
                f"- Views visible: {status.get('views', 0):,}"
            )
        else:
            response = f"❌ **Tableau is not reachable.** {status.get('error', '')}"
        return {
            "success": status.get("connected", False),
            "response": response,
            "source": "tableau",
            "intent": "status",
        }

    def _handle_list(
        self, views: List[Dict[str, Any]], terms: List[str], not_found: bool = False
    ) -> Dict[str, Any]:
        if terms:
            scored = []
            for v in views:
                s = self._score_view(v, terms)
                if s > 0:
                    scored.append((s, v))
            scored.sort(key=lambda t: (-t[0], (t[1].get("workbook_name") or "")))
            matches = [v for _, v in scored[:20]]
        else:
            matches = []

        lines: List[str] = []
        if matches:
            header = (
                "I couldn't confidently pick a single view for that — closest matches:"
                if not_found
                else f"Found **{len(matches)}** matching Tableau views:"
            )
            lines.append(header + "\n")
            by_workbook: Dict[str, List[str]] = {}
            for v in matches:
                by_workbook.setdefault(v.get("workbook_name") or "Other", []).append(
                    v.get("name") or "?"
                )
            for wb, names in by_workbook.items():
                lines.append(f"**{wb}**")
                lines.extend(f"- {n}" for n in names)
            lines.append(
                "\nAsk about one of them, e.g. *\"What does the "
                f"{matches[0].get('name')} view show in Tableau?\"*"
            )
        else:
            workbooks = sorted(
                {v.get("workbook_name") for v in views if v.get("workbook_name")}
            )
            total_shown = min(len(workbooks), 25)
            lines.append(
                f"The Tableau site has **{len(views):,} views** across "
                f"**{len(workbooks):,} workbooks**. A few workbooks:\n"
            )
            lines.extend(f"- {wb}" for wb in workbooks[:total_shown])
            lines.append(
                "\nAsk for a topic to narrow it down, e.g. "
                "*\"find testing dashboards in Tableau\"*."
            )
        return {
            "success": True,
            "response": "\n".join(lines),
            "source": "tableau",
            "intent": "list_views",
        }

    # ---------- matching ----------

    @staticmethod
    def _search_terms(message: str) -> List[str]:
        words = re.findall(r"[a-z0-9]+", (message or "").lower())
        return [w for w in words if len(w) > 2 and w not in _STOPWORDS]

    @staticmethod
    def _score_view(view: Dict[str, Any], terms: List[str]) -> int:
        name = (view.get("name") or "").lower()
        workbook = (view.get("workbook_name") or "").lower()
        score = 0
        for t in terms:
            if t in name:
                score += 2
            if t in workbook:
                score += 1
        return score

    def _best_view_match(self, views, terms):
        best, best_score = None, 0
        for v in views:
            s = self._score_view(v, terms)
            if s > best_score:
                best, best_score = v, s
        return best, best_score

    # ---------- answer synthesis ----------

    async def _synthesize_answer(
        self, message: str, view: Dict[str, Any], data: Dict[str, Any]
    ) -> str:
        summary = self._build_data_summary(data)
        llm = self._get_llm()
        if llm:
            try:
                prompt = (
                    "You are FalconX's Work Buddy assistant. Answer the user's "
                    "question using ONLY the data below, exported live from the "
                    f"Tableau view \"{view.get('name')}\" in workbook "
                    f"\"{view.get('workbook_name')}\".\n\n"
                    f"DATA ({data.get('row_count', 0)} rows):\n{summary}\n\n"
                    f"QUESTION: {message}\n\n"
                    "Answer concisely in markdown. Bold the key numbers. If the "
                    "data doesn't contain the answer, say what the view does "
                    "contain instead. Do not invent values."
                )
                completion = await llm.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=2000,
                )
                answer = (completion.choices[0].message.content or "").strip()
                if answer:
                    return (
                        f"{answer}\n\n"
                        f"*Source: Tableau — {view.get('workbook_name')} / "
                        f"{view.get('name')}*"
                    )
            except Exception as e:
                logger.error(f"Tableau chat: LLM synthesis failed, using basic formatting: {e}")
        return self._basic_response(view, data)

    @staticmethod
    def _build_data_summary(data: Dict[str, Any]) -> str:
        lines: List[str] = []
        for row in data.get("rows", []):
            pairs = [f"{k}={v}" for k, v in row.items() if str(v).strip()]
            lines.append("; ".join(pairs))
            if sum(len(l) for l in lines) > MAX_DATA_SUMMARY:
                lines.append("… (truncated)")
                break
        return "\n".join(lines)

    @staticmethod
    def _basic_response(view: Dict[str, Any], data: Dict[str, Any]) -> str:
        """No-LLM fallback: render the exported rows as a markdown table."""
        columns = [c for c in (data.get("columns") or []) if c]
        rows = data.get("rows", [])[:15]
        lines = [
            f"Data from Tableau view **{view.get('name')}** "
            f"(workbook *{view.get('workbook_name')}*), "
            f"{data.get('row_count', 0)} rows:",
            "",
        ]
        if columns and rows:
            show = columns[:8]
            lines.append("| " + " | ".join(show) + " |")
            lines.append("|" + "---|" * len(show))
            for r in rows:
                lines.append(
                    "| " + " | ".join(str(r.get(c, "")).strip() or "—" for c in show) + " |"
                )
            if data.get("row_count", 0) > len(rows):
                lines.append(f"\n*…and {data['row_count'] - len(rows)} more rows.*")
        else:
            lines.append("*The view returned no tabular data.*")
        return "\n".join(lines)


# Module-level lazy singleton (same pattern as get_jira_rag_handler)
_tableau_chat_handler: Optional[TableauChatHandler] = None


def get_tableau_chat_handler() -> TableauChatHandler:
    global _tableau_chat_handler
    if _tableau_chat_handler is None:
        _tableau_chat_handler = TableauChatHandler()
    return _tableau_chat_handler
