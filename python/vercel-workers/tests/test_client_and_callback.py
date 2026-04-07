from __future__ import annotations

import asyncio
import json
import unittest
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import vercel.workers.callback as queue_callback
import vercel.workers.client as queue_client
from vercel.workers.client import WorkerJSONEncoder
from vercel.workers.exceptions import TokenResolutionError


class _FakeResponse:
    status_code = 200
    reason_phrase = "OK"
    text = ""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:  # pyright: ignore[reportMissingTypeArgument]
        return {"messageId": "test-id"}


class _FakeHttpxClient:
    captured_bodies: list[bytes] = []
    captured_urls: list[str] = []
    captured_headers: list[dict] = []  # pyright: ignore[reportMissingTypeArgument]

    def __init__(self, *args, **kwargs):
        self.response = _FakeResponse()

    def __enter__(self) -> _FakeHttpxClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        return False

    def get(self, url: str, headers: dict[str, str]) -> _FakeResponse:
        return self.response

    def post(
        self,
        url: str,
        *,
        content: bytes,
        headers: dict,  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        _FakeHttpxClient.captured_bodies.append(content)
        _FakeHttpxClient.captured_urls.append(url)
        _FakeHttpxClient.captured_headers.append(headers)
        return self.response


class _FakeAsyncHttpxClient:
    def __init__(self, *args, **kwargs):
        self.response = _FakeResponse()

    async def __aenter__(self) -> _FakeAsyncHttpxClient:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> bool:
        return False

    async def post(
        self,
        url: str,
        *,
        content: bytes,
        headers: dict,  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        _FakeHttpxClient.captured_bodies.append(content)
        _FakeHttpxClient.captured_urls.append(url)
        _FakeHttpxClient.captured_headers.append(headers)
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
                    with patch.object(queue_callback.httpx, "Client", _FakeHttpxClient):
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


class TestParseCloudEvent(unittest.TestCase):
    def test_parse_cloudevent_accepts_v2beta(self) -> None:
        queue_name, consumer_group, message_id = queue_callback.parse_cloudevent(
            json.dumps(
                {
                    "type": "com.vercel.queue.v2beta",
                    "data": {
                        "queueName": "orders",
                        "consumerGroup": "worker-a",
                        "messageId": "msg-2",
                    },
                }
            ).encode("utf-8")
        )

        self.assertEqual(queue_name, "orders")
        self.assertEqual(consumer_group, "worker-a")
        self.assertEqual(message_id, "msg-2")


class TestWorkerJSONEncoder(unittest.TestCase):
    def test_uuid_serialized_as_string(self) -> None:
        uid = uuid4()
        result = json.loads(json.dumps({"id": uid}, cls=WorkerJSONEncoder))
        self.assertEqual(result["id"], str(uid))

    def test_datetime_serialized_as_isoformat(self) -> None:
        dt = datetime.now()
        result = json.loads(json.dumps({"ts": dt}, cls=WorkerJSONEncoder))
        self.assertEqual(result["ts"], dt.isoformat())

    def test_date_serialized_as_isoformat(self) -> None:
        d = date.today()
        result = json.loads(json.dumps({"d": d}, cls=WorkerJSONEncoder))
        self.assertEqual(result["d"], d.isoformat())

    def test_decimal_serialized_as_float(self) -> None:
        dec = Decimal("3.14")
        result = json.loads(json.dumps({"val": dec}, cls=WorkerJSONEncoder))
        self.assertAlmostEqual(result["val"], 3.14)

    def test_unsupported_type_raises(self) -> None:
        with self.assertRaises(TypeError):
            json.dumps({"x": object()}, cls=WorkerJSONEncoder)


class TestSendWithJSONEncoder(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_urls.clear()
        _FakeHttpxClient.captured_headers.clear()

    def _send(
        self,
        payload: dict,  # pyright: ignore[reportMissingTypeArgument]
        *,
        json_encoder: type[json.JSONEncoder] | None = None,
    ) -> bytes:
        with (
            patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=False),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", payload, json_encoder=json_encoder)

        return _FakeHttpxClient.captured_bodies[-1]

    def test_send_serializes_uuid_by_default(self) -> None:
        uid = uuid4()
        body = self._send({"id": uid})
        result = json.loads(body)
        self.assertEqual(result["id"], str(uid))

    def test_send_serializes_datetime_by_default(self) -> None:
        dt = datetime.now()
        body = self._send({"ts": dt})
        result = json.loads(body)
        self.assertEqual(result["ts"], dt.isoformat())

    def test_send_serializes_decimal_by_default(self) -> None:
        body = self._send({"price": Decimal("9.99")})
        result = json.loads(body)
        self.assertAlmostEqual(result["price"], 9.99)

    def test_send_with_custom_encoder(self) -> None:
        class _CustomEncoder(WorkerJSONEncoder):
            def default(self, o: object) -> object:
                if isinstance(o, set):
                    return sorted(o)
                return super().default(o)

        body = self._send({"tags": {3, 1, 2}}, json_encoder=_CustomEncoder)
        result = json.loads(body)
        self.assertEqual(result["tags"], [1, 2, 3])

    def test_send_uses_v3_topic_path_by_default(self) -> None:
        self._send({"ok": True})
        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "https://vercel-queue.com/api/v3/topic/q",
        )

    def test_send_respects_explicit_base_path_override(self) -> None:
        with (
            patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=False),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True}, base_path="/api/v2/messages")

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "https://vercel-queue.com/api/v2/messages",
        )


class TestPublishBasePath(unittest.TestCase):
    def test_receive_base_path_remains_v2_by_default(self) -> None:
        with patch.dict(queue_client.os.environ, {}, clear=True):
            self.assertEqual(queue_client.get_queue_base_path(), "/api/v2/messages")

    def test_publish_base_path_defaults_to_v3_topic_route(self) -> None:
        with patch.dict(queue_client.os.environ, {}, clear=True):
            self.assertEqual(
                queue_client.get_queue_publish_base_path("orders"),
                "/api/v3/topic/orders",
            )

    def test_publish_base_path_uses_publish_override(self) -> None:
        with patch.dict(
            queue_client.os.environ,
            {"VERCEL_QUEUE_PUBLISH_BASE_PATH": "/custom/publish"},
            clear=True,
        ):
            self.assertEqual(
                queue_client.get_queue_publish_base_path("orders"),
                "/custom/publish",
            )


class TestAsyncSend(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_urls.clear()
        _FakeHttpxClient.captured_headers.clear()

    def test_send_async_uses_v3_topic_path_by_default(self) -> None:
        async def _run() -> None:
            with (
                patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=False),
                patch.object(queue_client.httpx, "AsyncClient", _FakeAsyncHttpxClient),
            ):
                await queue_client.send_async("orders", {"ok": True})

        asyncio.run(_run())

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "https://vercel-queue.com/api/v3/topic/orders",
        )
