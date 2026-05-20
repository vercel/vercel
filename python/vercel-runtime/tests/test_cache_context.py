from __future__ import annotations

import json
import types
import unittest
from typing import Any
from unittest.mock import Mock, patch

import vercel_runtime.cache as vrc


def _mock_cache_namespace(
    set_context_side_effect: Any = None,
) -> types.SimpleNamespace:
    sync_instance = object()
    async_instance = object()
    cache_build = types.SimpleNamespace(
        BuildCache=Mock(return_value=sync_instance),
        AsyncBuildCache=Mock(return_value=async_instance),
    )
    cv_cache = types.SimpleNamespace(set=Mock())
    cv_async_cache = types.SimpleNamespace(set=Mock())
    context = types.SimpleNamespace(
        set_context=Mock(side_effect=set_context_side_effect),
        _cv_cache=cv_cache,
        _cv_async_cache=cv_async_cache,
    )
    return types.SimpleNamespace(
        cache_build=cache_build,
        context=context,
        sync_instance=sync_instance,
        async_instance=async_instance,
    )


def _sc_headers_payload() -> dict[str, str]:
    return {"authorization": "Bearer fake-jwt", "x-vercel-extra": "1"}


def _sc_asgi_pairs(
    *,
    no_header_leak: bool = False,
    extra: list[tuple[bytes, bytes]] | None = None,
) -> list[tuple[bytes, bytes]]:
    pairs: list[tuple[bytes, bytes]] = [
        (b"x-vercel-sc-headers", json.dumps(_sc_headers_payload()).encode()),
        (b"x-vercel-sc-host", b"cache.example.com"),
        (b"x-vercel-sc-basepath", b"/iad1"),
        (b"x-vercel-sc-protocol", b"https"),
    ]
    if no_header_leak:
        pairs.append((b"x-vercel-sc-no-header-leak", b"1"))
    if extra:
        pairs.extend(extra)
    return pairs


def _sc_http_headers(*, no_header_leak: bool = False) -> dict[str, str]:
    headers: dict[str, str] = {
        "x-vercel-sc-headers": json.dumps(_sc_headers_payload()),
        "x-vercel-sc-host": "cache.example.com",
        "x-vercel-sc-basepath": "/iad1",
        "x-vercel-sc-protocol": "https",
    }
    if no_header_leak:
        headers["x-vercel-sc-no-header-leak"] = "1"
    return headers


class TestLoadVercelCache(unittest.TestCase):
    def test_returns_none_when_vercel_cache_missing(self) -> None:
        with patch.object(vrc, "_load_vercel_cache_modules", return_value=None):
            self.assertIsNone(vrc._load_vercel_cache_modules())


class TestApplyCacheContext(unittest.TestCase):
    def test_constructs_clients_and_installs_into_context(self) -> None:
        cache_ns = _mock_cache_namespace()

        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw=json.dumps(_sc_headers_payload()),
                sc_host="cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        sync_call = cache_ns.cache_build.BuildCache.call_args
        self.assertEqual(
            sync_call.kwargs["endpoint"],
            "https://cache.example.com/iad1/v1/suspense-cache/",
        )
        headers_sent = sync_call.kwargs["headers"]
        self.assertEqual(headers_sent["authorization"], "Bearer fake-jwt")
        self.assertEqual(
            headers_sent["x-vercel-internal-sc-client-origin"],
            "RUNTIME_CACHE",
        )
        self.assertEqual(
            headers_sent["x-vercel-internal-sc-client-name"],
            "RUNTIME_CACHE",
        )

        cache_ns.context.set_context.assert_called_once_with(
            cache=cache_ns.sync_instance,
            async_cache=cache_ns.async_instance,
        )

    def test_falls_back_when_async_cache_kwarg_unsupported(self) -> None:
        def reject_async_cache(**kwargs: object) -> None:
            if "async_cache" in kwargs:
                raise TypeError("unexpected keyword 'async_cache'")

        cache_ns = _mock_cache_namespace(
            set_context_side_effect=reject_async_cache,
        )

        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw=json.dumps(_sc_headers_payload()),
                sc_host="cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        calls = cache_ns.context.set_context.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertIn("async_cache", calls[0].kwargs)
        self.assertNotIn("async_cache", calls[1].kwargs)
        self.assertIs(calls[1].kwargs["cache"], cache_ns.sync_instance)

    def test_noop_when_sc_headers_missing(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw=None,
                sc_host="cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        cache_ns.context.set_context.assert_not_called()
        cache_ns.cache_build.BuildCache.assert_not_called()

    def test_noop_when_sc_host_missing(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw=json.dumps(_sc_headers_payload()),
                sc_host=None,
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        cache_ns.context.set_context.assert_not_called()

    def test_noop_when_vercel_cache_unavailable(self) -> None:
        with patch.object(vrc, "_load_vercel_cache_modules", return_value=None):
            vrc._apply_cache_context(
                sc_headers_raw=json.dumps(_sc_headers_payload()),
                sc_host="cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

    def test_noop_when_sc_headers_invalid_json(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw="{not json",
                sc_host="suspense-cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        cache_ns.context.set_context.assert_not_called()

    def test_noop_when_sc_headers_not_dict(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc._apply_cache_context(
                sc_headers_raw=json.dumps(["not", "a", "dict"]),
                sc_host="cache.example.com",
                sc_basepath="/iad1",
                sc_protocol="https",
            )

        cache_ns.context.set_context.assert_not_called()


class TestSetRuntimeCacheFromASGI(unittest.TestCase):
    def test_installs_cache_when_sc_headers_present(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc.set_runtime_cache_from_asgi_pairs(_sc_asgi_pairs())

        cache_ns.context.set_context.assert_called_once()


class TestSetRuntimeCacheFromHTTP(unittest.TestCase):
    def test_dict_input(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc.set_runtime_cache_from_http_headers(_sc_http_headers())

        cache_ns.context.set_context.assert_called_once()


class TestClearRuntimeCacheContext(unittest.TestCase):
    def test_calls_set_context_with_none_for_both_slots(self) -> None:
        cache_ns = _mock_cache_namespace()
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc.clear_runtime_cache_context()

        cache_ns.context.set_context.assert_called_once_with(
            cache=None,
            async_cache=None,
        )

    def test_falls_back_when_async_cache_kwarg_unsupported(self) -> None:
        def reject_async_cache(**kwargs: object) -> None:
            if "async_cache" in kwargs:
                raise TypeError("unexpected keyword 'async_cache'")

        cache_ns = _mock_cache_namespace(
            set_context_side_effect=reject_async_cache,
        )

        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=(cache_ns.cache_build, cache_ns.context),
        ):
            vrc.clear_runtime_cache_context()

        calls = cache_ns.context.set_context.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertIn("async_cache", calls[0].kwargs)
        self.assertNotIn("async_cache", calls[1].kwargs)
        self.assertIsNone(calls[1].kwargs["cache"])

    def test_noop_when_vercel_cache_unavailable(self) -> None:
        with patch.object(
            vrc,
            "_load_vercel_cache_modules",
            return_value=None,
        ):
            vrc.clear_runtime_cache_context()  # should not raise


if __name__ == "__main__":
    unittest.main(verbosity=2)
