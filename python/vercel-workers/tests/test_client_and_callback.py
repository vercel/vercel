from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import vercel.workers.callback as queue_callback
import vercel.workers.client as queue_client
from vercel.workers.exceptions import TokenResolutionError


class _DummyResponse:
    status_code = 200
    reason_phrase = "OK"
    text = ""

    def raise_for_status(self) -> None:
        return None


class _DummyHttpxClient:
    def __init__(self, *args, **kwargs):
        self.response = _DummyResponse()

    def __enter__(self) -> _DummyHttpxClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        return False

    def get(self, url: str, headers: dict[str, str]) -> _DummyResponse:
        return self.response


class TestCallbackAndClientEdgeCases(unittest.TestCase):
    def test_receive_message_by_id_returns_raw_bytes_for_non_json_payload(self) -> None:
        with patch.object(
            queue_callback._client,
            "get_queue_base_url",
            return_value="https://queue.example.com",
        ):
            with patch.object(
                queue_callback._client,
                "get_queue_base_path",
                return_value="/api/v2/messages",
            ):
                with patch.object(
                    queue_callback._client,
                    "get_queue_token",
                    return_value="token",
                ):
                    with patch.object(queue_callback.httpx, "Client", _DummyHttpxClient):
                        with patch.object(
                            queue_callback,
                            "parse_multipart_message",
                            return_value=(
                                {
                                    "Content-Type": "text/plain",
                                    "Vqs-Delivery-Count": "2",
                                    "Vqs-Timestamp": "2025-01-01T00:00:00Z",
                                    "Vqs-Ticket": "ticket-123",
                                },
                                b"not-json",
                            ),
                        ):
                            payload, delivery_count, created_at, ticket = (
                                queue_callback.receive_message_by_id(
                                    "q",
                                    "c",
                                    "m",
                                )
                            )

        self.assertEqual(payload, b"not-json")
        self.assertEqual(delivery_count, 2)
        self.assertEqual(created_at, "2025-01-01T00:00:00Z")
        self.assertEqual(ticket, "ticket-123")

    def test_get_queue_token_error_message_is_string(self) -> None:
        with patch.dict(queue_client.os.environ, {}, clear=True):
            with patch("vercel.oidc.get_vercel_oidc_token", return_value=None):
                with self.assertRaises(TokenResolutionError) as err:
                    queue_client.get_queue_token()

        self.assertIsInstance(err.exception.args[0], str)
        self.assertIn("Failed to resolve queue token", err.exception.args[0])

    def test_get_queue_token_async_error_message_is_string(self) -> None:
        with patch.dict(queue_client.os.environ, {}, clear=True):
            with patch(
                "vercel.oidc.aio.get_vercel_oidc_token",
                new=AsyncMock(return_value=None),
            ):
                with self.assertRaises(TokenResolutionError) as err:
                    asyncio.run(queue_client.get_queue_token_async())

        self.assertIsInstance(err.exception.args[0], str)
        self.assertIn("Failed to resolve queue token", err.exception.args[0])
