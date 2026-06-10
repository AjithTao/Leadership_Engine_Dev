"""
Debug password and encoding issues
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

def debug_password_issue(username: str, password: str):
    """Debug password encoding and binding issues"""
    
    print("\n" + "="*70)
    print("PASSWORD & ENCODING DEBUG")
    print("="*70)
    
    print(f"\n📊 Password Analysis:")
    print(f"  Input: {password}")
    print(f"  Length: {len(password)}")
    print(f"  Bytes: {password.encode('utf-8')}")
    print(f"  Repr: {repr(password)}")
    print(f"  Hex: {password.encode('utf-8').hex()}")
    
    # Check for special characters
    special_chars = []
    for i, char in enumerate(password):
        if ord(char) > 127:
            special_chars.append(f"Position {i}: {char} (U+{ord(char):04X})")
        elif char in '@#$%^&*()[]{}|\\\"\';:<>?,./':
            special_chars.append(f"Position {i}: {char}")
    
    if special_chars:
        print(f"\n⚠️  Special Characters Found:")
        for sc in special_chars:
            print(f"    {sc}")
    else:
        print(f"\n✅ No special/unicode characters detected")
    
    print(f"\n" + "="*70)
    print("LDAP BINDING TEST")
    print("="*70)
    
    LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
    LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
    BASE_DN = 'ou=User Accounts,dc=global,dc=cdk,dc=com'
    
    LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
    
    ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1]
    LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
    
    is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
    tls_config = None
    if is_ldaps:
        tls_config = Tls(validate=ssl.CERT_NONE)
    
    server = Server(LDAP_SERVER_URL, get_info=ALL, use_ssl=is_ldaps, tls=tls_config)
    service_conn = Connection(server, user=LDAP_USER, password=LDAP_SERVICE_ACCOUNT_PASSWORD, auto_bind=True)
    
    # Find user and get all attributes
    search_filter = f'(sAMAccountName={username})'
    service_conn.search(
        BASE_DN,
        search_filter,
        search_scope=SUBTREE,
        attributes=['*']  # Get all attributes
    )
    
    if not service_conn.entries:
        print(f"User {username} not found")
        service_conn.unbind()
        return
    
    user_entry = service_conn.entries[0]
    user_dn = user_entry.entry_dn
    
    print(f"\n🔐 Trying to bind with different password formats:")
    
    # Test 1: Direct password
    print(f"\n1️⃣  Direct password (as-is):")
    print(f"   Password: {repr(password)}")
    try:
        conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        if conn and conn.bound:
            print(f"   ✅ SUCCESS")
        else:
            print(f"   ❌ FAILED")
    except LDAPException as e:
        print(f"   ❌ ERROR: {e}")
    
    # Test 2: Stripped password
    pwd_stripped = password.strip()
    if pwd_stripped != password:
        print(f"\n2️⃣  Stripped password (whitespace removed):")
        print(f"   Password: {repr(pwd_stripped)}")
        try:
            conn = Connection(server, user=user_dn, password=pwd_stripped, auto_bind=True)
            if conn and conn.bound:
                print(f"   ✅ SUCCESS")
            else:
                print(f"   ❌ FAILED")
        except LDAPException as e:
            print(f"   ❌ ERROR: {e}")
    
    # Test 3: Try without auto_bind to see if bind error is different
    print(f"\n3️⃣  Manual bind (without auto_bind):")
    print(f"   DN: {user_dn}")
    try:
        conn = Connection(server, user=user_dn, password=password)
        print(f"   Connection created, attempting manual bind...")
        conn.bind()
        if conn.bound:
            print(f"   ✅ SUCCESS - Bind result: {conn.result}")
        else:
            print(f"   ❌ FAILED - Bound: {conn.bound}, Result: {conn.result}")
    except LDAPException as e:
        print(f"   ❌ ERROR: {e}")
    
    # Show user attributes
    print(f"\n👤 User Attributes in LDAP:")
    print(f"   DN: {user_dn}")
    print(f"   sAMAccountName: {user_entry.sAMAccountName.value if hasattr(user_entry, 'sAMAccountName') and user_entry.sAMAccountName else 'N/A'}")
    print(f"   userPrincipalName: {user_entry.userPrincipalName.value if hasattr(user_entry, 'userPrincipalName') and user_entry.userPrincipalName else 'N/A'}")
    print(f"   mail: {user_entry.mail.value if hasattr(user_entry, 'mail') and user_entry.mail else 'N/A'}")
    print(f"   displayName: {user_entry.displayName.value if hasattr(user_entry, 'displayName') and user_entry.displayName else 'N/A'}")
    
    # Check if account is enabled
    if hasattr(user_entry, 'userAccountControl') and user_entry.userAccountControl:
        uac = int(user_entry.userAccountControl.value)
        is_disabled = bool(uac & 0x0002)
        print(f"   Account Disabled: {is_disabled}")
    
    service_conn.unbind()

if __name__ == "__main__":
    print("\n🔬 LDAP Password & Encoding Debug\n")
    
    username = input("Username: ").strip()
    password = input("Password: ").strip()
    
    if username and password:
        debug_password_issue(username, password)
