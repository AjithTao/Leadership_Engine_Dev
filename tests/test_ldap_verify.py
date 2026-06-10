"""
LDAP Authentication Verification Test
Tests actual LDAP binding with user credentials
"""
import os
import sys
import ssl
import logging
from ldap3 import Server, Connection, ALL, SUBTREE, Tls
from ldap3.core.exceptions import LDAPException

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
)
logger = logging.getLogger(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', 'config', '.env'))

from services.encryption import get_encrypted_env

def test_ldap_service_account():
    """Test service account connection"""
    print("\n" + "="*60)
    print("TEST 1: LDAP Service Account Connection")
    print("="*60)
    
    LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
    LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED = os.environ.get('LDAP_SERVICE_ACCOUNT_PASSWORD')
    LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
    
    print(f"\n📋 Configuration:")
    print(f"  Service Account: {LDAP_SERVICE_ACCOUNT_USERNAME}")
    print(f"  LDAP Server: {LDAP_SERVER_URL}")
    print(f"  Password Encrypted: {bool(LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED)}")
    
    try:
        # Decrypt password
        LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
        print(f"  ✅ Password Decrypted Successfully")
    except Exception as e:
        print(f"  ❌ Password Decryption Failed: {e}")
        return False
    
    # Extract username
    ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1] if '\\' in LDAP_SERVICE_ACCOUNT_USERNAME else LDAP_SERVICE_ACCOUNT_USERNAME
    LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
    
    print(f"\n🔧 Binding as Service Account:")
    print(f"  DN: {LDAP_USER}")
    
    try:
        is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
        tls_config = None
        if is_ldaps:
            tls_config = Tls(validate=ssl.CERT_NONE)
        
        server = Server(LDAP_SERVER_URL, get_info=ALL, use_ssl=is_ldaps, tls=tls_config)
        service_conn = Connection(server, user=LDAP_USER, password=LDAP_SERVICE_ACCOUNT_PASSWORD, auto_bind=True)
        
        print(f"  ✅ Service Account Bound Successfully")
        print(f"  Connection Bound: {service_conn.bound}")
        print(f"  Server Info: {server.info}")
        
        service_conn.unbind()
        return True
        
    except LDAPException as e:
        print(f"  ❌ LDAP Bind Failed: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False


def test_user_ldap_authentication(username: str, password: str):
    """Test user authentication"""
    print("\n" + "="*60)
    print(f"TEST 2: User LDAP Authentication - {username}")
    print("="*60)
    
    LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
    LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED = os.environ.get('LDAP_SERVICE_ACCOUNT_PASSWORD')
    LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
    BASE_DN = 'ou=User Accounts,dc=global,dc=cdk,dc=com'
    
    try:
        # Get service account password
        LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
        
        # Setup service account connection
        ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1] if '\\' in LDAP_SERVICE_ACCOUNT_USERNAME else LDAP_SERVICE_ACCOUNT_USERNAME
        LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
        
        is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
        tls_config = None
        if is_ldaps:
            tls_config = Tls(validate=ssl.CERT_NONE)
        
        server = Server(LDAP_SERVER_URL, get_info=ALL, use_ssl=is_ldaps, tls=tls_config)
        
        print(f"\n🔍 Step 1: Connecting with Service Account")
        service_conn = Connection(server, user=LDAP_USER, password=LDAP_SERVICE_ACCOUNT_PASSWORD, auto_bind=True)
        print(f"  ✅ Service account connected")
        
        print(f"\n🔍 Step 2: Searching for user '{username}'")
        search_filter = f'(sAMAccountName={username})'
        print(f"  Search Filter: {search_filter}")
        print(f"  Base DN: {BASE_DN}")
        
        service_conn.search(
            BASE_DN,
            search_filter,
            search_scope=SUBTREE,
            attributes=['cn', 'mail', 'sAMAccountName', 'displayName', 'distinguishedName']
        )
        
        if not service_conn.entries:
            print(f"  ❌ User '{username}' NOT found in LDAP")
            service_conn.unbind()
            return False
        
        user_entry = service_conn.entries[0]
        user_dn = user_entry.entry_dn
        user_cn = user_entry.cn.value if hasattr(user_entry, 'cn') and user_entry.cn else username
        user_email = user_entry.mail.value if hasattr(user_entry, 'mail') and user_entry.mail else f"{username}@cdk.com"
        user_display_name = user_entry.displayName.value if hasattr(user_entry, 'displayName') and user_entry.displayName else user_cn
        
        print(f"  ✅ User Found:")
        print(f"    Display Name: {user_display_name}")
        print(f"    Email: {user_email}")
        print(f"    DN: {user_dn}")
        
        print(f"\n🔍 Step 3: Authenticating user with password")
        print(f"  Attempting to bind as: {user_dn}")
        
        try:
            user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
            
            print(f"  Connection Created")
            print(f"  Connection Bound: {user_conn.bound}")
            
            if user_conn and user_conn.bound:
                print(f"  ✅ USER AUTHENTICATION SUCCESSFUL!")
                user_conn.unbind()
                service_conn.unbind()
                return True
            else:
                print(f"  ❌ User authentication failed - bind failed")
                if hasattr(user_conn, 'last_error'):
                    print(f"    Error: {user_conn.last_error}")
                service_conn.unbind()
                return False
                
        except LDAPException as bind_error:
            print(f"  ❌ LDAP Bind Error: {bind_error}")
            service_conn.unbind()
            return False
            
    except Exception as e:
        print(f"  ❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("\n🧪 LDAP Authentication Verification Test Suite\n")
    
    # Test 1: Service Account
    service_ok = test_ldap_service_account()
    
    if service_ok:
        # Test 2: User Authentication
        print("\n⚠️  To test user authentication, enter your credentials:")
        username = input("Username (e.g., rameshaj): ").strip()
        password = input("Password: ").strip()
        
        if username and password:
            user_ok = test_user_ldap_authentication(username, password)
            
            print("\n" + "="*60)
            print("SUMMARY")
            print("="*60)
            print(f"Service Account: {'✅ PASS' if service_ok else '❌ FAIL'}")
            print(f"User Authentication: {'✅ PASS' if user_ok else '❌ FAIL'}")
        else:
            print("❌ Credentials not provided")
    else:
        print("\n❌ Service account test failed. Cannot proceed with user test.")
