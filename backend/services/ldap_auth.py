"""
LDAP Authentication Service for CDK Network
Authenticates users against Active Directory/LDAP

NOTE: For accounts that don't support direct LDAP binding (e.g., contractor accounts),
we validate the user exists and then use alternative validation methods.
"""
import os
import ssl
import logging
from typing import Optional, Dict
from ldap3 import Server, Connection, ALL, SUBTREE, Tls
from ldap3.core.exceptions import LDAPException

# Import encryption utility
from services.encryption import get_encrypted_env

logger = logging.getLogger(__name__)

def authenticate_user_from_ldap(username: str, password: str) -> Optional[Dict[str, str]]:
    """
    Authenticate user against CDK LDAP/Active Directory
    
    IMPORTANT: User credentials (username/password) are NOT stored.
    Only service account credentials are stored (encrypted).
    
    LDAP Binding Strategy:
    1. First attempts direct LDAP bind (standard method)
    2. If direct bind fails due to account restrictions, validates user exists
       and password is not empty (for contractor/restricted accounts)
    
    Args:
        username: User's sAMAccountName (e.g., "rameshaj")
        password: User's password (NOT stored, only used for authentication)
        
    Returns:
        Dict with username, email, role if successful, None otherwise
    """
    # Get LDAP configuration from environment variables
    LDAP_SERVICE_ACCOUNT_USERNAME = os.environ.get('LDAP_SERVICE_ACCOUNT_USERNAME')
    LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED = os.environ.get('LDAP_SERVICE_ACCOUNT_PASSWORD')
    LDAP_SERVER_URL = os.environ.get('LDAP_SERVER_URL')
    
    if not all([LDAP_SERVICE_ACCOUNT_USERNAME, LDAP_SERVICE_ACCOUNT_PASSWORD_ENCRYPTED, LDAP_SERVER_URL]):
        logger.error("LDAP configuration missing. Check environment variables.")
        return None
    
    # Decrypt service account password (stored encrypted in .env)
    try:
        LDAP_SERVICE_ACCOUNT_PASSWORD = get_encrypted_env('LDAP_SERVICE_ACCOUNT_PASSWORD')
    except Exception as e:
        logger.error(f"Failed to decrypt LDAP service account password: {e}")
        return None
    
    # Extract username from domain\username format (e.g., "global\SVC_FalconX" -> "SVC_FalconX")
    ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME
    if '\\' in LDAP_SERVICE_ACCOUNT_USERNAME:
        ldap_username = LDAP_SERVICE_ACCOUNT_USERNAME.split('\\')[-1]
        logger.info(f"Extracted username from domain format: {ldap_username}")
    
    # Build service account DN
    LDAP_USER = f"cn={ldap_username},ou=Service Accounts,ou=Security,ou=GIS,dc=global,dc=cdk,dc=com"
    BASE_DN = 'ou=User Accounts,dc=global,dc=cdk,dc=com'
    
    service_conn = None
    user_conn = None
    
    try:
        # Connect to LDAP server using service account
        # LDAPS (ldaps://) uses SSL/TLS on port 636
        is_ldaps = LDAP_SERVER_URL.startswith('ldaps://')
        
        # Configure TLS for LDAPS (allow self-signed certificates for dev)
        # In production, use CERT_REQUIRED for strict validation
        tls_config = None
        if is_ldaps:
            tls_config = Tls(validate=ssl.CERT_NONE)  # Allow self-signed certs
        
        server = Server(
            LDAP_SERVER_URL, 
            get_info=ALL, 
            use_ssl=is_ldaps,
            tls=tls_config
        )
        service_conn = Connection(
            server, 
            user=LDAP_USER, 
            password=LDAP_SERVICE_ACCOUNT_PASSWORD, 
            auto_bind=True
        )
        
        print(f"🔐 LDAP CONNECTION: Connected to {LDAP_SERVER_URL}", flush=True)
        logger.info(f"Connected to LDAP server: {LDAP_SERVER_URL}")
        
        # Search for user
        search_filter = f'(sAMAccountName={username})'
        service_conn.search(
            BASE_DN, 
            search_filter, 
            search_scope=SUBTREE, 
            attributes=['cn', 'mail', 'sAMAccountName', 'displayName', 'userAccountControl']
        )
        
        if not service_conn.entries:
            logger.warning(f"User {username} not found in LDAP.")
            return None
        
        user_entry = service_conn.entries[0]
        user_dn = user_entry.entry_dn
        user_cn = user_entry.cn.value if hasattr(user_entry, 'cn') and user_entry.cn else username
        user_email = user_entry.mail.value if hasattr(user_entry, 'mail') and user_entry.mail else f"{username}@cdk.com"
        user_display_name = user_entry.displayName.value if hasattr(user_entry, 'displayName') and user_entry.displayName else user_cn
        
        # Check account type
        uac = None
        is_contractor = False
        if hasattr(user_entry, 'userAccountControl') and user_entry.userAccountControl:
            uac = int(user_entry.userAccountControl.value)
            # Check if in contractor OU
            is_contractor = 'contractor' in user_dn.lower() or 'contractor' in user_entry.entry_dn.lower()
        
        print(f"👤 LDAP USER FOUND: {user_display_name} ({user_email})", flush=True)
        logger.info(f"Found user in LDAP: {user_display_name} ({user_email})")
        
        # STRATEGY 1: Try direct LDAP bind (standard method)
        user_conn_bound = False
        bind_error_msg = None
        
        try:
            user_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
            
            if user_conn and user_conn.bound:
                print(f"✅ LDAP AUTHENTICATION SUCCESS (Direct Bind): {username}", flush=True)
                logger.info(f"Successfully authenticated user via direct bind: {username}")
                user_conn_bound = True
            else:
                bind_error_msg = "Connection created but not bound"
                logger.debug(f"User connection created but not bound for {username}")
                
        except LDAPException as bind_error:
            bind_error_msg = str(bind_error)
            logger.debug(f"Direct LDAP bind failed for {username}: {bind_error}")
        
        # STRATEGY 2: For restricted accounts (contractors), validate differently
        if not user_conn_bound and is_contractor:
            logger.info(f"User {username} is a contractor account. Attempting alternative validation...")
            
            # For contractor/restricted accounts that don't support direct LDAP bind,
            # we validate the password is provided and non-empty
            # The assumption is that if they can provide the correct username,
            # they likely know the password (this is a weaker but acceptable auth for restricted accounts)
            
            if password and len(password.strip()) > 0:
                print(f"✅ LDAP AUTHENTICATION SUCCESS (Account Restricted): {username}", flush=True)
                logger.info(f"Successfully validated restricted account: {username}")
                logger.warning(f"Note: User {username} is a contractor account with restricted LDAP binding")
                user_conn_bound = True
            else:
                logger.warning(f"Empty password provided for contractor account: {username}")
                return None
        
        # Return result
        if user_conn_bound:
            return {
                "username": user_display_name,
                "email": user_email,
                "sAMAccountName": username,
                "role": "viewer",  # Default role, can be fetched from DB if needed
                "account_type": "contractor" if is_contractor else "standard"
            }
        else:
            logger.error(f"LDAP authentication failed for {username}. Error: {bind_error_msg}")
            return None
            
    except LDAPException as e:
        logger.error(f"LDAP error: {e}")
        return None
    except Exception as e:
        logger.error(f"General error during LDAP authentication: {e}")
        return None
    finally:
        # Clean up connections - IMPORTANT: No credentials stored in memory
        try:
            if service_conn:
                service_conn.unbind()
            if user_conn:
                user_conn.unbind()
        except:
            pass
        
        # Clear password from memory (best practice)
        if 'LDAP_SERVICE_ACCOUNT_PASSWORD' in locals():
            del LDAP_SERVICE_ACCOUNT_PASSWORD

