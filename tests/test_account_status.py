"""
Advanced LDAP debugging - Check account status and policies
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

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'backend', 'config', '.env'))

from services.encryption import get_encrypted_env

def check_account_status(username: str):
    """Check detailed account status in LDAP"""
    
    print("\n" + "="*70)
    print("ACCOUNT STATUS CHECK IN LDAP")
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
    
    # Find user
    search_filter = f'(sAMAccountName={username})'
    service_conn.search(
        BASE_DN,
        search_filter,
        search_scope=SUBTREE,
        attributes=['*']
    )
    
    if not service_conn.entries:
        print(f"User {username} not found")
        service_conn.unbind()
        return
    
    user_entry = service_conn.entries[0]
    
    print(f"\n👤 User: {username}")
    print(f"   Display Name: {user_entry.displayName.value if hasattr(user_entry, 'displayName') and user_entry.displayName else 'N/A'}")
    
    # Check account flags
    uac = None
    if hasattr(user_entry, 'userAccountControl') and user_entry.userAccountControl:
        uac = int(user_entry.userAccountControl.value)
        print(f"\n🔐 Account Control Flags (UAC): {uac}")
        
        flags = {
            0x0001: "SCRIPT",
            0x0002: "ACCOUNTDISABLE",
            0x0004: "HOMEDIR_REQUIRED",
            0x0008: "LOCKOUT",
            0x0010: "PASSWD_NOTREQD",
            0x0020: "PASSWD_CANT_CHANGE",
            0x0040: "ENCRYPTED_TEXT_PWD_ALLOWED",
            0x0080: "TEMP_DUPLICATE_ACCOUNT",
            0x0100: "NORMAL_ACCOUNT",
            0x0200: "INTERDOMAIN_TRUST_ACCOUNT",
            0x0400: "WORKSTATION_TRUST_ACCOUNT",
            0x0800: "SERVER_TRUST_ACCOUNT",
            0x1000: "DONT_EXPIRE_PASSWD",
            0x2000: "SMARTCARD_REQUIRED",
            0x4000: "TRUSTED_FOR_DELEGATION",
            0x8000: "NOT_DELEGATED",
            0x10000: "USE_DES_KEY_ONLY",
            0x20000: "DONT_REQ_PREAUTH",
            0x40000: "PASSWORD_EXPIRED",
            0x80000: "TRUSTED_TO_AUTH_FOR_DELEGATION",
        }
        
        print("   Enabled Flags:")
        for flag_val, flag_name in sorted(flags.items()):
            if uac & flag_val:
                print(f"      ✓ {flag_name}")
    
    # Check password expiration
    if hasattr(user_entry, 'pwdLastSet') and user_entry.pwdLastSet:
        pwd_last_set = user_entry.pwdLastSet.value
        print(f"\n🔑 Password Last Set: {pwd_last_set}")
        if pwd_last_set == 0:
            print(f"   ⚠️  PASSWORD CHANGE REQUIRED ON NEXT LOGON!")
    
    if hasattr(user_entry, 'accountExpires') and user_entry.accountExpires:
        acc_expires = user_entry.accountExpires.value
        print(f"\n📅 Account Expires: {acc_expires}")
        if acc_expires > 0 and acc_expires != 9223372036854775807:
            print(f"   ⚠️  Account has expiration set!")
    
    # Check lockout status
    if hasattr(user_entry, 'lockoutTime') and user_entry.lockoutTime:
        lockout_time = user_entry.lockoutTime.value
        print(f"\n🔒 Lockout Time: {lockout_time}")
        if lockout_time > 0:
            print(f"   ⚠️  ACCOUNT IS CURRENTLY LOCKED OUT!")
    
    # Check last login
    if hasattr(user_entry, 'lastLogonTimestamp') and user_entry.lastLogonTimestamp:
        last_logon = user_entry.lastLogonTimestamp.value
        print(f"\n📍 Last Logon: {last_logon}")
    
    # Check if in any special groups
    if hasattr(user_entry, 'memberOf') and user_entry.memberOf:
        print(f"\n👥 Member of {len(user_entry.memberOf)} groups:")
        for group in user_entry.memberOf:
            print(f"    - {group}")
    
    service_conn.unbind()
    
    print("\n" + "="*70)
    print("RECOMMENDATIONS")
    print("="*70)
    if uac and (uac & 0x0008):
        print("❌ Account is LOCKED OUT - Contact admin to unlock")
    elif uac and (uac & 0x0002):
        print("❌ Account is DISABLED - Contact admin to enable")
    elif hasattr(user_entry, 'pwdLastSet') and user_entry.pwdLastSet and user_entry.pwdLastSet.value == 0:
        print("❌ Password change required on next logon")
        print("   Solution: Change password on Windows or via AD Self Service")
    elif uac and (uac & 0x40000):
        print("⚠️  Password has EXPIRED - Change password immediately")
    else:
        print("✓ Account appears to be in good standing")
        print("✓ Issue might be related to:")
        print("  - Logon hour restrictions")
        print("  - Workstation restrictions")
        print("  - Password format issue (try changing password)")
        print("  - LDAP binding permissions")

if __name__ == "__main__":
    print("\n🔬 LDAP Account Status Checker\n")
    
    username = input("Username: ").strip()
    
    if username:
        check_account_status(username)
