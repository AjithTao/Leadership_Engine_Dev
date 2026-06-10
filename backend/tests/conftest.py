import pytest
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext
import os
from typing import Generator

@pytest.fixture(scope="session")
def browser() -> Generator[Browser, None, None]:
    """Create a browser instance for the session."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        yield browser
        browser.close()

@pytest.fixture
def browser_context(browser: Browser) -> Generator[BrowserContext, None, None]:
    """Create a new browser context for each test."""
    context = browser.new_context(
        base_url=os.getenv("TEST_BASE_URL", "http://localhost:3001"),
        viewport={"width": 1280, "height": 720},
        ignore_https_errors=True,
    )
    yield context
    context.close()

@pytest.fixture
def page(browser_context: BrowserContext) -> Generator[Page, None, None]:
    """Create a new page for each test."""
    page = browser_context.new_page()
    yield page
    page.close()

@pytest.fixture
def authenticated_page(page: Page, browser_context: BrowserContext) -> Page:
    """Provide an authenticated page for tests."""
    # Add auth token cookie
    browser_context.add_cookies([
        {
            "name": "auth_token",
            "value": os.getenv("TEST_AUTH_TOKEN", "test_token_12345"),
            "url": "http://localhost:3001",
        }
    ])
    
    # Set localStorage
    page.goto("http://localhost:3001")
    page.evaluate("""
        localStorage.setItem('auth_token', localStorage.getItem('auth_token') || 'test_token_12345');
        localStorage.setItem('user_id', 'test-user-123');
    """)
    
    return page
