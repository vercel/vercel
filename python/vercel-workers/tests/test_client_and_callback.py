from __future__ import annotations

import asyncio
import json
import unittest
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import vercel.workers._internal.queue_api as queue_api
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
        content: bytes,
        headers: dict,  # noqa: ARG002  # pyright: ignore[reportMissingTypeArgument]
    ) -> _FakeResponse:
        _FakeHttpxClient.captured_bodies.append(content)
        return self.response


def _v1beta_callback_body(
    *,
    queue_name: str = "q",
    consumer_group: str = "c",
    message_id: str = "m",
) -> bytes:
    return json.dumps(
        {
            "type": "com.vercel.queue.v1beta",
            "specversion": "1.0",
            "source": "vc-dev",
            "id": f"evt-{message_id}",
            "datacontenttype": "application/json",
            "data": {
                "queueName": queue_name,
                "consumerGroup": consumer_group,
                "messageId": message_id,
            },
        }
    ).encode("utf-8")


class TestCallbackAndClientEdgeCases(unittest.TestCase):
    def test_deserialize_non_json_payload_returns_raw_bytes(self) -> None:
        result = queue_callback._deserialize_payload(b"not-json", "text/plain")
        self.assertEqual(result, b"not-json")

    def test_deserialize_json_payload_returns_parsed(self) -> None:
        result = queue_callback._deserialize_payload(b'{"key": "value"}', "application/json")
        self.assertEqual(result, {"key": "value"})

    def test_get_queue_token_error_message_is_string(self) -> None:
        with patch.dict(queue_api.os.environ, {}, clear=True):
            with patch.object(queue_api, "get_vercel_oidc_token", return_value=None):
                with self.assertRaises(TokenResolutionError) as err:
                    queue_client.get_queue_token()

        self.assertIsInstance(err.exception.args[0], str)
        self.assertIn("Failed to resolve queue token", err.exception.args[0])

    def test_get_queue_token_async_error_message_is_string(self) -> None:
        with patch.dict(queue_api.os.environ, {}, clear=True):
            with patch.object(
                queue_api,
                "get_vercel_oidc_token_async",
                new=AsyncMock(return_value=None),
            ):
                with self.assertRaises(TokenResolutionError) as err:
                    asyncio.run(queue_client.get_queue_token_async())

        self.assertIsInstance(err.exception.args[0], str)
        self.assertIn("Failed to resolve queue token", err.exception.args[0])

    def test_parse_callback_supports_v1beta_structured_body(self) -> None:
        parsed = queue_callback.parse_callback(
            _v1beta_callback_body(),
            {"content-type": "application/cloudevents+json"},
        )

        self.assertEqual(
            parsed,
            {
                "queueName": "q",
                "consumerGroup": "c",
                "messageId": "m",
            },
        )

    def test_handle_callback_supports_v1beta_structured_body(self) -> None:
        class _FakeClient:
            region = "iad1"

            def __init__(self) -> None:
                self.received: list[tuple[str, str, str, int | None]] = []
                self.acknowledged: list[tuple[str, str, str]] = []

            def receive_by_id(
                self,
                queue_name: str,
                consumer_group: str,
                message_id: str,
                *,
                visibility_timeout_seconds: int | None = None,
            ) -> dict[str, object]:
                self.received.append(
                    (queue_name, consumer_group, message_id, visibility_timeout_seconds)
                )
                return {
                    "messageId": message_id,
                    "deliveryCount": 1,
                    "createdAt": "2025-01-01T00:00:00Z",
                    "expiresAt": None,
                    "contentType": "application/json",
                    "receiptHandle": "receipt-123",
                    "payload": {"hello": "world"},
                }

            def acknowledge(
                self,
                queue_name: str,
                consumer_group: str,
                receipt_handle: str,
            ) -> None:
                self.acknowledged.append((queue_name, consumer_group, receipt_handle))

            def change_visibility(
                self,
                queue_name: str,
                consumer_group: str,
                receipt_handle: str,
                visibility_timeout_seconds: int,
            ) -> None:
                raise AssertionError("change_visibility should not be called")

        client = _FakeClient()
        handled: list[tuple[object, dict[str, object]]] = []

        def _handler(payload: object, metadata: dict[str, object]) -> None:
            handled.append((payload, metadata))

        status_code, response_headers, body = queue_callback.handle_callback(
            client,  # type: ignore[arg-type]
            _v1beta_callback_body(),
            {"content-type": "application/cloudevents+json"},
            _handler,
            refresh_interval_seconds=0,
        )

        self.assertEqual(status_code, 200)
        self.assertIn(("Content-Type", "application/json"), response_headers)
        self.assertEqual(
            client.received,
            [("q", "c", "m", 30)],
        )
        self.assertEqual(client.acknowledged, [("q", "c", "receipt-123")])
        self.assertEqual(
            handled,
            [
                (
                    {"hello": "world"},
                    {
                        "messageId": "m",
                        "deliveryCount": 1,
                        "createdAt": "2025-01-01T00:00:00Z",
                        "expiresAt": None,
                        "topicName": "q",
                        "consumerGroup": "c",
                        "region": "iad1",
                    },
                )
            ],
        )
        self.assertTrue(json.loads(body.decode("utf-8"))["ok"])


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
            patch.dict(
                queue_api.os.environ,
                {"VERCEL_QUEUE_TOKEN": "tok"},
                clear=False,
            ),
            patch.object(queue_api.httpx, "Client", _FakeHttpxClient),
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
