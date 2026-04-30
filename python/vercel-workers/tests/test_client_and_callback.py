from __future__ import annotations

import asyncio
import json
import unittest
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from pydantic import BaseModel, ValidationError

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
    captured_headers: list[dict[str, str]] = []
    captured_urls: list[str] = []

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
        content: bytes | None = None,
        headers: dict | None = None,  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        _FakeHttpxClient.captured_urls.append(url)
        _FakeHttpxClient.captured_headers.append(dict(headers or {}))
        if content is not None:
            _FakeHttpxClient.captured_bodies.append(content)
        return self.response


class _FakeAsyncHttpxClient:
    captured_bodies: list[bytes] = []
    captured_headers: list[dict[str, str]] = []
    captured_urls: list[str] = []

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
        content: bytes | None = None,
        headers: dict | None = None,  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        _FakeAsyncHttpxClient.captured_urls.append(url)
        _FakeAsyncHttpxClient.captured_headers.append(dict(headers or {}))
        if content is not None:
            _FakeAsyncHttpxClient.captured_bodies.append(content)
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

    def test_callback_does_not_acknowledge_invalid_typed_payload(self) -> None:
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

        self.assertEqual(status, 500)
        self.assertEqual(json.loads(body), {"error": "payload-validation"})
        delete_message.assert_not_called()
        change_visibility.assert_not_called()


class TestWorkerDirectives(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    def _raw_callback(self) -> bytes:
        return b'{"ok":true}'

    def _environ(self) -> dict[str, str]:
        return {
            "CONTENT_TYPE": "application/json",
            "HTTP_CE_TYPE": "com.vercel.queue.v2beta",
            "HTTP_CE_VQSQUEUENAME": "q",
            "HTTP_CE_VQSCONSUMERGROUP": "c",
            "HTTP_CE_VQSMESSAGEID": "m",
            "HTTP_CE_VQSRECEIPTHANDLE": "receipt",
            "HTTP_CE_VQSDELIVERYCOUNT": "1",
            "HTTP_CE_VQSCREATEDAT": "now",
        }

    def test_retry_after_return_delays_message(self) -> None:
        def worker(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            return queue_client.RetryAfter(timedelta(minutes=2))

        queue_client.subscribe(topic="q")(worker)

        with (
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            status, _headers, _body = queue_client.handle_queue_callback(
                self._raw_callback(),
                self._environ(),
            )

        self.assertEqual(status, 200)
        change_visibility.assert_called_once_with("q", "c", "m", "receipt", 120)
        delete_message.assert_not_called()

    def test_retry_after_raise_delays_message(self) -> None:
        def worker(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            raise queue_client.RetryAfter(30)

        queue_client.subscribe(topic="q")(worker)

        with (
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            status, _headers, _body = queue_client.handle_queue_callback(
                self._raw_callback(),
                self._environ(),
            )

        self.assertEqual(status, 200)
        change_visibility.assert_called_once_with("q", "c", "m", "receipt", 30)
        delete_message.assert_not_called()

    def test_dict_return_is_not_a_retry_directive(self) -> None:
        def worker(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            return {"afterSeconds": 30.0}

        queue_client.subscribe(topic="q")(worker)

        with (
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            status, _headers, _body = queue_client.handle_queue_callback(
                self._raw_callback(),
                self._environ(),
            )

        self.assertEqual(status, 200)
        delete_message.assert_called_once_with("q", "c", "m", "receipt")
        change_visibility.assert_not_called()

    def test_ack_return_deletes_message(self) -> None:
        def worker(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            return queue_client.Ack("permanent")

        queue_client.subscribe(topic="q")(worker)

        with (
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            status, _headers, _body = queue_client.handle_queue_callback(
                self._raw_callback(),
                self._environ(),
            )

        self.assertEqual(status, 200)
        delete_message.assert_called_once_with("q", "c", "m", "receipt")
        change_visibility.assert_not_called()

    def test_ack_raise_deletes_message(self) -> None:
        def worker(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            raise queue_client.Ack("permanent")

        queue_client.subscribe(topic="q")(worker)

        with (
            patch.object(queue_client.callback, "change_visibility") as change_visibility,
            patch.object(queue_client.callback, "delete_message") as delete_message,
        ):
            status, _headers, _body = queue_client.handle_queue_callback(
                self._raw_callback(),
                self._environ(),
            )

        self.assertEqual(status, 200)
        delete_message.assert_called_once_with("q", "c", "m", "receipt")
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
        _FakeHttpxClient.captured_headers.clear()
        _FakeHttpxClient.captured_urls.clear()

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
            queue_client.send("q", payload, deployment_id=None, json_encoder=json_encoder)

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


class TestDeploymentPinning(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_headers.clear()
        _FakeHttpxClient.captured_urls.clear()

    def test_send_auto_pins_to_env_deployment_id(self) -> None:
        with (
            patch.dict(
                queue_client.os.environ,
                {
                    "VERCEL_QUEUE_TOKEN": "tok",
                    "VERCEL_DEPLOYMENT_ID": "dpl_env",
                },
                clear=True,
            ),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True})

        self.assertEqual(_FakeHttpxClient.captured_headers[-1]["Vqs-Deployment-Id"], "dpl_env")

    def test_send_none_explicitly_unpins_even_with_env_deployment_id(self) -> None:
        with (
            patch.dict(
                queue_client.os.environ,
                {
                    "VERCEL_QUEUE_TOKEN": "tok",
                    "VERCEL_DEPLOYMENT_ID": "dpl_env",
                },
                clear=True,
            ),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True}, deployment_id=None)

        self.assertNotIn("Vqs-Deployment-Id", _FakeHttpxClient.captured_headers[-1])

    def test_send_explicit_deployment_id_overrides_env(self) -> None:
        with (
            patch.dict(
                queue_client.os.environ,
                {
                    "VERCEL_QUEUE_TOKEN": "tok",
                    "VERCEL_DEPLOYMENT_ID": "dpl_env",
                },
                clear=True,
            ),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True}, deployment_id="dpl_explicit")

        self.assertEqual(
            _FakeHttpxClient.captured_headers[-1]["Vqs-Deployment-Id"],
            "dpl_explicit",
        )

    def test_send_auto_requires_deployment_id_outside_dev(self) -> None:
        with patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=True):
            with self.assertRaises(RuntimeError) as err:
                queue_client.send("q", {"ok": True})

        self.assertIn("No deployment ID available", str(err.exception))

    def test_send_dev_token_omits_deployment_id(self) -> None:
        with (
            patch.dict(
                queue_client.os.environ,
                {
                    "VERCEL_QUEUE_TOKEN": "vc-dev-token",
                    "VERCEL_DEPLOYMENT_ID": "dpl_env",
                },
                clear=True,
            ),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True})

        self.assertNotIn("Vqs-Deployment-Id", _FakeHttpxClient.captured_headers[-1])


class TestQueueClients(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_headers.clear()
        _FakeHttpxClient.captured_urls.clear()
        _FakeAsyncHttpxClient.captured_bodies.clear()
        _FakeAsyncHttpxClient.captured_headers.clear()
        _FakeAsyncHttpxClient.captured_urls.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    def test_queue_client_uses_constructor_configuration(self) -> None:
        client = queue_client.QueueClient(
            region="sfo1",
            token="tok",
            deployment_id="dpl_123",
            headers={"X-Client": "client"},
        )

        with (
            patch.dict(queue_client.os.environ, {}, clear=True),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            client.send(
                "orders",
                {"ok": True},
                idempotency_key="key-1",
                headers={"X-Call": "call"},
            )

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "https://sfo1.vercel-queue.com/api/v3/topic/orders",
        )
        self.assertEqual(json.loads(_FakeHttpxClient.captured_bodies[-1]), {"ok": True})
        headers = _FakeHttpxClient.captured_headers[-1]
        self.assertEqual(headers["Authorization"], "Bearer tok")
        self.assertEqual(headers["Vqs-Deployment-Id"], "dpl_123")
        self.assertEqual(headers["Vqs-Idempotency-Key"], "key-1")
        self.assertEqual(headers["X-Client"], "client")
        self.assertEqual(headers["X-Call"], "call")

    def test_queue_client_preserves_dev_proxy_base_url(self) -> None:
        client = queue_client.QueueClient(region="sfo1", token="tok", deployment_id=None)

        with (
            patch.dict(
                queue_client.os.environ,
                {"VERCEL_QUEUE_BASE_URL": "http://localhost:3000/_svc/_queues"},
                clear=True,
            ),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            client.send("orders", {"ok": True})

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "http://localhost:3000/_svc/_queues/api/v3/topic/orders",
        )

    def test_async_queue_client_send_uses_async_transport(self) -> None:
        client = queue_client.AsyncQueueClient(
            region="iad1",
            token="tok",
            deployment_id=None,
            headers={"X-Client": "async"},
        )

        async def run() -> None:
            with (
                patch.dict(queue_client.os.environ, {}, clear=True),
                patch.object(queue_client.httpx, "AsyncClient", _FakeAsyncHttpxClient),
            ):
                await client.send("orders", {"ok": True}, delay_seconds=5)

        asyncio.run(run())

        self.assertEqual(
            _FakeAsyncHttpxClient.captured_urls[-1],
            "https://iad1.vercel-queue.com/api/v3/topic/orders",
        )
        self.assertEqual(json.loads(_FakeAsyncHttpxClient.captured_bodies[-1]), {"ok": True})
        headers = _FakeAsyncHttpxClient.captured_headers[-1]
        self.assertEqual(headers["Authorization"], "Bearer tok")
        self.assertEqual(headers["Vqs-Delay-Seconds"], "5")
        self.assertEqual(headers["X-Client"], "async")

    def test_queue_client_subscribe_registers_worker(self) -> None:
        client = queue_client.QueueClient(region="sfo1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        self.assertFalse(queue_client.has_subscriptions())
        self.assertTrue(client.has_subscriptions())
        self.assertEqual(
            client.get_vercel_queue_subscriptions(),
            [{"topic": "orders", "handler": f"{__name__}:{handle.__qualname__}"}],
        )
        self.assertEqual(queue_client.get_vercel_queue_subscriptions(), [])

        with patch.dict(
            queue_client.os.environ,
            {"VERCEL_WORKERS_IN_PROCESS": "1"},
            clear=False,
        ):
            client.send("orders", {"ok": True})

        self.assertEqual(calls, [{"ok": True}])

    def test_queue_client_callback_uses_client_registry(self) -> None:
        client = queue_client.QueueClient(region="sfo1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        raw_body = b'{"ok":true}'
        environ = {
            "CONTENT_TYPE": "application/json",
            "HTTP_CE_TYPE": "com.vercel.queue.v2beta",
            "HTTP_CE_VQSQUEUENAME": "orders",
            "HTTP_CE_VQSCONSUMERGROUP": "consumer",
            "HTTP_CE_VQSMESSAGEID": "m",
            "HTTP_CE_VQSRECEIPTHANDLE": "receipt",
            "HTTP_CE_VQSDELIVERYCOUNT": "1",
            "HTTP_CE_VQSCREATEDAT": "now",
        }

        with patch.object(queue_client.callback, "delete_message") as delete_message:
            status, _headers, body = client.handle_queue_callback(raw_body, environ)

        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"ok": True})
        self.assertEqual(calls, [{"ok": True}])
        delete_message.assert_called_once_with("orders", "consumer", "m", "receipt")

    def test_async_queue_client_subscribe_registers_worker(self) -> None:
        client = queue_client.AsyncQueueClient(region="iad1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        async def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        self.assertFalse(queue_client.has_subscriptions())
        self.assertTrue(client.has_subscriptions())
        self.assertEqual(
            client.get_vercel_queue_subscriptions(),
            [{"topic": "orders", "handler": f"{__name__}:{handle.__qualname__}"}],
        )

    def test_async_queue_client_send_uses_client_registry_in_process(self) -> None:
        client = queue_client.AsyncQueueClient(region="iad1")
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        async def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        async def run() -> None:
            with patch.dict(
                queue_client.os.environ,
                {"VERCEL_WORKERS_IN_PROCESS": "1"},
                clear=False,
            ):
                result = await client.send("orders", {"ok": True})

            self.assertIsNotNone(result["messageId"])

        asyncio.run(run())

        self.assertEqual(calls, [{"ok": True}])

    def test_queue_client_topic_send_validates_and_serializes_payload_type(self) -> None:
        client = queue_client.QueueClient(region="sfo1", token="tok", deployment_id=None)
        users = client.topic("users.create", payload_type=CreateUserPayload)

        with (
            patch.dict(queue_client.os.environ, {}, clear=True),
            patch.object(queue_client.httpx, "Client", _FakeHttpxClient),
        ):
            users.send(CreateUserPayload(email="a@b.com", age=42))

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "https://sfo1.vercel-queue.com/api/v3/topic/users.create",
        )
        self.assertEqual(
            json.loads(_FakeHttpxClient.captured_bodies[-1]),
            {"email": "a@b.com", "age": 42},
        )

    def test_queue_client_topic_send_rejects_invalid_payload_type(self) -> None:
        client = queue_client.QueueClient(region="sfo1", token="tok")
        users = client.topic("users.create", payload_type=CreateUserPayload)

        with self.assertRaises(ValidationError):
            users.send({"email": "a@b.com", "age": "not-an-int"})

    def test_queue_client_topic_subscribe_uses_payload_type(self) -> None:
        client = queue_client.QueueClient(region="sfo1")
        users = client.topic("users.create", payload_type=CreateUserPayload)
        calls: list[CreateUserPayload] = []

        @users.subscribe
        def handle(payload):  # pyright: ignore[reportMissingParameterType]
            calls.append(payload)

        with patch.dict(
            queue_client.os.environ,
            {"VERCEL_WORKERS_IN_PROCESS": "1"},
            clear=False,
        ):
            users.send({"email": "a@b.com", "age": "42"})

        self.assertEqual(calls, [CreateUserPayload(email="a@b.com", age=42)])

    def test_queue_client_topic_subscribe_rejects_mismatched_handler_annotation(self) -> None:
        client = queue_client.QueueClient(region="sfo1")
        users = client.topic("users.create", payload_type=CreateUserPayload)

        with self.assertRaises(TypeError):

            @users.subscribe
            def handle(payload: EmailPayload) -> None:
                pass

    def test_async_queue_client_topic_send_uses_async_client(self) -> None:
        client = queue_client.AsyncQueueClient(
            region="iad1",
            token="tok",
            deployment_id=None,
        )
        users = client.topic("users.create", payload_type=CreateUserPayload)

        async def run() -> None:
            with (
                patch.dict(queue_client.os.environ, {}, clear=True),
                patch.object(queue_client.httpx, "AsyncClient", _FakeAsyncHttpxClient),
            ):
                await users.send(CreateUserPayload(email="a@b.com", age=42))

        asyncio.run(run())

        self.assertEqual(
            _FakeAsyncHttpxClient.captured_urls[-1],
            "https://iad1.vercel-queue.com/api/v3/topic/users.create",
        )
        self.assertEqual(
            json.loads(_FakeAsyncHttpxClient.captured_bodies[-1]),
            {"email": "a@b.com", "age": 42},
        )
