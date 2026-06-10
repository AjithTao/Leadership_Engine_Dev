"""
Test alternative LDAP bind methods
"""
import os
import sys
import ssl
import logging
from ldap3 import Server, Connection, ALL, SUBTREE, Tls
from ldap3.core.exceptions import LDAPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s'
)
logger = logging.getLogger(__name__)

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', 'config', '.env'))

from services.encryption import get_encrypted_env

def test_bind_methods(username: str, password: str):
    """Test different LDAP bind methods"""
    
    LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
    LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
    BASE_DN = 'ou=User Accounts,dc=global,dc=cdk,dc=com'
    
    LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
    
    # Setup server connection
    ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1]
    LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
    
    is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
    tls_config = None
    if is_ldaps:
        tls_config = Tls(validate=ssl.CERT_NONE)
    
    server = Server(LDAP_SERVER_URL, get_info=ALL, use_ssl=is_ldaps, tls=tls_config)
    service_conn = Connection(server, user=LDAP_USER, password=LDAP_SERVICE_ACCOUNT_PASSWORD, auto_bind=True)
    
    # Find user
    search_filter = f'(sAMAccountName={username})'
    service_conn.search(
        BASE_DN,
        search_filter,
        search_scope=SUBTREE,
        attributes=['cn', 'mail', 'sAMAccountName', 'displayName', 'userPrincipalName']
    )
    
    if not service_conn.entries:
        print(f"User {username} not found")
        service_conn.unbind()
        return
    
    user_entry = service_conn.entries[0]
    user_dn = user_entry.entry_dn
    user_principal_name = user_entry.userPrincipalName.value if hasattr(user_entry, 'userPrincipalName') and user_entry.userPrincipalName else None
    
    print(f"\n📋 User Information:")
    print(f"  DN: {user_dn}")
    print(f"  UPN: {user_principal_name}")
    print(f"  SAM Account: {username}")
    
    # Test Method 1: DN Binding
    print(f"\n🧪 METHOD 1: Bind using DN")
    print(f"   DN: {user_dn}")
    try:
        user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        if user_conn and user_conn.bound:
            print(f"   ✅ SUCCESS")
        else:
            print(f"   ❌ FAILED - Connection not bound")
    except LDAPException as e:
        print(f"   ❌ FAILED - {e}")
    
    # Test Method 2: UPN Binding
    if user_principal_name:
        print(f"\n🧪 METHOD 2: Bind using User Principal Name (UPN)")
        print(f"   UPN: {user_principal_name}")
        try:
            user_conn = Connection(server, user=user_principal_name, password=password, auto_bind=True)
            if user_conn and user_conn.bound:
                print(f"   ✅ SUCCESS")
            else:
                print(f"   ❌ FAILED - Connection not bound")
        except LDAPException as e:
            print(f"   ❌ FAILED - {e}")
    
    # Test Method 3: SAM Account Name with domain
    print(f"\n🧪 METHOD 3: Bind using SAM Account (domain\\username)")
    sam_account = f"global\\{username}"
    print(f"   Account: {sam_account}")
    try:
        user_conn = Connection(server, user=sam_account, password=password, auto_bind=True)
        if user_conn and user_conn.bound:
            print(f"   ✅ SUCCESS")
        else:
            print(f"   ❌ FAILED - Connection not bound")
    except LDAPException as e:
        print(f"   ❌ FAILED - {e}")
    
    service_conn.unbind()

if __name__ == "__main__":
    print("\n🔬 LDAP Bind Method Testing\n")
    
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    
    if username and password:
        test_bind_methods(username, password)
