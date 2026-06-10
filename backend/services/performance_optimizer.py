"""
Performance Optimizer - Parallel execution and optimization utilities
"""
import asyncio
import logging
from typing import List, Dict, Any, Callable, Optional
from concurrent.futures import ThreadPoolExecutor
import time

logger = logging.getLogger(__name__)

class PerformanceOptimizer:
    """Utilities for optimizing performance through parallelization"""
    
    def __init__(self, max_workers: int = 10):
        self.max_workers = max_workers
        self.executor = ThreadPoolExecutor(max_workers=max_workers)
    
    async def parallel_map(
        self,
        func: Callable,
        items: List[Any],
        max_concurrent: Optional[int] = None
    ) -> List[Any]:
        """
        Execute function on items in parallel
        
        Args:
            func: Async function to execute
            items: List of items to process
            max_concurrent: Maximum concurrent executions (default: len(items))
        
        Returns:
            List of results in same order as items
        """
        if not items:
            return []
        
        max_concurrent = max_concurrent or min(len(items), self.max_workers)
        
        # Create semaphore to limit concurrency
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def bounded_execute(item):
            async with semaphore:
                try:
                    return await func(item)
                except Exception as e:
                    logger.error(f"Error in parallel execution: {e}")
                    return None
        
        # Execute all tasks
        tasks = [bounded_execute(item) for item in items]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        return [r for r in results if not isinstance(r, Exception)]
    
    async def parallel_dict(
        self,
        func_dict: Dict[str, Callable],
        max_concurrent: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Execute multiple async functions in parallel and return dict of results
        
        Args:
            func_dict: Dictionary of {key: async_function}
            max_concurrent: Maximum concurrent executions
        
        Returns:
            Dictionary of {key: result}
        """
        if not func_dict:
            return {}
        
        max_concurrent = max_concurrent or min(len(func_dict), self.max_workers)
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def bounded_execute(key, func):
            async with semaphore:
                try:
                    result = await func()
                    return (key, result)
                except Exception as e:
                    logger.error(f"Error executing {key}: {e}")
                    return (key, None)
        
        tasks = [bounded_execute(key, func) for key, func in func_dict.items()]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Build result dictionary
        result_dict = {}
        for r in results:
            if isinstance(r, tuple) and len(r) == 2:
                key, value = r
                result_dict[key] = value
        
        return result_dict
    
    async def race(
        self,
        funcs: List[Callable],
        timeout: Optional[float] = None
    ) -> Optional[Any]:
        """
        Execute multiple functions and return first successful result
        
        Args:
            funcs: List of async functions
            timeout: Optional timeout in seconds
        
        Returns:
            First successful result or None
        """
        async def execute_with_fallback(func):
            try:
                return await func()
            except Exception as e:
                logger.debug(f"Function failed in race: {e}")
                return None
        
        tasks = [execute_with_fallback(func) for func in funcs]
        
        if timeout:
            tasks.append(asyncio.sleep(timeout))
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
                timeout=timeout
            )
            # Cancel pending tasks
            for task in pending:
                task.cancel()
        else:
            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED
            )
            for task in pending:
                task.cancel()
        
        # Get first successful result
        for task in done:
            result = await task
            if result is not None:
                return result
        
        return None
    
    def time_execution(self, func: Callable, *args, **kwargs):
        """Time execution of a function"""
        start = time.time()
        result = func(*args, **kwargs)
        elapsed = time.time() - start
        logger.debug(f"Execution time: {elapsed:.3f}s for {func.__name__}")
        return result, elapsed

# Global optimizer instance
_performance_optimizer: Optional[PerformanceOptimizer] = None

def get_performance_optimizer() -> PerformanceOptimizer:
    """Get or create global optimizer instance"""
    global _performance_optimizer
    if _performance_optimizer is None:
        _performance_optimizer = PerformanceOptimizer()
    return _performance_optimizer

