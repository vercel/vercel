from __future__ import annotations

import asyncio
import json
import unittest
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from pydantic import BaseModel

import vercel.workers.callback as queue_callback
import vercel.workers.client as queue_client
from vercel.workers.client import WorkerJSONEncoder
from vercel.workers.exceptions import TokenResolutionError


class CreateUserPayload(BaseModel):
    email: str
    age: int


@dataclass
class EmailPayload:
    to: str


class _FakeResponse:
    status_code = 201
    reason_phrase = "Created"
    text = ""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:  # pyright: ignore[reportMissingTypeArgument]
        return {"messageId": "test-id"}


class _FakeHttpxClient:
    captured_bodies: list[bytes] = []

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
        url: str,  # noqa: ARG002
        *,
        content: bytes | None = None,
        headers: dict | None = None,  # noqa: ARG002  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        if content is not None:
            _FakeHttpxClient.captured_bodies.append(content)
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
                                    "Vqs-Receipt-Handle": "receipt-handle-123",
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
        self.assertEqual(ticket, "receipt-handle-123")

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


class TestTypedSubscriptions(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    def test_payload_only_handler(self) -> None:
        calls: list[dict[str, Any]] = []

        def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        queue_client.subscribe(topic="a")(handle)
        queue_client._invoke_subscriptions({"ok": True}, {"topic": "a"})

        self.assertEqual(calls, [{"ok": True}])

    def test_pydantic_payload_annotation(self) -> None:
        calls: list[tuple[CreateUserPayload, str | None]] = []

        def handle(payload: CreateUserPayload, metadata: queue_client.MessageMetadata) -> None:
            calls.append((payload, metadata.get("messageId")))

        queue_client.subscribe(topic="users.create")(handle)
        queue_client._invoke_subscriptions(
            {"email": "a@b.com", "age": "42"},
            {"topic": "users.create", "messageId": "m1"},
        )

        self.assertEqual(calls[0][0], CreateUserPayload(email="a@b.com", age=42))
        self.assertEqual(calls[0][1], "m1")

    def test_dataclass_payload_annotation(self) -> None:
        calls: list[EmailPayload] = []

        def handle(payload: EmailPayload) -> None:
            calls.append(payload)

        queue_client.subscribe(topic="emails")(handle)
        queue_client._invoke_subscriptions({"to": "a@b.com"}, {"topic": "emails"})

        self.assertEqual(calls, [EmailPayload(to="a@b.com")])

    def test_invalid_typed_payload_raises_poison_payload_error(self) -> None:
        def handle(payload: CreateUserPayload) -> None:
            pass

        queue_client.subscribe(topic="users.create")(handle)

        with self.assertRaises(queue_client._PayloadValidationError):
            queue_client._invoke_subscriptions(
                {"email": "a@b.com", "age": "not-an-int"},
                {"topic": "users.create"},
            )

    def test_callback_acknowledges_invalid_typed_payload(self) -> None:
        def handle(payload: CreateUserPayload) -> None:
            pass

        queue_client.subscribe(topic="users.create")(handle)

        raw_body = json.dumps(
            {
                "type": "com.vercel.queue.v1beta",
                "data": {
                    "queueName": "users.create",
                    "consumerGroup": "consumer",
                    "messageId": "m1",
                },
            },
        ).encode()

        with (
            patch.object(
                queue_client.callback,
                "receive_message_by_id",
                return_value=(
                    {"email": "a@b.com", "age": "not-an-int"},
                    1,
                    "now",
                    "receipt",
                ),
            ),
            patch.object(queue_client.callback, "delete_message") as delete_message,
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
        ):
            status, _headers, body = queue_client.handle_queue_callback(raw_body)

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"ok": True, "acknowledged": True})
        delete_message.assert_called_once_with(
            "users.create",
            "consumer",
            "m1",
            "receipt",
        )
        change_visibility.assert_not_called()


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
