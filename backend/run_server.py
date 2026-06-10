"""
Custom server runner with explicit logging configuration
This ensures all logs are visible in the console
"""
import sys
import os
import logging
import uvicorn

# Prepare log directory for mirroring console output
LOG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'logs'))
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE_PATH = os.path.join(LOG_DIR, 'backend-dev.log')


def log_startup_summary():
    """Log a snapshot of critical integrations for easier troubleshooting."""
    summary_logger = logging.getLogger("startup.summary")
    summary_logger.info("=" * 60)
    summary_logger.info("🔎 Startup capability summary")
    
    ldap_url = os.getenv("LDAP_SERVER_URL")
    if ldap_url:
        summary_logger.info(f"LDAP configured: YES ({ldap_url})")
    else:
        summary_logger.info("LDAP configured: NO (set LDAP_* variables in backend/config/.env)")
    
    jira_base = os.getenv("JIRA_BASE_URL", "").rstrip("/")
    if jira_base:
        summary_logger.info(f"Jira base URL: {jira_base}")
    else:
        summary_logger.info("Jira base URL: NOT CONFIGURED")
    
    ai_key = os.getenv("OPENAI_API_KEY", "")
    ai_endpoint = os.getenv("OPENAI_API_ENDPOINT", "https://api.openai.com")
    ai_model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")
    ai_enabled = bool(ai_key and not ai_key.startswith("sk-your-actual"))
    if ai_enabled:
        summary_logger.info(f"AI enabled: YES (endpoint: {ai_endpoint}, model: {ai_model})")
    else:
        summary_logger.info("AI enabled: NO (fallback heuristics will be used)")
    
    summary_logger.info("📄 Detailed chat/JQL activity will stream below and into backend-dev.log")
    summary_logger.info("=" * 60)

# Add backend directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Configure logging BEFORE importing main
# This ensures logging is set up before FastAPI/uvicorn initializes

# Set up root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)

# Remove all existing handlers
for handler in root_logger.handlers[:]:
    root_logger.removeHandler(handler)

# Create console/file handlers with detailed formatting
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setLevel(logging.INFO)
formatter = logging.Formatter(
    '%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
console_handler.setFormatter(formatter)
root_logger.addHandler(console_handler)

file_handler = logging.FileHandler(LOG_FILE_PATH, encoding='utf-8')
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(formatter)
root_logger.addHandler(file_handler)

# Configure basicConfig with force
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[console_handler, file_handler],
    force=True
)

# Set all relevant loggers to INFO
loggers_to_configure = [
    'uvicorn',
    'uvicorn.access',
    'uvicorn.error',
    'fastapi',
    'services.ai_engine',
    'services.jira',
    'services.confluence',
    'services.analytics',
    'services.jql_processor',
    'services.chatbot_engine',
    'services.github',
]

for logger_name in loggers_to_configure:
    logger = logging.getLogger(logger_name)
    logger.setLevel(logging.INFO)
    logger.propagate = True

# Test logging is working
test_logger = logging.getLogger(__name__)
test_logger.info("✅ Logging configuration initialized successfully")
test_logger.info(f"🗂 Backend log file: {LOG_FILE_PATH}")

# Now import main (logging is already configured)
from main import app
log_startup_summary()

# Log that app is loaded
test_logger.info("✅ FastAPI application loaded successfully")

if __name__ == "__main__":
    print("=" * 70, flush=True)
    print("🚀 STARTING BACKEND SERVER WITH FULL LOGGING", flush=True)
    print("=" * 70, flush=True)
    print("Backend URL: http://localhost:8000", flush=True)
    print("API Docs: http://localhost:8000/docs", flush=True)
    print("=" * 70, flush=True)
    print()
    print("💡 ALL LOGS WILL APPEAR BELOW:", flush=True)
    print("   ✓ LDAP connection attempts", flush=True)
    print("   ✓ AI enablement status", flush=True)
    print("   ✓ JQL generation for each query", flush=True)
    print("   ✓ Query execution results", flush=True)
    print("   ✓ HTTP requests and responses", flush=True)
    print()
    print("🛑 Press Ctrl+C to stop the server", flush=True)
    print("=" * 70, flush=True)
    print()
    
    # Immediate test - this should ALWAYS appear
    print("✅ LOGGING TEST: If you see this, logging is working!", flush=True)
    test_logger = logging.getLogger("startup_test")
    test_logger.info("✅ Startup test log - logging system is operational")
    print()
    print("=" * 70, flush=True)
    print("📋 WHAT TO EXPECT:", flush=True)
    print("=" * 70, flush=True)
    print("1. When frontend makes API calls, you'll see:", flush=True)
    print("   🌐 INCOMING REQUEST: POST /api/chat/enhanced", flush=True)
    print("   💬 CHAT ENDPOINT CALLED: '/api/chat/enhanced'", flush=True)
    print("   📝 MESSAGE RECEIVED: 'your question'", flush=True)
    print("   🔍 GENERATING JQL FROM QUERY...", flush=True)
    print("   ✅ GENERATED JQL: project = ...", flush=True)
    print("   📊 JQL RESULT: X issues found", flush=True)
    print()
    print("2. To test logging RIGHT NOW, open browser and visit:", flush=True)
    print("   http://localhost:8000/api/test-logging", flush=True)
    print("   (You should see test logs appear immediately)", flush=True)
    print()
    print("3. If you DON'T see logs when using frontend:", flush=True)
    print("   - Check browser console for CORS errors", flush=True)
    print("   - Verify frontend is calling http://localhost:8000", flush=True)
    print("   - Check Network tab in browser DevTools", flush=True)
    print("=" * 70, flush=True)
    print()
    
    # Ensure uvicorn access logger is properly configured
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.setLevel(logging.INFO)
    access_logger.propagate = True
    
    # Run uvicorn with explicit configuration
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True,
        use_colors=True,
        log_config=None,  # Use our custom logging config
    )

