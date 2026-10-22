package main

import (
	"bytes"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func uploadPayload() []byte {
	return bytes.Repeat([]byte{0, 255, 'u', '\r', '\n', 'x', 'y', 'z'}, 8192)
}

func uploadFraming(chunked bool, length int) string {
	if chunked {
		return "Transfer-Encoding: chunked\r\n"
	}
	return fmt.Sprintf("Content-Length: %d\r\n", length)
}

func writeUploadPart(t *testing.T, writer io.Writer, part []byte, chunked bool) {
	t.Helper()
	if chunked {
		scenarioWrite(t, writer, fmt.Sprintf("%x;test=fragment\r\n", len(part)))
	}
	scenarioWrite(t, writer, string(part))
	if chunked {
		scenarioWrite(t, writer, "\r\n")
	}
}

func finishUpload(t *testing.T, writer io.Writer, chunked bool) {
	t.Helper()
	if chunked {
		scenarioWrite(t, writer, "0\r\n\r\n")
	}
}

func assertUploadInFlight(t *testing.T, invocation string) {
	t.Helper()
	ipcBarrier(t)
	if ids := completions(invocation); len(ids) != 0 {
		t.Fatalf("unfinished upload/response completed invocation: %v", ids)
	}
}

// Response trailers must survive an uploaded request without causing a replay.
// Repeat both framing forms on one public connection to exercise body reuse.
func TestHTTPLargeUploadsWithResponseTrailers(t *testing.T) {
	for _, chunked := range []bool{false, true} {
		t.Run(fmt.Sprintf("chunked=%t", chunked), func(t *testing.T) {
			payload := uploadPayload()
			var calls atomic.Int32
			address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, err := io.ReadAll(r.Body)
				if err != nil || !bytes.Equal(body, payload) {
					t.Errorf("upload: bytes=%d error=%v", len(body), err)
				}
				if r.Method != "POST" || r.Host != "uploads.example" || r.Header.Get("X-Vercel-Internal-Secret") != "" {
					t.Errorf("upload metadata: method=%s host=%q headers=%v", r.Method, r.Host, r.Header)
				}
				w.Header().Set("Trailer", "X-Result")
				w.Header().Set("X-Path", r.URL.Path)
				w.Write(payload)
				w.(http.Flusher).Flush()
				w.Header().Set("X-Result", "done")
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			for id := 1; id <= 3; id++ {
				path := fmt.Sprintf("/upload-%d", id)
				scenarioWrite(t, c, fmt.Sprintf("POST %s HTTP/1.1\r\nHost: incoming.example\r\nX-Forwarded-Host: uploads.example\r\nX-Vercel-Internal-Secret: private\r\n%sX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", path, uploadFraming(chunked, len(payload)), inv, id))
				writeUploadPart(t, c, payload, chunked)
				finishUpload(t, c, chunked)
				response, body := scenarioResponse(t, reader, "POST")
				if response.StatusCode != 200 || response.Close || !bytes.Equal(body, payload) || response.Trailer.Get("X-Result") != "done" || response.Header.Get("X-Path") != path {
					t.Fatalf("upload %d: status=%d bytes=%d close=%v headers=%v trailers=%v", id, response.StatusCode, len(body), response.Close, response.Header, response.Trailer)
				}
			}
			assertCompletionIDs(t, inv, 1, 2, 3)
			if calls.Load() != 3 {
				t.Fatalf("upload application calls=%d, want 3", calls.Load())
			}
		})
	}
}

func TestHTTPFragmentedUploadFollowedByPipelinedRequest(t *testing.T) {
	for _, chunked := range []bool{false, true} {
		t.Run(fmt.Sprintf("chunked=%t", chunked), func(t *testing.T) {
			payload := uploadPayload()
			prefixRead := make(chan struct{})
			var prefixOnce sync.Once
			var calls atomic.Int32
			address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var body []byte
				if r.URL.Path == "/upload" {
					prefix := make([]byte, 1024)
					if _, err := io.ReadFull(r.Body, prefix); err != nil || !bytes.Equal(prefix, payload[:len(prefix)]) {
						t.Errorf("upload prefix: bytes=%d error=%v", len(prefix), err)
						return
					}
					prefixOnce.Do(func() { close(prefixRead) })
					rest, err := io.ReadAll(r.Body)
					body = append(prefix, rest...)
					if err != nil || !bytes.Equal(body, payload) {
						t.Errorf("fragmented upload: bytes=%d error=%v", len(body), err)
					}
				} else if r.URL.Path != "/next" || r.Method != "GET" {
					t.Errorf("unexpected follow-up: %s %s", r.Method, r.URL.Path)
				}
				w.Header().Set("X-Path", r.URL.Path)
				io.WriteString(w, strconv.Itoa(len(body)))
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("POST /upload HTTP/1.1\r\nHost: test\r\n%sX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", uploadFraming(chunked, len(payload)), inv))
			writeUploadPart(t, c, payload[:1024], chunked)
			select {
			case <-prefixRead:
			case <-time.After(5 * time.Second):
				t.Fatal("application did not receive the partial upload")
			}
			assertUploadInFlight(t, inv)
			for offset := 1024; offset < len(payload); offset += 777 {
				writeUploadPart(t, c, payload[offset:min(offset+777, len(payload))], chunked)
			}
			finishUpload(t, c, chunked)
			scenarioWrite(t, c, fmt.Sprintf("GET /next HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv))
			for i, want := range []string{"65536", "0"} {
				response, body := scenarioResponse(t, reader, "POST")
				if response.StatusCode != 200 || response.Close || string(body) != want || response.Header.Get("X-Path") != []string{"/upload", "/next"}[i] {
					t.Fatalf("response %d: status=%d body=%q close=%v headers=%v", i, response.StatusCode, body, response.Close, response.Header)
				}
			}
			assertCompletionIDs(t, inv, 1, 2)
			if calls.Load() != 2 {
				t.Fatalf("fragmented/pipelined application calls=%d, want 2", calls.Load())
			}
		})
	}
}

func TestHTTPInformationalResponsesDuringUpload(t *testing.T) {
	payload := uploadPayload()
	var calls atomic.Int32
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if err := http.NewResponseController(w).EnableFullDuplex(); err != nil {
			t.Error(err)
			return
		}
		w.Header().Set("Link", "</upload.js>; rel=preload")
		w.WriteHeader(103)
		w.WriteHeader(102)
		body, err := io.ReadAll(r.Body)
		if err != nil || !bytes.Equal(body, payload) {
			t.Errorf("upload after hints: bytes=%d error=%v", len(body), err)
		}
		w.Header().Del("Link")
		io.WriteString(w, strconv.Itoa(len(body)))
	}))
	defer stop()
	c, reader := scenarioConn(t, address)
	defer c.Close()
	inv := t.Name()
	scenarioWrite(t, c, fmt.Sprintf("POST /upload HTTP/1.1\r\nHost: test\r\nContent-Length: %d\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", len(payload), inv))
	writeUploadPart(t, c, payload[:1], false)
	for _, status := range []int{103, 102} {
		response, body := scenarioResponse(t, reader, "POST")
		if response.StatusCode != status || len(body) != 0 || response.Header.Get("Link") != "</upload.js>; rel=preload" {
			t.Fatalf("upload hint: status=%d body=%q headers=%v", response.StatusCode, body, response.Header)
		}
	}
	assertUploadInFlight(t, inv)
	writeUploadPart(t, c, payload[1:], false)
	response, body := scenarioResponse(t, reader, "POST")
	if response.StatusCode != 200 || string(body) != "65536" || response.Header.Get("Link") != "" {
		t.Fatalf("final upload response: status=%d body=%q headers=%v", response.StatusCode, body, response.Header)
	}
	assertCompletionIDs(t, inv, 1)
	if calls.Load() != 1 {
		t.Fatalf("informational upload application calls=%d, want 1", calls.Load())
	}
}

// Pause the public reader while an unrelated IPC marker traverses the proxy,
// then drain a large response with a deliberately small receive buffer. This
// checks data and connection reuse under pressure, not a memory-budget bound.
func TestHTTPLargeResponseWithPausedReader(t *testing.T) {
	for _, chunked := range []bool{false, true} {
		t.Run(fmt.Sprintf("chunked=%t", chunked), func(t *testing.T) {
			const size = 4 << 20
			block := bytes.Repeat([]byte("z"), 16384)
			release := make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			var calls atomic.Int32
			address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/after" {
					io.WriteString(w, "after")
					return
				}
				calls.Add(1)
				if !chunked {
					w.Header().Set("Content-Length", strconv.Itoa(size))
				}
				w.Write(block)
				w.(http.Flusher).Flush()
				<-release
				for i := 1; i < size/len(block); i++ {
					if _, err := w.Write(block); err != nil {
						t.Error(err)
						return
					}
					if chunked {
						w.(http.Flusher).Flush()
					}
				}
			}))
			defer stop()
			defer unblock()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			if err := c.(*net.TCPConn).SetReadBuffer(65536); err != nil {
				t.Fatal(err)
			}
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("GET /large HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
			response, err := http.ReadResponse(reader, nil)
			if err != nil {
				t.Fatal(err)
			}
			assertUploadInFlight(t, inv)
			unblock()
			// The reader stays paused through this independent round trip while
			// the backend is allowed to send the remainder of its large body.
			ipcBarrier(t)
			body, err := io.ReadAll(response.Body)
			response.Body.Close()
			if err != nil || response.StatusCode != 200 || response.Close || len(body) != size || !bytes.Equal(body, bytes.Repeat([]byte("z"), size)) {
				t.Fatalf("paused-reader response: status=%d bytes=%d close=%v error=%v", response.StatusCode, len(body), response.Close, err)
			}
			scenarioWrite(t, c, fmt.Sprintf("GET /after HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv))
			response, body = scenarioResponse(t, reader, "GET")
			if response.StatusCode != 200 || string(body) != "after" || !response.Close {
				t.Fatalf("after backpressure: status=%d body=%q close=%v", response.StatusCode, body, response.Close)
			}
			assertCompletionIDs(t, inv, 1, 2)
			if calls.Load() != 1 {
				t.Fatalf("large-response application calls=%d, want 1", calls.Load())
			}
		})
	}
}
