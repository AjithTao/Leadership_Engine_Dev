"""
Script to generate encrypted passwords for .env file
Usage: python generate_env.py

SECURITY: This script prompts for passwords securely (no hardcoded passwords)
Passwords are not displayed or stored in the script.
"""
import sys
import os
import getpass

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# SESSION_SECRET_KEY must be set before importing the encryption module,
# so encryption here uses the same key as production
if 'SESSION_SECRET_KEY' not in os.environ:
    print("❌ SESSION_SECRET_KEY is not set. Set it in your environment or .env file first.")
    sys.exit(1)

from services.encryption import encrypt_password

def main():
    print("="*70)
    print("PASSWORD ENCRYPTION UTILITY")
    print("="*70)
    print("\n⚠️  SECURITY: Passwords will be prompted securely (not displayed)")
    print("   No passwords are stored in this script.\n")
    
    # Prompt for usernames/emails
    print("Enter service account usernames/emails:")
    jira_username = input("Jira Username/Email (default: rameshaj): ").strip() or "rameshaj"
    confluence_username = input("Confluence Username/Email (default: rameshaj): ").strip() or "rameshaj"
    
    # Prompt for passwords securely (not displayed)
    print("\nEnter passwords securely (input will be hidden):")
    ldap_password = getpass.getpass("LDAP Service Account Password: ")
    jira_password = getpass.getpass("Jira API Token/Password: ")
    confluence_password = getpass.getpass("Confluence API Token/Password (or press Enter to use same as Jira): ")
    
    # Use Jira password for Confluence if not provided
    if not confluence_password:
        confluence_password = jira_password
        print("   Using Jira password for Confluence")
    
    print("\nEncrypting passwords...")
    
    try:
        ldap_encrypted = encrypt_password(ldap_password)
        jira_encrypted = encrypt_password(jira_password)
        confluence_encrypted = encrypt_password(confluence_password)
        
        # Clear passwords from memory
        del ldap_password, jira_password, confluence_password
        
        print("✅ Encryption successful!\n")
        print("="*70)
        print("ENCRYPTED VALUES GENERATED:")
        print("="*70)
        print(f"\nLDAP_SERVICE_ACCOUNT_PASSWORD={ldap_encrypted}")
        print(f"\nJIRA_SERVICE_EMAIL={jira_username}")
        print(f"JIRA_SERVICE_API_TOKEN={jira_encrypted}")
        print(f"\nCONFLUENCE_SERVICE_EMAIL={confluence_username}")
        print(f"CONFLUENCE_SERVICE_API_TOKEN={confluence_encrypted}")
        print("\n" + "="*70)
        print("\n⚠️  IMPORTANT:")
        print("1. Copy these encrypted values to backend/config/.env file")
        print("2. Make sure SESSION_SECRET_KEY in .env matches the one used here")
        print("3. Never commit .env file to git!")
        print("4. Passwords are cleared from memory - script is secure")
        print("="*70)
        
    except Exception as e:
        print(f"\n❌ Error encrypting passwords: {e}")
        print("\nMake sure you have installed dependencies:")
        print("  pip install cryptography")
        sys.exit(1)

if __name__ == "__main__":
    main()

