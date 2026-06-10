"""
Performance Cache - Caching for embeddings, responses, and query results
"""
import hashlib
import json
import time
import logging
from typing import Dict, Any, Optional, List
from functools import lru_cache
import asyncio

logger = logging.getLogger(__name__)

class PerformanceCache:
    """In-memory cache with TTL for performance optimization"""
    
    def __init__(self, default_ttl: int = 3600):  # 1 hour default
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.default_ttl = default_ttl
        self.max_size = 1000  # Max cache entries
    
    def _generate_key(self, prefix: str, *args, **kwargs) -> str:
        """Generate cache key from arguments"""
        key_data = {
            'args': args,
            'kwargs': kwargs
        }
        key_str = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.md5(key_str.encode()).hexdigest()
        return f"{prefix}:{key_hash}"
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached value if not expired"""
        if key not in self.cache:
            return None
        
        entry = self.cache[key]
        if time.time() > entry['expires_at']:
            del self.cache[key]
            return None
        
        return entry['value']
    
    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """Set cache value with TTL"""
        # Evict oldest entries if cache is full
        if len(self.cache) >= self.max_size:
            # Remove 10% of oldest entries
            sorted_entries = sorted(
                self.cache.items(),
                key=lambda x: x[1].get('created_at', 0)
            )
            for i in range(self.max_size // 10):
                if sorted_entries:
                    del self.cache[sorted_entries[i][0]]
        
        ttl = ttl or self.default_ttl
        self.cache[key] = {
            'value': value,
            'expires_at': time.time() + ttl,
            'created_at': time.time()
        }
    
    def get_embedding_key(self, text: str) -> str:
        """Generate cache key for embedding"""
        return self._generate_key('embedding', text)
    
    def get_response_key(self, query: str, source: str, integrations: List[str]) -> str:
        """Generate cache key for response"""
        return self._generate_key('response', query, source, sorted(integrations))
    
    def get_jql_key(self, query: str, context: Dict) -> str:
        """Generate cache key for JQL"""
        return self._generate_key('jql', query, json.dumps(context, sort_keys=True))
    
    def clear(self):
        """Clear all cache"""
        self.cache.clear()

# Global cache instance
_performance_cache: Optional[PerformanceCache] = None

def get_performance_cache() -> PerformanceCache:
    """Get or create global cache instance"""
    global _performance_cache
    if _performance_cache is None:
        _performance_cache = PerformanceCache()
    return _performance_cache

