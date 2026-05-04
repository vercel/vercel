from __future__ import annotations

import asyncio
import json
import unittest
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

from pydantic import BaseModel

import vercel.workers._queue._transport as queue_transport
import vercel.workers._queue.client as queue_client_impl
import vercel.workers._queue.receive as queue_receive_impl
import vercel.workers._queue.send as queue_service
import vercel.workers.asgi as queue_asgi
import vercel.workers.callback as queue_callback
import vercel.workers.client as queue_client
from vercel.workers._queue.subscribe import (
    call_subscription,
    invoke_subscriptions,
    invoke_subscriptions_async,
    select_subscriptions,
)
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

    def __exit__(self, exc_type, exc_val, exc_tb) -> Literal[False]:
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

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> Literal[False]:
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
            queue_transport,
            "get_queue_base_url",
            return_value="https://queue.example.com",
        ):
            with patch.object(
                queue_transport,
                "get_queue_base_path",
                return_value="/api/v2/messages",
            ):
                with patch.object(
                    queue_receive_impl,
                    "get_queue_token",
                    return_value="token",
                ):
                    with patch.object(queue_receive_impl.httpx, "Client", _FakeHttpxClient):
                        with patch.object(
                            queue_receive_impl,
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

    def test_receive_messages_async_uses_async_client(self) -> None:
        _FakeAsyncHttpxClient.captured_headers.clear()
        _FakeAsyncHttpxClient.captured_urls.clear()

        async def run() -> list[queue_receive_impl.ReceivedMessage]:
            with (
                patch.dict(queue_transport.os.environ, {}, clear=True),
                patch.object(
                    queue_transport,
                    "get_queue_base_url",
                    return_value="https://queue.example.com",
                ),
                patch.object(
                    queue_transport,
                    "get_queue_base_path",
                    return_value="/api/v2/messages",
                ),
                patch.object(
                    queue_receive_impl,
                    "get_queue_token_async",
                    new=AsyncMock(return_value="token"),
                ),
                patch.object(queue_receive_impl.httpx, "AsyncClient", _FakeAsyncHttpxClient),
                patch.object(
                    queue_receive_impl,
                    "parse_multipart_messages",
                    return_value=[
                        (
                            {
                                "Content-Type": "application/json",
                                "Vqs-Message-Id": "m1",
                                "Vqs-Delivery-Count": "2",
                                "Vqs-Timestamp": "2025-01-01T00:00:00Z",
                                "Vqs-Receipt-Handle": "receipt-1",
                            },
                            b'{"ok":true}',
                        ),
                        (
                            {
                                "Content-Type": "text/plain",
                                "Vqs-Message-Id": "m2",
                                "Vqs-Receipt-Handle": "receipt-2",
                            },
                            b"raw",
                        ),
                    ],
                ),
            ):
                return await queue_receive_impl.receive_messages_async(
                    "q",
                    "c",
                    limit=2,
                    visibility_timeout_seconds=45,
                )

        messages = asyncio.run(run())

        self.assertEqual(
            _FakeAsyncHttpxClient.captured_urls[-1],
            "https://queue.example.com/api/v2/messages/q/consumer/c",
        )
        self.assertEqual(
            _FakeAsyncHttpxClient.captured_headers[-1],
            {
                "Authorization": "Bearer token",
                "Accept": "multipart/mixed",
                "Vqs-Visibility-Timeout-Seconds": "45",
                "Vqs-Max-Messages": "2",
            },
        )
        self.assertEqual(messages[0]["payload"], {"ok": True})
        self.assertEqual(messages[0]["deliveryCount"], 2)
        self.assertEqual(messages[1]["payload"], b"raw")

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


class TestSubscriptionInvocation(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    def test_invoke_async_subscription_async(self) -> None:
        calls: list[str] = []

        async def handle_async(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            calls.append("handle_async")
            return queue_client.RetryAfter(5)

        queue_client.subscribe(topic="a")(handle_async)

        async def run() -> int | None:
            return await invoke_subscriptions_async(
                {"hello": "world"},
                {
                    "messageId": "m",
                    "deliveryCount": 1,
                    "createdAt": "now",
                    "topic": "a",
                },
            )

        self.assertEqual(asyncio.run(run()), 5)
        self.assertEqual(calls, ["handle_async"])

    def test_get_asgi_app_awaits_async_subscription(self) -> None:
        calls: list[str] = []
        subscriber_loops: list[asyncio.AbstractEventLoop] = []

        async def handle_async(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            subscriber_loops.append(asyncio.get_running_loop())
            calls.append(message["hello"])

        queue_client.subscribe(topic="a")(handle_async)

        async def run() -> tuple[list[dict], asyncio.AbstractEventLoop]:  # pyright: ignore[reportMissingTypeArgument]
            app = queue_client.get_asgi_app()
            sent: list[dict] = []  # pyright: ignore[reportMissingTypeArgument]
            body = b'{"hello":"world"}'
            received = False
            app_loop = asyncio.get_running_loop()

            async def receive() -> dict:  # pyright: ignore[reportMissingTypeArgument]
                nonlocal received
                if received:
                    return {"type": "http.disconnect"}
                received = True
                return {"type": "http.request", "body": body, "more_body": False}

            async def send(message: dict) -> None:  # pyright: ignore[reportMissingTypeArgument]
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/",
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"ce-type", b"com.vercel.queue.v2beta"),
                        (b"ce-vqsqueuename", b"a"),
                        (b"ce-vqsconsumergroup", b"consumer-a"),
                        (b"ce-vqsmessageid", b"m"),
                        (b"ce-vqsdeliverycount", b"1"),
                        (b"ce-vqscreatedat", b"now"),
                    ],
                },
                receive,
                send,
            )
            return sent, app_loop

        sent, app_loop = asyncio.run(run())

        self.assertEqual(sent[0]["status"], 200)
        self.assertEqual(calls, ["world"])
        self.assertIs(subscriber_loops[0], app_loop)

    def test_get_asgi_app_uses_async_visibility_update(self) -> None:
        def handle(message, metadata):  # pyright: ignore[reportMissingParameterType, reportUnknownParameterType]
            return queue_client.RetryAfter(7)

        queue_client.subscribe(topic="a")(handle)

        async def run() -> list[dict]:  # pyright: ignore[reportMissingTypeArgument]
            app = queue_client.get_asgi_app()
            sent: list[dict] = []  # pyright: ignore[reportMissingTypeArgument]
            received = False

            async def receive() -> dict:  # pyright: ignore[reportMissingTypeArgument]
                nonlocal received
                if received:
                    return {"type": "http.disconnect"}
                received = True
                return {"type": "http.request", "body": b'{"hello":"world"}', "more_body": False}

            async def send(message: dict) -> None:  # pyright: ignore[reportMissingTypeArgument]
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/",
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"ce-type", b"com.vercel.queue.v2beta"),
                        (b"ce-vqsqueuename", b"a"),
                        (b"ce-vqsconsumergroup", b"consumer-a"),
                        (b"ce-vqsmessageid", b"m"),
                        (b"ce-vqsreceipthandle", b"receipt"),
                        (b"ce-vqsdeliverycount", b"1"),
                        (b"ce-vqscreatedat", b"now"),
                    ],
                },
                receive,
                send,
            )
            return sent

        with (
            patch.dict(queue_client.os.environ, {"VQS_VISIBILITY_REFRESH_INTERVAL": "0"}),
            patch.object(
                queue_callback,
                "change_visibility_async",
                new=AsyncMock(),
            ) as change_visibility_async,
            patch.object(
                queue_callback,
                "delete_message_async",
                new=AsyncMock(),
            ) as delete_message_async,
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
        ):
            sent = asyncio.run(run())

        self.assertEqual(sent[0]["status"], 200)
        change_visibility_async.assert_awaited_once_with(
            "a",
            "consumer-a",
            "m",
            "receipt",
            7,
        )
        delete_message_async.assert_not_awaited()
        change_visibility.assert_not_called()
        delete_message.assert_not_called()


class TestAsgiApp(unittest.TestCase):
    def test_build_asgi_app_awaits_async_callable_object(self) -> None:
        calls: list[bytes] = []
        ce_types: list[str] = []

        class AsyncCallableHandler:
            async def __call__(
                self,
                raw_body: bytes,
                environ: dict[str, Any],
            ) -> tuple[int, list[tuple[str, str]], bytes]:
                calls.append(raw_body)
                ce_types.append(environ["HTTP_CE_TYPE"])
                return 202, [("Content-Type", "text/plain")], b"accepted"

        async def run() -> list[dict[str, Any]]:
            app = queue_asgi.build_asgi_app(AsyncCallableHandler())
            sent: list[dict[str, Any]] = []
            received = False

            async def receive() -> dict[str, Any]:
                nonlocal received
                if received:
                    return {"type": "http.disconnect"}
                received = True
                return {"type": "http.request", "body": b"payload", "more_body": False}

            async def send(message: dict[str, Any]) -> None:
                sent.append(message)

            await app(
                {
                    "type": "http",
                    "method": "POST",
                    "path": "/",
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"ce-type", b"com.vercel.queue.v2beta"),
                    ],
                },
                receive,
                send,
            )
            return sent

        sent = asyncio.run(run())

        self.assertEqual(calls, [b"payload"])
        self.assertEqual(ce_types, ["com.vercel.queue.v2beta"])
        self.assertEqual(sent[0]["status"], 202)
        self.assertEqual(sent[1]["body"], b"accepted")


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

        with self.assertRaises(queue_callback.PayloadValidationError):
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
                queue_callback,
                "receive_message_by_id",
                return_value=(
                    {"email": "a@b.com", "age": "not-an-int"},
                    1,
                    "now",
                    "receipt",
                ),
            ),
            patch.object(queue_callback, "delete_message") as delete_message,
            patch.object(queue_callback, "change_visibility") as change_visibility,
        ):
            status, _headers, body = queue_client.handle_queue_callback(raw_body)

        self.assertEqual(status, 500)
        self.assertEqual(json.loads(body), {"error": "payload-validation"})
        delete_message.assert_not_called()
        change_visibility.assert_not_called()


class TestExplicitSubscriptionRegistries(unittest.TestCase):
    def setUp(self) -> None:
        queue_client._subscriptions.clear()

    def tearDown(self) -> None:
        queue_client._subscriptions.clear()

    def test_invoke_subscriptions_uses_explicit_registry(self) -> None:
        global_calls: list[dict[str, Any]] = []
        explicit_calls: list[dict[str, Any]] = []
        subscriptions: list[queue_client._Subscription] = []

        def global_worker(payload: dict[str, Any]) -> None:
            global_calls.append(payload)

        def explicit_worker(payload: dict[str, Any]) -> None:
            explicit_calls.append(payload)

        queue_client.subscribe(topic="orders")(global_worker)
        queue_client._build_subscribe_decorator(subscriptions, topic="orders")(explicit_worker)

        queue_client._invoke_subscriptions(
            {"ok": True},
            {"topic": "orders"},
            subscriptions,
        )

        self.assertEqual(global_calls, [])
        self.assertEqual(explicit_calls, [{"ok": True}])


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
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
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
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
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
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
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
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
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
            patch.object(queue_callback, "change_visibility") as change_visibility,
            patch.object(queue_callback, "delete_message") as delete_message,
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
        **kwargs: object,
    ) -> bytes:
        with (
            patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=False),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            kwargs.setdefault("deployment_id", None)
            queue_client.send("q", payload, json_encoder=json_encoder, **kwargs)

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

    def test_send_accepts_duration_delay_and_retention(self) -> None:
        self._send(
            {"ok": True},
            json_encoder=None,
            delay=600,
            retention=timedelta(hours=6),
        )

        headers = _FakeHttpxClient.captured_headers[-1]
        self.assertEqual(headers["Vqs-Delay-Seconds"], "600")
        self.assertEqual(headers["Vqs-Retention-Seconds"], "21600")

    def test_send_accepts_float_duration(self) -> None:
        self._send({"ok": True}, delay=1.5)

        headers = _FakeHttpxClient.captured_headers[-1]
        self.assertEqual(headers["Vqs-Delay-Seconds"], "1")

    def test_send_rejects_negative_duration(self) -> None:
        with self.assertRaises(ValueError):
            self._send({"ok": True}, delay=-1)

    def test_send_rejects_negative_timedelta(self) -> None:
        with self.assertRaises(ValueError):
            self._send({"ok": True}, delay=timedelta(seconds=-1))

    def test_send_rejects_invalid_duration_type(self) -> None:
        with self.assertRaises(TypeError):
            self._send({"ok": True}, delay=[])


class TestDeploymentPinning(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_headers.clear()
        _FakeHttpxClient.captured_urls.clear()

    def _send(self, **kwargs: Any) -> dict[str, str]:
        with (
            patch.dict(queue_client.os.environ, {"VERCEL_QUEUE_TOKEN": "tok"}, clear=True),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True}, **kwargs)
        return _FakeHttpxClient.captured_headers[-1]

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
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
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
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
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
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
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
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            queue_client.send("q", {"ok": True})

        self.assertNotIn("Vqs-Deployment-Id", _FakeHttpxClient.captured_headers[-1])


class TestQueueClients(unittest.TestCase):
    def setUp(self) -> None:
        _FakeHttpxClient.captured_bodies.clear()
        _FakeHttpxClient.captured_headers.clear()
        _FakeHttpxClient.captured_urls.clear()
        _FakeAsyncHttpxClient.captured_bodies.clear()
        _FakeAsyncHttpxClient.captured_headers.clear()
        _FakeAsyncHttpxClient.captured_urls.clear()

    def test_queue_client_uses_constructor_configuration(self) -> None:
        client = queue_client_impl.QueueClient(
            region="sfo1",
            token="tok",
            deployment_id="dpl_123",
            headers={"X-Client": "client"},
        )

        with (
            patch.dict(queue_service.os.environ, {}, clear=True),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
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
        client = queue_client_impl.QueueClient(region="sfo1", token="tok", deployment_id=None)

        with (
            patch.dict(
                queue_service.os.environ,
                {"VERCEL_QUEUE_BASE_URL": "http://localhost:3000/_svc/_queues"},
                clear=True,
            ),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            client.send("orders", {"ok": True})

        self.assertEqual(
            _FakeHttpxClient.captured_urls[-1],
            "http://localhost:3000/_svc/_queues/api/v3/topic/orders",
        )

    def test_queue_client_send_overrides_constructor_deployment_id(self) -> None:
        client = queue_client_impl.QueueClient(
            token="tok",
            deployment_id="dpl_constructor",
        )

        with (
            patch.dict(queue_service.os.environ, {}, clear=True),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            client.send("orders", {"ok": True}, deployment_id="dpl_call")

        self.assertEqual(_FakeHttpxClient.captured_headers[-1]["Vqs-Deployment-Id"], "dpl_call")

    def test_queue_client_send_accepts_duration_aliases(self) -> None:
        client = queue_client_impl.QueueClient(token="tok", deployment_id=None)

        with (
            patch.dict(queue_service.os.environ, {}, clear=True),
            patch.object(queue_service.httpx, "Client", _FakeHttpxClient),
        ):
            client.send(
                "orders",
                {"ok": True},
                delay=1.5,
                retention=timedelta(hours=1),
            )

        headers = _FakeHttpxClient.captured_headers[-1]
        self.assertEqual(headers["Vqs-Delay-Seconds"], "1")
        self.assertEqual(headers["Vqs-Retention-Seconds"], "3600")

    def test_queue_client_subscribe_registers_worker(self) -> None:
        client = queue_client_impl.QueueClient()
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        self.assertTrue(client.has_subscriptions())
        self.assertFalse(queue_client.has_subscriptions())

        invoke_subscriptions(
            {"ok": True},
            {"topic": "orders"},
            client._subscriptions,
        )

        self.assertEqual(calls, [{"ok": True}])

    def test_async_queue_client_subscribe_registers_worker(self) -> None:
        client = queue_client_impl.AsyncQueueClient()
        calls: list[dict[str, Any]] = []

        @client.subscribe(topic="orders")
        async def handle(payload: dict[str, Any]) -> None:
            calls.append(payload)

        self.assertTrue(client.has_subscriptions())

        async def run() -> None:
            for sub in select_subscriptions(
                "orders",
                client._subscriptions,
            ):
                result = call_subscription(
                    sub,
                    {"ok": True},
                    {"topic": "orders"},
                )
                if asyncio.iscoroutine(result):
                    await result

        asyncio.run(run())

        self.assertEqual(calls, [{"ok": True}])

    def test_async_queue_client_send_uses_async_transport(self) -> None:
        client = queue_client_impl.AsyncQueueClient(
            region="iad1",
            token="tok",
            deployment_id=None,
            headers={"X-Client": "async"},
        )

        async def run() -> None:
            with (
                patch.dict(queue_service.os.environ, {}, clear=True),
                patch.object(queue_service.httpx, "AsyncClient", _FakeAsyncHttpxClient),
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
