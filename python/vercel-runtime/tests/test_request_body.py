"""Unit tests for WSGI request-body reading (Content-Length + chunked)."""

from __future__ import annotations

import io
import unittest

from vercel_runtime import utils


def _headers(d: dict[str, str]) -> dict[str, str]:
    # http.server uses an email.message.Message; a plain dict with .get is
    # sufficient for the helper, which only calls .get(name, default).
    return d


class TestReadWsgiRequestBody(unittest.TestCase):
    def test_content_length_reads_exact_bytes(self) -> None:
        rfile = io.BytesIO(b"hello world extra")
        body = utils.read_wsgi_request_body(
            rfile, _headers({"Content-Length": "11"})
        )
        self.assertEqual(body, b"hello world")

    def test_no_length_no_chunked_returns_empty(self) -> None:
        rfile = io.BytesIO(b"should not be read")
        body = utils.read_wsgi_request_body(rfile, _headers({}))
        self.assertEqual(body, b"")

    def test_chunked_single_chunk(self) -> None:
        raw = b"5\r\nhello\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        body = utils.read_wsgi_request_body(
            rfile, _headers({"Transfer-Encoding": "chunked"})
        )
        self.assertEqual(body, b"hello")

    def test_chunked_multiple_chunks(self) -> None:
        raw = b"4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        body = utils.read_wsgi_request_body(
            rfile, _headers({"Transfer-Encoding": "chunked"})
        )
        self.assertEqual(body, b"Wikipedia")

    def test_chunked_with_extension_is_ignored(self) -> None:
        raw = b"5;foo=bar\r\nhello\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        body = utils.read_wsgi_request_body(
            rfile, _headers({"Transfer-Encoding": "chunked"})
        )
        self.assertEqual(body, b"hello")

    def test_chunked_case_insensitive_header(self) -> None:
        raw = b"3\r\nabc\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        body = utils.read_wsgi_request_body(
            rfile, _headers({"transfer-encoding": "Chunked"})
        )
        self.assertEqual(body, b"abc")

    def test_chunked_exceeds_max_bytes_raises(self) -> None:
        raw = b"5\r\nhello\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile, _headers({"Transfer-Encoding": "chunked"}), max_bytes=4
            )

    def test_invalid_content_length_raises(self) -> None:
        rfile = io.BytesIO(b"hello")
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile, _headers({"Content-Length": "not-a-number"})
            )

    def test_negative_content_length_raises(self) -> None:
        rfile = io.BytesIO(b"hello")
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile, _headers({"Content-Length": "-1"})
            )

    def test_chunked_truncated_mid_chunk_raises(self) -> None:
        raw = b"5\r\nhel"
        rfile = io.BytesIO(raw)
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile, _headers({"Transfer-Encoding": "chunked"})
            )

    def test_both_content_length_and_chunked_raises(self) -> None:
        raw = b"5\r\nhello\r\n0\r\n\r\n"
        rfile = io.BytesIO(raw)
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile,
                _headers(
                    {
                        "Content-Length": "5",
                        "Transfer-Encoding": "chunked",
                    }
                ),
            )

    def test_chunked_trailer_exceeds_max_raises(self) -> None:
        # 0-size chunk followed by an oversized trailer block.
        trailer_line = b"X-Trailer: " + b"a" * 200 + b"\r\n"
        raw = b"0\r\n" + trailer_line * 100 + b"\r\n"
        rfile = io.BytesIO(raw)
        with self.assertRaises(ValueError):
            utils.read_wsgi_request_body(
                rfile, _headers({"Transfer-Encoding": "chunked"})
            )


if __name__ == "__main__":
    unittest.main()
