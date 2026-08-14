from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from vercel_runtime.headers import normalize_event_header_pairs


class TestOidcHeaderNormalization(unittest.TestCase):
    def test_adds_oidc_header_from_environment(self) -> None:
        with patch.dict(os.environ, {"VERCEL_OIDC_TOKEN": "env-token"}):
            headers = normalize_event_header_pairs({"host": "example.com"})

        self.assertIn(("x-vercel-oidc-token", "env-token"), headers)

    def test_internal_oidc_header_takes_precedence_over_environment(
        self,
    ) -> None:
        with patch.dict(os.environ, {"VERCEL_OIDC_TOKEN": "env-token"}):
            headers = normalize_event_header_pairs(
                {
                    "x-vercel-internal-oidc-token": "internal-token",
                }
            )

        self.assertIn(("x-vercel-oidc-token", "internal-token"), headers)
        self.assertNotIn(
            ("x-vercel-internal-oidc-token", "internal-token"),
            headers,
        )

    def test_empty_env_var_does_not_inject_header(self) -> None:
        with patch.dict(os.environ, {"VERCEL_OIDC_TOKEN": ""}):
            headers = normalize_event_header_pairs({"host": "example.com"})

        self.assertFalse(
            any(key.lower() == "x-vercel-oidc-token" for key, _ in headers)
        )

    def test_no_oidc_source_does_not_inject_header(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            headers = normalize_event_header_pairs({"host": "example.com"})

        self.assertFalse(
            any(key.lower() == "x-vercel-oidc-token" for key, _ in headers)
        )

    def test_public_oidc_header_takes_precedence(self) -> None:
        with patch.dict(os.environ, {"VERCEL_OIDC_TOKEN": "env-token"}):
            headers = normalize_event_header_pairs(
                {
                    "x-vercel-oidc-token": "public-token",
                    "x-vercel-internal-oidc-token": "internal-token",
                }
            )

        self.assertEqual(
            [
                value
                for key, value in headers
                if key.lower() == "x-vercel-oidc-token"
            ],
            ["public-token"],
        )
        self.assertFalse(
            any(
                key.lower() == "x-vercel-internal-oidc-token"
                for key, _ in headers
            )
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
