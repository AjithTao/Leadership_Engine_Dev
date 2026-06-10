"""
Test utilities and helpers for Playwright integration
"""
import os
import json
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import hashlib

class TestDataGenerator:
    """Generate test data for various test scenarios"""
    
    @staticmethod
    def generate_user(
        email: Optional[str] = None,
        name: str = "Test User"
    ) -> Dict[str, Any]:
        """Generate test user data"""
        if not email:
            timestamp = datetime.now().timestamp()
            email = f"test.user.{int(timestamp)}@example.com"
        
        return {
            "email": email,
            "name": name,
            "password": "TestPassword123!",
            "id": hashlib.md5(email.encode()).hexdigest(),
        }
    
    @staticmethod
    def generate_date_range(
        days_back: int = 30
    ) -> Dict[str, str]:
        """Generate date range for filtering tests"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_back)
        
        return {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d"),
        }
    
    @staticmethod
    def generate_metrics_data(
        count: int = 5
    ) -> list:
        """Generate sample metrics data"""
        return [
            {
                "id": f"metric_{i}",
                "name": f"Metric {i}",
                "value": 100 * (i + 1),
                "trend": "up" if i % 2 == 0 else "down",
                "percentage": round(10.5 * (i + 1), 2),
            }
            for i in range(count)
        ]


class TestConfig:
    """Centralized test configuration"""
    
    BASE_URL = os.getenv("TEST_BASE_URL", "http://localhost:3001")
    API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")
    AUTH_TOKEN = os.getenv("TEST_AUTH_TOKEN", "test_token_12345")
    TIMEOUT = int(os.getenv("TEST_TIMEOUT", "30000"))
    HEADLESS = os.getenv("HEADLESS", "true").lower() == "true"
    SLOW_MO = int(os.getenv("SLOW_MO", "0"))
    
    # Browser settings
    VIEWPORT_WIDTH = 1280
    VIEWPORT_HEIGHT = 720
    
    # Test settings
    RETRY_ATTEMPTS = 2
    PARALLEL_WORKERS = 4
    
    # Selectors (can be overridden in derived classes)
    SELECTORS = {
        "login_email": 'input[type="email"]',
        "login_password": 'input[type="password"]',
        "login_submit": 'button:has-text("Sign In")',
        "dashboard_title": "h1",
        "metrics_card": "[data-testid='metric-card']",
        "error_message": "text=/error|failed/i",
    }


class NetworkHelper:
    """Helper for network request/response handling"""
    
    @staticmethod
    def create_auth_headers(token: str) -> Dict[str, str]:
        """Create authorization headers"""
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    
    @staticmethod
    def create_cookies(token: str, domain: str = "localhost") -> list:
        """Create auth cookies"""
        return [
            {
                "name": "auth_token",
                "value": token,
                "domain": domain,
                "path": "/",
            }
        ]


class AssertionHelper:
    """Reusable assertions for tests"""
    
    @staticmethod
    async def assert_element_visible(page, selector: str, timeout: int = 5000):
        """Assert element is visible"""
        element = page.locator(selector)
        await element.wait_for(state="visible", timeout=timeout)
        assert await element.is_visible()
    
    @staticmethod
    async def assert_element_count(page, selector: str, count: int):
        """Assert element count matches"""
        elements = page.locator(selector)
        actual_count = await elements.count()
        assert actual_count == count, f"Expected {count} elements, got {actual_count}"
    
    @staticmethod
    async def assert_page_loaded(page, timeout: int = 10000):
        """Assert page has fully loaded"""
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout)
            return True
        except Exception as e:
            raise AssertionError(f"Page failed to load: {str(e)}")
    
    @staticmethod
    async def assert_api_call(page, url_pattern: str, method: str = "GET"):
        """Assert that a specific API call was made"""
        api_calls = []
        
        def handle_response(response):
            if url_pattern in response.url:
                api_calls.append({
                    "url": response.url,
                    "method": response.request.method,
                    "status": response.status,
                })
        
        page.on("response", handle_response)
        
        # Wait for potential API calls
        await page.wait_for_timeout(2000)
        
        matching_calls = [
            call for call in api_calls
            if call["method"] == method
        ]
        
        assert len(matching_calls) > 0, f"No API call found for {method} {url_pattern}"


# Export utilities
__all__ = [
    "TestDataGenerator",
    "TestConfig",
    "NetworkHelper",
    "AssertionHelper",
]
