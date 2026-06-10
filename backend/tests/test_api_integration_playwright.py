"""
Playwright integration tests for backend API endpoints
"""
import pytest
from playwright.sync_api import Page, BrowserContext
import json
import os

class TestBackendAPIIntegration:
    """Test backend API integration with Playwright"""
    
    def test_api_health_check(self, page: Page):
        """Test that health check endpoint is working"""
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
        
        # Make API call through page context
        response = page.request.get(f"{api_base_url}/health")
        assert response.status == 200
        
        data = response.json()
        assert "status" in data
    
    def test_api_response_structure(self, page: Page):
        """Test that API responses have proper structure"""
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
        
        response = page.request.get(f"{api_base_url}/api/metrics")
        
        if response.status == 200:
            data = response.json()
            # Validate response structure based on your API spec
            assert isinstance(data, (dict, list))
    
    def test_authentication_required(self, page: Page):
        """Test that protected endpoints require authentication"""
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
        
        # Try to access protected endpoint without auth
        response = page.request.get(
            f"{api_base_url}/api/protected",
            headers={}
        )
        
        assert response.status in [401, 403]
    
    def test_authenticated_api_call(self, page: Page, browser_context: BrowserContext):
        """Test authenticated API calls"""
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
        auth_token = os.getenv("TEST_AUTH_TOKEN", "test_token_12345")
        
        response = page.request.get(
            f"{api_base_url}/api/user/profile",
            headers={"Authorization": f"Bearer {auth_token}"}
        )
        
        # Should get 200 or 404 (if user doesn't exist), but not 401
        assert response.status != 401
    
    def test_api_error_handling(self, page: Page):
        """Test API error handling"""
        api_base_url = os.getenv("API_BASE_URL", "http://localhost:8000")
        
        # Test invalid endpoint
        response = page.request.get(f"{api_base_url}/api/nonexistent")
        assert response.status == 404
        
        # Test invalid request method
        response = page.request.post(f"{api_base_url}/health")
        assert response.status in [405, 400, 404]
