from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from vercel_runtime.headers import (
    clear_vercel_headers_context,
    current_forwarded_host,
    normalize_event_header_pairs,
    set_vercel_headers_from_asgi_pairs,
    set_vercel_headers_from_http_headers,
)


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


class TestForwardedHostContext(unittest.TestCase):
    """The routed host is trustworthy provenance for "am I promoted" checks."""

    def tearDown(self) -> None:
        clear_vercel_headers_context()

    def test_http_headers_expose_the_forwarded_host(self) -> None:
        set_vercel_headers_from_http_headers(
            {"X-Forwarded-Host": "app.example.com", "host": "ignored.internal"}
        )

        self.assertEqual(current_forwarded_host(), "app.example.com")

    def test_asgi_pairs_expose_the_forwarded_host(self) -> None:
        set_vercel_headers_from_asgi_pairs(
            [(b"x-forwarded-host", b"app.example.com")]
        )

        self.assertEqual(current_forwarded_host(), "app.example.com")

    def test_host_is_the_fallback(self) -> None:
        set_vercel_headers_from_http_headers({"host": "app.example.com"})

        self.assertEqual(current_forwarded_host(), "app.example.com")

    def test_clearing_the_context_resets_the_host(self) -> None:
        set_vercel_headers_from_http_headers({"host": "app.example.com"})
        clear_vercel_headers_context()

        self.assertIsNone(current_forwarded_host())

    def test_no_request_means_no_host(self) -> None:
        self.assertIsNone(current_forwarded_host())


class TestInvocationHooksReexport(unittest.TestCase):
    def test_hooks_module_exposes_the_accessor(self) -> None:
        from vercel_runtime.invocation_hooks import (
            current_forwarded_host as hook_accessor,
        )

        self.assertIs(hook_accessor, current_forwarded_host)
