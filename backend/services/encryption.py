"""
Password Encryption Utility for Secure Credential Storage
Uses Fernet symmetric encryption for encrypting passwords in environment variables
"""
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

logger = logging.getLogger(__name__)

# Generate a key from session secret (stored securely)
# In production, this should be stored in a secure key management system
MASTER_KEY_PASSWORD = os.environ.get('SESSION_SECRET_KEY', 'FalconX-Secure-Key-2024-Change-In-Production')

def get_encryption_key() -> bytes:
    """Generate encryption key from master password"""
    # Use a fixed salt for consistency (in production, store salt separately)
    salt = b'falconx_salt_2024'  # In production, use os.urandom(16) and store securely
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(MASTER_KEY_PASSWORD.encode()))
    return key

def encrypt_password(password: str) -> str:
    """
    Encrypt a password for storage
    
    Args:
        password: Plain text password
        
    Returns:
        Encrypted password string (base64 encoded)
    """
    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        encrypted = fernet.encrypt(password.encode())
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Encryption error: {e}")
        raise

def decrypt_password(encrypted_password: str) -> str:
    """
    Decrypt a password from storage
    
    Args:
        encrypted_password: Encrypted password string
        
    Returns:
        Plain text password
    """
    try:
        if not encrypted_password:
            raise ValueError("Encrypted password is empty")
        
        key = get_encryption_key()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted_password.encode())
        return decrypted.decode()
    except Exception as e:
        logger.error(f"Decryption error: {type(e).__name__}: {str(e)}")
        logger.error(f"Encrypted password length: {len(encrypted_password) if encrypted_password else 0}")
        logger.error(f"SESSION_SECRET_KEY present: {bool(MASTER_KEY_PASSWORD)}")
        raise

def get_encrypted_env(key: str, default: str = None) -> str:
    """
    Get and decrypt an environment variable
    
    Args:
        key: Environment variable key
        default: Default value if not found
        
    Returns:
        Decrypted value or default
    """
    encrypted_value = os.environ.get(key)
    if not encrypted_value:
        return default
    
    # If it doesn't look encrypted (Fernet tokens start with gAAAAA), return as-is
    if not encrypted_value.startswith('gAAAAA'):
        logger.debug(f"{key} appears to be plain text, using directly")
        return encrypted_value
    
    try:
        return decrypt_password(encrypted_value)
    except Exception as e:
        logger.error(f"Failed to decrypt {key}: {str(e)}")
        logger.error(f"Encrypted value length: {len(encrypted_value) if encrypted_value else 0}")
        logger.error(f"Encrypted value preview: {encrypted_value[:50] if encrypted_value and len(encrypted_value) > 50 else encrypted_value}")
        logger.warning(f"⚠️  Decryption failed. If {key} is plain text, it should NOT start with 'gAAAAA'")
        logger.warning(f"   For testing: Update .env with plain text token (without gAAAAA prefix)")
        # Don't return encrypted value as it won't work - return None to trigger error handling
        return None

