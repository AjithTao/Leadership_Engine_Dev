"""
Unified RAG Handler - Single vector store for Jira, Confluence, GitHub
Routes queries based on semantic similarity, not keywords.

Search strategy:
  hybrid_search() = vector similarity  +  BM25 keyword search
                    fused via Reciprocal Rank Fusion (RRF)

This means domain-specific terms like "GL Inquiry", "SSBYOD", "me-gl-main"
that the embedding model may not understand are still found via BM25,
while semantic matches handle paraphrased / synonym queries.
"""
import os
import re
import math
import logging
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
from dataclasses import dataclass, field
from collections import defaultdict
import httpx

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

class SourceType(str, Enum):
    JIRA       = "jira"
    CONFLUENCE = "confluence"
    GITHUB     = "github"


@dataclass
class UnifiedDocument:
    """Unified document format for all sources"""
    id:               str
    text:             str
    source_type:      SourceType
    metadata:         Dict[str, Any]
    embedding:        Optional[List[float]] = None
    similarity_score: Optional[float]       = None


# ---------------------------------------------------------------------------
# Lightweight pure-Python BM25 index
# ---------------------------------------------------------------------------

class _BM25Index:
    """
    In-memory BM25 index built from a dict of UnifiedDocuments.

    Parameters follow the Robertson et al. defaults:
        k1 = 1.5  (term-frequency saturation)
        b  = 0.75 (document-length normalisation)
    """

    _TOKENISE = re.compile(r'\b\w+\b')

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b  = b
        # doc_id → token list
        self._doc_tokens:  Dict[str, List[str]]      = {}
        # token → {doc_id: count}
        self._inverted:    Dict[str, Dict[str, int]]  = defaultdict(dict)
        self._doc_lengths: Dict[str, int]             = {}
        self._avgdl:       float                      = 0.0
        self._N:           int                        = 0

    # ------------------------------------------------------------------
    # Build / rebuild
    # ------------------------------------------------------------------

    def build(self, documents: Dict[str, "UnifiedDocument"]) -> None:
        """Build the BM25 index from the current vector store."""
        self._doc_tokens  = {}
        self._inverted    = defaultdict(dict)
        self._doc_lengths = {}

        for doc_id, doc in documents.items():
            tokens = self._tokenise(doc.text)
            self._doc_tokens[doc_id]  = tokens
            self._doc_lengths[doc_id] = len(tokens)
            tf: Dict[str, int] = defaultdict(int)
            for t in tokens:
                tf[t] += 1
            for t, cnt in tf.items():
                self._inverted[t][doc_id] = cnt

        self._N     = len(documents)
        self._avgdl = (sum(self._doc_lengths.values()) / self._N) if self._N else 0.0
        logger.debug(f"[BM25] Built index over {self._N} docs, avgdl={self._avgdl:.1f}")

    def is_stale(self, current_size: int) -> bool:
        """Return True if the index should be rebuilt (doc count changed ≥ 5%)."""
        if self._N == 0:
            return True
        return abs(current_size - self._N) / self._N > 0.05

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        candidates: List["UnifiedDocument"],
        top_k: int = 20
    ) -> List[Tuple["UnifiedDocument", float]]:
        """
        Score *candidates* against *query* using BM25 and return top-k
        as (document, score) tuples sorted descending.
        """
        if not self._N:
            return []

        q_tokens  = list(set(self._tokenise(query)))
        candidate_ids = {d.id for d in candidates}
        scores: Dict[str, float] = defaultdict(float)

        for t in q_tokens:
            posting = self._inverted.get(t, {})
            df      = len(posting)
            if df == 0:
                continue
            # IDF (Robertson / Sparck-Jones variant, always ≥ 0)
            idf = math.log((self._N - df + 0.5) / (df + 0.5) + 1)

            for doc_id, tf in posting.items():
                if doc_id not in candidate_ids:
                    continue
                dl    = self._doc_lengths.get(doc_id, self._avgdl)
                denom = tf + self.k1 * (1 - self.b + self.b * dl / max(self._avgdl, 1))
                scores[doc_id] += idf * (tf * (self.k1 + 1)) / denom

        # map doc_id back to UnifiedDocument
        id_to_doc = {d.id: d for d in candidates}
        ranked = sorted(
            [(id_to_doc[did], sc) for did, sc in scores.items() if did in id_to_doc],
            key=lambda x: x[1],
            reverse=True
        )
        return ranked[:top_k]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @classmethod
    def _tokenise(cls, text: str) -> List[str]:
        return [t.lower() for t in cls._TOKENISE.findall(text) if len(t) > 1]


# ---------------------------------------------------------------------------
# Reciprocal Rank Fusion
# ---------------------------------------------------------------------------

def _reciprocal_rank_fusion(
    *ranked_lists: List[Tuple["UnifiedDocument", float]],
    k: int = 60
) -> List["UnifiedDocument"]:
    """
    Fuse multiple ranked lists into one via RRF.
    Formula: rrf(d) = sum_over_lists( 1 / (k + rank(d)) )

    Higher RRF score = document appeared highly in more lists.
    Returns documents sorted by RRF score descending.
    """
    rrf_scores: Dict[str, float]           = defaultdict(float)
    doc_registry: Dict[str, "UnifiedDocument"] = {}

    for ranked in ranked_lists:
        for rank, (doc, _score) in enumerate(ranked, start=1):
            rrf_scores[doc.id]  += 1.0 / (k + rank)
            doc_registry[doc.id] = doc

    # Attach the fused RRF score as similarity_score so callers can read it
    fused: List["UnifiedDocument"] = []
    for doc_id, rrf in sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True):
        doc = doc_registry[doc_id]
        # Normalise RRF score to [0, 1] range: max possible per list = 1/(k+1)
        # With 2 lists, theoretical max ≈ 2/(k+1). We normalise against that.
        doc.similarity_score = min(rrf * (k + 1), 1.0)
        fused.append(doc)

    return fused


# ---------------------------------------------------------------------------
# UnifiedRAGHandler
# ---------------------------------------------------------------------------

class UnifiedRAGHandler:
    """
    Unified RAG handler that indexes and searches across:
    - Jira issues (title, description, comments)
    - Confluence pages / chunks
    - GitHub PRs, issues, README files

    Primary search path: hybrid_search() — vector + BM25 fused via RRF.
    Falls back to BM25-only when the embedding API is unreachable.
    Falls back to vector-only when BM25 index is empty.
    """

    def __init__(self):
        self.vector_store: Dict[str, UnifiedDocument] = {}
        self._bm25 = _BM25Index()

        self.embedding_endpoint = os.getenv(
            "DATABRICKS_EMBEDDING_ENDPOINT",
            os.getenv(
                "OPENAI_EMBEDDINGS_API_ENDPOINT",
                "https://dbc-46217bae-ef1b.cloud.databricks.com/serving-endpoints/databricks-gte-large-en/invocations"
            )
        )
        self.api_key = os.getenv("OPENAI_EMBEDDINGS_API_KEY") or os.getenv("OPENAI_API_KEY")
        self._initialized = False

        # Initialize persistent storage
        try:
            from services.vector_storage import VectorStorage
            self.storage = VectorStorage()
            logger.info("✅ Unified RAG Handler initialized with persistent storage")
        except Exception as e:
            logger.warning(f"⚠️ Failed to initialize persistent storage: {e}. Using in-memory only.")
            self.storage = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def initialize(self):
        """Load existing documents from persistent storage into memory."""
        if self._initialized:
            return

        if self.storage:
            try:
                logger.info("📂 Loading documents from persistent storage...")
                stored_docs = self.storage.load_all_documents()
                self.vector_store.update(stored_docs)
                logger.info(f"✅ Loaded {len(stored_docs)} documents from persistent storage")
            except Exception as e:
                logger.warning(f"⚠️ Failed to load from persistent storage: {e}")

        self._initialized = True

        # Build BM25 index on load
        if self.vector_store:
            self._bm25.build(self.vector_store)

        logger.info(f"✅ Unified RAG Handler ready ({len(self.vector_store)} documents in memory)")

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------

    async def index_document(
        self,
        text: str,
        source_type: SourceType,
        metadata: Dict[str, Any]
    ) -> str:
        """Index a document from any source and persist to storage."""
        doc_id = f"{source_type.value}_{metadata.get('id', 'unknown')}"

        try:
            embedding = await self._get_embedding(text)
        except Exception as e:
            logger.warning(f"Failed to get embedding for {doc_id}: {e}")
            embedding = None

        doc = UnifiedDocument(
            id=doc_id,
            text=text,
            source_type=source_type,
            metadata=metadata,
            embedding=embedding
        )

        self.vector_store[doc_id] = doc

        if self.storage:
            try:
                self.storage.save_document(doc)
            except Exception as e:
                logger.warning(f"Failed to persist document {doc_id}: {e}")

        # Lazily rebuild BM25 when store grows >5%
        if self._bm25.is_stale(len(self.vector_store)):
            self._bm25.build(self.vector_store)

        return doc_id

    # ------------------------------------------------------------------
    # Hybrid search (primary entry point)
    # ------------------------------------------------------------------

    async def hybrid_search(
        self,
        query: str,
        top_k: int = 10,
        source_filter: Optional[List[SourceType]] = None,
        min_score: float = 0.0
    ) -> List[UnifiedDocument]:
        """
        Hybrid search: vector similarity + BM25 keyword, fused via RRF.

        Handles three degraded modes automatically:
        1. Embedding API down → BM25-only (keyword match still works)
        2. BM25 index empty  → vector-only
        3. Both fail         → returns []

        Args:
            query:         Natural-language question or keyword string
            top_k:         Number of results to return
            source_filter: Optional list of SourceType to restrict search
            min_score:     Minimum RRF-normalised score [0, 1]

        Returns:
            Documents sorted by fused relevance score, highest first.
        """
        if not self._initialized:
            await self.initialize()

        # Apply source filter
        candidates = list(self.vector_store.values())
        if source_filter:
            candidates = [d for d in candidates if d.source_type in source_filter]

        if not candidates:
            logger.info("[Hybrid] No candidates in store (empty or filtered out)")
            return []

        # Ensure BM25 index is current
        if self._bm25.is_stale(len(self.vector_store)):
            self._bm25.build(self.vector_store)

        # --- 1. Vector search ---
        vector_ranked: List[Tuple[UnifiedDocument, float]] = []
        embedding_ok = True
        try:
            query_embedding = await self._get_embedding(query)
            for doc in candidates:
                if doc.embedding:
                    score = self._cosine_similarity(query_embedding, doc.embedding)
                    vector_ranked.append((doc, score))
            vector_ranked.sort(key=lambda x: x[1], reverse=True)
            vector_ranked = vector_ranked[:top_k * 3]   # wider pool for fusion
            logger.debug(f"[Hybrid] Vector: top score={vector_ranked[0][1]:.3f}" if vector_ranked else "[Hybrid] Vector: no results")
        except Exception as e:
            logger.warning(f"[Hybrid] Embedding API unavailable ({e}) — using BM25 only")
            embedding_ok = False

        # --- 2. BM25 search ---
        bm25_ranked: List[Tuple[UnifiedDocument, float]] = []
        try:
            bm25_ranked = self._bm25.search(query, candidates, top_k=top_k * 3)
            logger.debug(f"[Hybrid] BM25: top score={bm25_ranked[0][1]:.3f}" if bm25_ranked else "[Hybrid] BM25: no results")
        except Exception as e:
            logger.warning(f"[Hybrid] BM25 search failed: {e}")

        # --- 3. Fuse ---
        if vector_ranked and bm25_ranked:
            fused = _reciprocal_rank_fusion(vector_ranked, bm25_ranked)
            logger.info(f"[Hybrid] RRF fusion: {len(fused)} docs (vector + BM25)")
        elif vector_ranked:
            # BM25 unavailable — use vector scores directly
            fused = []
            for doc, sc in vector_ranked:
                doc.similarity_score = sc
                fused.append(doc)
            logger.info("[Hybrid] Vector-only mode (BM25 unavailable)")
        elif bm25_ranked:
            # Embedding API down — use BM25 scores (normalised to [0, 1])
            max_bm25 = bm25_ranked[0][1] if bm25_ranked else 1.0
            fused = []
            for doc, sc in bm25_ranked:
                doc.similarity_score = sc / max(max_bm25, 1e-9)
                fused.append(doc)
            logger.info("[Hybrid] BM25-only mode (embedding API unavailable)")
        else:
            logger.warning("[Hybrid] Both vector and BM25 returned no results")
            return []

        # Apply min_score filter and return top_k
        result = [d for d in fused if (d.similarity_score or 0.0) >= min_score]
        return result[:top_k]

    # ------------------------------------------------------------------
    # Legacy: keep similarity_search for backward compatibility
    # (routes to hybrid_search internally)
    # ------------------------------------------------------------------

    async def similarity_search(
        self,
        query: str,
        top_k: int = 10,
        source_filter: Optional[List[SourceType]] = None,
        min_score: float = 0.0
    ) -> List[UnifiedDocument]:
        """Backward-compatible alias for hybrid_search."""
        return await self.hybrid_search(
            query=query,
            top_k=top_k,
            source_filter=source_filter,
            min_score=min_score
        )

    # ------------------------------------------------------------------
    # Source detection
    # ------------------------------------------------------------------

    def detect_dominant_source(self, results: List[UnifiedDocument]) -> Optional[SourceType]:
        """Determine dominant source from top results."""
        if not results:
            return None
        top_3 = results[:3]
        source_counts: Dict[SourceType, int] = {}
        for doc in top_3:
            source_counts[doc.source_type] = source_counts.get(doc.source_type, 0) + 1
        if len(source_counts) == 1:
            return list(source_counts.keys())[0]
        if top_3[0].similarity_score and top_3[0].similarity_score > 0.8:
            return top_3[0].source_type
        return max(source_counts.items(), key=lambda x: x[1])[0] if source_counts else None

    # ------------------------------------------------------------------
    # Embedding
    # ------------------------------------------------------------------

    async def _get_embedding(self, text: str) -> List[float]:
        """Get embedding for text using Databricks endpoint with caching."""
        from services.performance_cache import get_performance_cache
        cache     = get_performance_cache()
        cache_key = cache.get_embedding_key(text)

        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        if not self.api_key or not self.embedding_endpoint:
            raise ValueError("API key or embedding endpoint not configured")

        endpoint_url = self.embedding_endpoint
        if "/api/2.0/serving-endpoints/" in endpoint_url:
            endpoint_url = endpoint_url.replace(
                "/api/2.0/serving-endpoints/", "/serving-endpoints/"
            )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type":  "application/json"
        }
        payload = {"input": [text] if isinstance(text, str) else text}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint_url, json=payload, headers=headers)
            response.raise_for_status()
            result = response.json()

        if "data" in result:
            sorted_data = sorted(result["data"], key=lambda x: x.get("index", 0))
            embedding   = [item["embedding"] for item in sorted_data][0]
        elif "embeddings" in result:
            embedding = result["embeddings"][0]
        else:
            raise ValueError(f"Unexpected embedding response format: {list(result.keys())}")

        cache.set(cache_key, embedding, ttl=86400)
        return embedding

    # ------------------------------------------------------------------
    # Math
    # ------------------------------------------------------------------

    @staticmethod
    def _cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
        if len(vec1) != len(vec2):
            return 0.0
        dot   = sum(a * b for a, b in zip(vec1, vec2))
        mag1  = math.sqrt(sum(a * a for a in vec1))
        mag2  = math.sqrt(sum(a * a for a in vec2))
        if mag1 == 0 or mag2 == 0:
            return 0.0
        return dot / (mag1 * mag2)


# ---------------------------------------------------------------------------
# Global singleton
# ---------------------------------------------------------------------------

_unified_rag_handler: Optional[UnifiedRAGHandler] = None


def get_unified_rag_handler() -> Optional[UnifiedRAGHandler]:
    """Get or create the global UnifiedRAGHandler instance."""
    global _unified_rag_handler
    if _unified_rag_handler is None:
        _unified_rag_handler = UnifiedRAGHandler()
    return _unified_rag_handler
