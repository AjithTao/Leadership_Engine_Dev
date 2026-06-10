import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
#!/usr/bin/env python3
"""
Quick script to verify Databricks OpenAI configuration is loaded correctly
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent / 'config' / '.env'
load_dotenv(env_path, override=True)

print("=" * 60)
print("Databricks OpenAI Configuration Verification")
print("=" * 60)
print()

# Check required variables
api_key = os.getenv("OPENAI_API_KEY")
endpoint = os.getenv("OPENAI_API_ENDPOINT")
model = os.getenv("OPENAI_MODEL", "databricks-gpt-5-1")

# Verify API Key
print("[*] API Key:")
if api_key:
    if api_key.startswith("dapi"):
        print(f"  [OK] Found Databricks API token (starts with 'dapi')")
        print(f"  [INFO] Token: {api_key[:10]}...{api_key[-4:]}")
    elif api_key.startswith("sk-"):
        print(f"  [WARN] Found OpenAI API key (starts with 'sk-')")
        print(f"  [INFO] Key: {api_key[:10]}...{api_key[-4:]}")
    else:
        print(f"  [OK] Found API key")
        print(f"  [INFO] Key: {api_key[:10]}...{api_key[-4:]}")
else:
    print("  [ERROR] OPENAI_API_KEY not found!")

print()

# Verify Endpoint
print("[*] Endpoint:")
if endpoint:
    if "databricks" in endpoint.lower():
        print(f"  [OK] Found Databricks endpoint")
        print(f"  [INFO] URL: {endpoint}")
        if endpoint.endswith("/invocations"):
            print(f"  [OK] Endpoint URL format is correct (ends with /invocations)")
        else:
            print(f"  [WARN] Endpoint URL should end with /invocations")
    else:
        print(f"  [WARN] Endpoint doesn't contain 'databricks'")
        print(f"  [INFO] URL: {endpoint}")
else:
    print("  [ERROR] OPENAI_API_ENDPOINT not found!")

print()

# Verify Model
print("[*] Model:")
if model:
    if "databricks" in model.lower() or "gpt-5" in model.lower():
        print(f"  [OK] Model name matches Databricks endpoint: {model}")
    else:
        print(f"  [WARN] Model name: {model}")
        print(f"  [TIP] Consider using 'databricks-gpt-5-1' to match your endpoint")
else:
        print("  [WARN] OPENAI_MODEL not set, using default: databricks-gpt-5-1")

print()
print("=" * 60)

# Overall status
if api_key and endpoint:
    print("[SUCCESS] Configuration looks good!")
    print()
    print("Summary:")
    print(f"  - API Key: {'[OK] Set' if api_key else '[ERROR] Missing'}")
    print(f"  - Endpoint: {'[OK] Set' if endpoint else '[ERROR] Missing'}")
    print(f"  - Model: {model}")
    print()
    print("[READY] Ready to use Databricks GPT-5.1!")
else:
    print("[ERROR] Configuration incomplete!")
    print("   Please check your .env file and ensure:")
    print("   - OPENAI_API_KEY is set")
    print("   - OPENAI_API_ENDPOINT is set")

print("=" * 60)

