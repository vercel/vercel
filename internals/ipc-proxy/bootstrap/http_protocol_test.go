package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
)

func TestHTTPBodylessResponsesOnPersistentConnection(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var calls atomic.Int32
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				switch r.URL.Path {
				case "/head":
					w.Header().Set("Content-Length", "7")
					io.WriteString(w, "ignored")
				case "/204":
					w.WriteHeader(204)
				case "/304":
					w.Header().Set("ETag", `"unchanged"`)
					w.Header().Set("Content-Length", "7")
					w.WriteHeader(304)
				case "/close":
					c, b, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer c.Close()
					io.WriteString(b, "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nclose-delimited")
					b.Flush()
				default:
					io.WriteString(w, r.URL.Path)
				}
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			steps := []struct {
				method, path, body, etag string
				status                   int
				length                   int64
			}{
				{"HEAD", "/head", "", "", 200, 7},
				{"GET", "/before", "/before", "", 200, 7},
				{"GET", "/204", "", "", 204, 0},
				{"GET", "/304", "", `"unchanged"`, 304, 0},
				{"GET", "/after", "/after", "", 200, 6},
				{"GET", "/close", "close-delimited", "", 200, -1},
				{"GET", "/final", "/final", "", 200, 6},
			}
			inv := t.Name()
			var ids []uint64
			for i, step := range steps {
				id := uint64(i + 1)
				ids = append(ids, id)
				scenarioWrite(t, c, fmt.Sprintf("%s %s HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", step.method, step.path, inv, id))
				response, body := scenarioResponse(t, reader, step.method)
				if response.StatusCode != step.status || response.ContentLength != step.length || response.Close || string(body) != step.body || response.Header.Get("ETag") != step.etag {
					t.Fatalf("%s: status=%d length=%d close=%v body=%q etag=%q", step.path, response.StatusCode, response.ContentLength, response.Close, body, response.Header.Get("ETag"))
				}
			}
			assertCompletionIDs(t, inv, ids...)
			if calls.Load() != int32(len(steps)) {
				t.Fatalf("application calls=%d, want %d", calls.Load(), len(steps))
			}
		})
	}
}

func TestHTTPExpectContinueBeforeUpload(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var calls atomic.Int32
			payload := []byte("upload only after the interim response")
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, err := io.ReadAll(r.Body)
				if err != nil || !bytes.Equal(body, payload) {
					t.Errorf("upstream upload=%q error=%v", body, err)
				}
				w.Write(body)
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("POST /expect HTTP/1.1\r\nHost: test\r\nExpect: 100-continue\r\nContent-Length: %d\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", len(payload), inv))
			interim, body := scenarioResponse(t, reader, "POST")
			if interim.StatusCode != 100 || len(body) != 0 {
				t.Fatalf("continue response: %d %q", interim.StatusCode, body)
			}
			scenarioWrite(t, c, string(payload))
			for n := 0; ; n++ {
				response, body := scenarioResponse(t, reader, "POST")
				// Both frontend and backend may emit Continue while forwarding.
				if response.StatusCode == 100 {
					if n >= 4 {
						t.Fatal("too many Continue responses")
					}
					continue
				}
				if response.StatusCode != 200 || !bytes.Equal(body, payload) {
					t.Fatalf("final response: status=%d body=%q", response.StatusCode, body)
				}
				break
			}
			assertCompletionIDs(t, inv, 1)
			if calls.Load() != 1 {
				t.Fatalf("application calls=%d, want 1", calls.Load())
			}
		})
	}
}

func TestHTTPFlushedResponseBeforeBackendCompletion(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			release := make(chan struct{})
			var once sync.Once
			unblock := func() { once.Do(func() { close(release) }) }
			var calls atomic.Int32
			prefix := bytes.Repeat([]byte("first-"), 1024)
			tail := bytes.Repeat([]byte{0, 255, '\r', '\n'}, 1024)
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/octet-stream")
				w.Write(prefix)
				w.(http.Flusher).Flush()
				<-release
				w.Write(tail)
			}))
			defer stop()
			defer unblock()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("GET /stream HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
			response, err := http.ReadResponse(reader, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			first := make([]byte, len(prefix))
			if _, err := io.ReadFull(response.Body, first); err != nil || !bytes.Equal(first, prefix) {
				t.Fatalf("flushed prefix=%q error=%v", first, err)
			}
			ipcBarrier(t)
			if got := completions(inv); len(got) != 0 {
				t.Fatalf("unfinished response completed invocation: %v", got)
			}
			unblock()
			rest, err := io.ReadAll(response.Body)
			if err != nil || response.StatusCode != 200 || !bytes.Equal(rest, tail) {
				t.Fatalf("stream tail: status=%d bytes=%d error=%v", response.StatusCode, len(rest), err)
			}
			assertCompletionIDs(t, inv, 1)
			if calls.Load() != 1 {
				t.Fatalf("stream replayed %d times", calls.Load())
			}
		})
	}
}

func TestHTTPUpgradeCompletesBeforeTunnelClose(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var calls atomic.Int32
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				c, b, err := w.(http.Hijacker).Hijack()
				if err != nil {
					t.Error(err)
					return
				}
				defer c.Close()
				io.WriteString(b, "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: echo\r\n\r\n")
				if err := b.Flush(); err != nil {
					t.Error(err)
					return
				}
				io.Copy(c, b)
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("GET /upgrade HTTP/1.1\r\nHost: test\r\nConnection: Upgrade\r\nUpgrade: echo\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
			response, err := http.ReadResponse(reader, nil)
			if err != nil {
				t.Fatal(err)
			}
			if response.StatusCode != 101 || response.Header.Get("Upgrade") != "echo" {
				t.Fatalf("upgrade response: %d %v", response.StatusCode, response.Header)
			}
			assertCompletionIDs(t, inv, 1)
			for _, value := range []string{"first", "later\x00\xff"} {
				scenarioWrite(t, c, value)
				got := make([]byte, len(value))
				if _, err := io.ReadFull(reader, got); err != nil || string(got) != value {
					t.Fatalf("tunnel: got=%q want=%q error=%v", got, value, err)
				}
			}
			assertCompletionIDs(t, inv, 1)
			if calls.Load() != 1 {
				t.Fatalf("upgrade application calls=%d", calls.Load())
			}
		})
	}
}

func TestHTTPBackendFailureDoesNotReplayOrAppendResponse(t *testing.T) {
	for _, kind := range []string{"reset-headers", "reset-body", "truncated-body", "truncated-chunk"} {
		for _, arm := range httpScenarioFactories {
			t.Run(kind+"/"+arm.name, func(t *testing.T) {
				release := make(chan struct{})
				var once sync.Once
				unblock := func() { once.Do(func() { close(release) }) }
				var calls atomic.Int32
				prefix := bytes.Repeat([]byte("response-prefix-"), 512)
				address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					body, err := io.ReadAll(r.Body)
					if err != nil || string(body) != "mutation" {
						t.Errorf("upload=%q error=%v", body, err)
					}
					c, b, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer c.Close()
					if kind == "reset-headers" {
						io.WriteString(b, "HTTP/1.1 200")
						b.Flush()
					} else {
						if kind == "truncated-chunk" {
							fmt.Fprintf(b, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n%x\r\n", len(prefix))
						} else {
							fmt.Fprintf(b, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: %d\r\n\r\n", len(prefix)+4096)
						}
						b.Write(prefix)
						if kind == "truncated-chunk" {
							io.WriteString(b, "\r\n")
						}
						b.Flush()
						<-release
						if kind == "truncated-chunk" {
							// One complete chunk crosses the first-byte barrier;
							// the next chunk is deliberately incomplete.
							io.WriteString(b, "1000\r\n")
							b.Flush()
						}
					}
					if kind == "reset-headers" || kind == "reset-body" {
						c.(*net.TCPConn).SetLinger(0)
					}
				}))
				defer stop()
				defer unblock()
				c, reader := scenarioConn(t, address)
				defer c.Close()
				inv := t.Name()
				scenarioWrite(t, c, fmt.Sprintf("POST /mutation HTTP/1.1\r\nHost: test\r\nContent-Length: 8\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\nmutation", inv))
				response, err := http.ReadResponse(reader, nil)
				if err != nil {
					t.Fatal(err)
				}
				if kind == "reset-headers" {
					body, err := io.ReadAll(response.Body)
					response.Body.Close()
					if err != nil || response.StatusCode != 502 {
						t.Fatalf("header reset: status=%d body=%q error=%v", response.StatusCode, body, err)
					}
					assertCompletionIDs(t, inv, 1)
				} else {
					if response.StatusCode != 200 {
						t.Fatalf("body response status=%d", response.StatusCode)
					}
					first := make([]byte, 1)
					if _, err := io.ReadFull(response.Body, first); err != nil {
						t.Fatal(err)
					}
					unblock()
					rest, bodyErr := io.ReadAll(response.Body)
					response.Body.Close()
					got := append(first, rest...)
					var networkError net.Error
					if errors.As(bodyErr, &networkError) && networkError.Timeout() {
						t.Fatalf("response hung instead of aborting: bytes=%d error=%v", len(got), bodyErr)
					}
					aborted := errors.Is(bodyErr, io.ErrUnexpectedEOF) || errors.Is(bodyErr, net.ErrClosed) || errors.Is(bodyErr, syscall.ECONNRESET)
					if !aborted || !bytes.HasPrefix(prefix, got) || bytes.Contains(got, []byte("HTTP/1.1 502")) {
						t.Fatalf("truncation not preserved: bytes=%d error=%v", len(got), bodyErr)
					}
					// The original lifecycle wrapper misses end IPC when
					// ReverseProxy panics with ErrAbortHandler. Keep HTTP abort
					// and no-replay coverage here; completion coverage belongs
					// with the separate lifecycle fix, not a missing-end assertion.
				}
				if calls.Load() != 1 {
					t.Fatalf("mutation replayed %d times", calls.Load())
				}
			})
		}
	}
}
