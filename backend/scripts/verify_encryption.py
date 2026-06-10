"""
Script to verify encryption/decryption is working correctly
Usage: python verify_encryption.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# SESSION_SECRET_KEY must be set before importing the encryption module
if 'SESSION_SECRET_KEY' not in os.environ:
    print("❌ SESSION_SECRET_KEY is not set. Set it in your environment or .env file first.")
    sys.exit(1)

from services.encryption import encrypt_password, decrypt_password, get_encrypted_env

def main():
    print("="*70)
    print("ENCRYPTION VERIFICATION UTILITY")
    print("="*70)
    
    # Dummy value for the round-trip test — not a real credential
    test_password = "round-trip-test-value-123!"
    
    print(f"\n1. Testing encryption/decryption...")
    print(f"   Original password: {test_password}")
    
    try:
        # Encrypt
        encrypted = encrypt_password(test_password)
        print(f"   ✅ Encrypted: {encrypted[:50]}...")
        
        # Decrypt
        decrypted = decrypt_password(encrypted)
        print(f"   ✅ Decrypted: {decrypted}")
        
        if decrypted == test_password:
            print(f"   ✅ Encryption/Decryption working correctly!")
        else:
            print(f"   ❌ Mismatch! Expected: {test_password}, Got: {decrypted}")
            
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return
    
    print(f"\n2. Checking environment variables...")
    print(f"   SESSION_SECRET_KEY: {os.environ.get('SESSION_SECRET_KEY', 'NOT SET')}")
    
    # Check if .env values are encrypted or plain text
    print(f"\n3. Checking .env file values...")
    
    jira_token_env = os.environ.get('JIRA_SERVICE_API_TOKEN')
    if jira_token_env:
        print(f"   JIRA_SERVICE_API_TOKEN found: {len(jira_token_env)} chars")
        print(f"   Preview: {jira_token_env[:50]}...")
        
        # Try to decrypt
        try:
            decrypted_token = get_encrypted_env('JIRA_SERVICE_API_TOKEN')
            if decrypted_token == jira_token_env:
                print(f"   ⚠️  WARNING: Value appears to be plain text (not encrypted)")
                print(f"   Expected encrypted value, but got plain text: {decrypted_token}")
            else:
                print(f"   ✅ Successfully decrypted (value is encrypted)")
                print(f"   Decrypted value: {decrypted_token}")
        except Exception as e:
            print(f"   ❌ Failed to decrypt: {e}")
    else:
        print(f"   ⚠️  JIRA_SERVICE_API_TOKEN not found in environment")
    
    print("\n" + "="*70)
    print("\n💡 TROUBLESHOOTING:")
    print("   1. Make sure SESSION_SECRET_KEY in .env matches encryption key")
    print("   2. Make sure passwords in .env are encrypted (run generate_env.py)")
    print("   3. Check that .env file is loaded correctly")
    print("="*70)

if __name__ == "__main__":
    main()

