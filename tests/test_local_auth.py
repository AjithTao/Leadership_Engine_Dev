import os
import sys
import unittest
from unittest.mock import patch


sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from services.local_auth import authenticate_local_user, local_auth_enabled


class LocalAuthTests(unittest.TestCase):
    def test_local_mode_and_valid_credentials(self):
        values = {
            "AUTH_MODE": "local",
            "APP_ADMIN_USERNAME": "falcon-admin",
            "APP_ADMIN_PASSWORD": "a-long-test-password",
            "APP_ADMIN_EMAIL": "admin@example.com",
        }
        with patch.dict(os.environ, values, clear=True):
            self.assertTrue(local_auth_enabled())
            self.assertEqual(
                authenticate_local_user("falcon-admin", "a-long-test-password"),
                {"username": "falcon-admin", "email": "admin@example.com", "role": "admin"},
            )

    def test_invalid_credentials_are_rejected(self):
        values = {
            "AUTH_MODE": "local",
            "APP_ADMIN_USERNAME": "falcon-admin",
            "APP_ADMIN_PASSWORD": "correct-password",
        }
        with patch.dict(os.environ, values, clear=True):
            self.assertIsNone(authenticate_local_user("falcon-admin", "wrong-password"))

    def test_missing_hosted_credentials_is_a_clear_error(self):
        with patch.dict(os.environ, {"AUTH_MODE": "local"}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "APP_ADMIN_USERNAME"):
                authenticate_local_user("admin", "password")


if __name__ == "__main__":
    unittest.main()
