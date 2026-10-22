package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestHTTPClientDisconnectCancelsBackendResponse(t *testing.T) {
	cancelled := make(chan struct{})
	var calls atomic.Int32
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/recover" {
			io.WriteString(w, "recovered")
			return
		}
		calls.Add(1)
		io.WriteString(w, "first")
		w.(http.Flusher).Flush()
		select {
		case <-r.Context().Done():
			close(cancelled)
		case <-time.After(5 * time.Second):
			t.Error("backend response context was not cancelled")
		}
	}))
	defer stop()
	c, reader := scenarioConn(t, address)
	defer c.Close()
	scenarioWrite(t, c, fmt.Sprintf("GET /cancel HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s-cancelled\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", t.Name()))
	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}
	first := make([]byte, 5)
	if _, err := io.ReadFull(response.Body, first); err != nil || string(first) != "first" {
		t.Fatalf("response prefix=%q error=%v", first, err)
	}
	c.Close()
	response.Body.Close()
	select {
	case <-cancelled:
	case <-time.After(5 * time.Second):
		t.Fatal("disconnect did not cancel backend response")
	}
	// An aborted final response hits the original ErrAbortHandler lifecycle
	// bug. Do not assert missing end IPC as desired behavior; test cancellation
	// and subsequent successful request completion independently.
	resilienceRecovery(t, address, t.Name())
	if calls.Load() != 1 {
		t.Fatalf("cancelled request executed %d times", calls.Load())
	}
}

func TestHTTPClientDisconnectCancelsBackendUpload(t *testing.T) {
	for _, chunked := range []bool{false, true} {
		t.Run(fmt.Sprintf("chunked=%v", chunked), func(t *testing.T) {
			started := make(chan struct{})
			aborted := make(chan error, 1)
			var calls atomic.Int32
			address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/recover" {
					io.WriteString(w, "recovered")
					return
				}
				calls.Add(1)
				close(started)
				_, err := io.Copy(io.Discard, r.Body)
				aborted <- err
			}))
			defer stop()
			c, _ := scenarioConn(t, address)
			defer c.Close()
			framing := "Content-Length: 1048576\r\n"
			body := strings.Repeat("x", 1024)
			if chunked {
				framing = "Transfer-Encoding: chunked\r\n"
				body = "400\r\n" + body + "\r\n"
			}
			scenarioWrite(t, c, fmt.Sprintf("POST /upload HTTP/1.1\r\nHost: test\r\n%sX-Vercel-Internal-Invocation-Id: %s-cancelled\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n%s", framing, t.Name(), body))
			select {
			case <-started:
			case <-time.After(5 * time.Second):
				t.Fatal("backend upload did not start before disconnect")
			}
			c.Close()
			select {
			case err := <-aborted:
				if err == nil {
					t.Fatal("truncated upload reported success")
				}
			case <-time.After(5 * time.Second):
				t.Fatal("backend upload did not abort")
			}
			resilienceRecovery(t, address, t.Name())
			if calls.Load() != 1 {
				t.Fatalf("upload executed %d times", calls.Load())
			}
		})
	}
}

func resilienceRecovery(t *testing.T, address, invocation string) {
	t.Helper()
	c, reader := scenarioConn(t, address)
	defer c.Close()
	scenarioWrite(t, c, fmt.Sprintf("GET /recover HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", invocation))
	response, body := scenarioResponse(t, reader, "GET")
	if response.StatusCode != 200 || string(body) != "recovered" {
		t.Fatalf("recovery: status=%d body=%q", response.StatusCode, body)
	}
	assertCompletionIDs(t, invocation, 1)
}

func TestHTTPIdleBackendClosureRecoversWithoutReplayingPost(t *testing.T) {
	closed := make(chan net.Conn, 1)
	var calls atomic.Int32
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path == "/prime" {
			c, b, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			io.WriteString(b, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
			b.Flush()
			closed <- c
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		w.Write(body)
	}))
	defer stop()
	c, reader := scenarioConn(t, address)
	defer c.Close()
	inv := t.Name()
	scenarioWrite(t, c, fmt.Sprintf("GET /prime HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
	response, body := scenarioResponse(t, reader, "GET")
	if response.StatusCode != 200 || string(body) != "ok" {
		t.Fatalf("priming response: %d %q", response.StatusCode, body)
	}
	var backend net.Conn
	select {
	case backend = <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("backend did not expose idle connection")
	}
	defer backend.Close()
	backend.Close()
	// A completed public exchange after closure provides an observable recovery
	// barrier, without depending on the implementation's idle-pool counters.
	ipcBarrier(t)
	payload := "post exactly once\x00\xff"
	scenarioWrite(t, c, fmt.Sprintf("POST /post HTTP/1.1\r\nHost: test\r\nContent-Length: %d\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n%s", len(payload), inv, payload))
	response, body = scenarioResponse(t, reader, "POST")
	if response.StatusCode != 200 || string(body) != payload || calls.Load() != 2 {
		t.Fatalf("idle recovery: status=%d body=%q application calls=%d", response.StatusCode, body, calls.Load())
	}
	assertCompletionIDs(t, inv, 1, 2)
}

func TestHTTPConcurrentConnectionChurnAndBackendFailures(t *testing.T) {
	const workers, iterations = 8, 20
	var mu sync.Mutex
	calls := make(map[int]int)
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, _ := strconv.Atoi(r.URL.Query().Get("id"))
		mu.Lock()
		calls[id]++
		mu.Unlock()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		if id%7 == 0 || id%5 == 0 {
			c, b, err := w.(http.Hijacker).Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			defer c.Close()
			if id%7 == 0 {
				io.WriteString(b, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: 65536\r\n\r\npartial")
			} else {
				io.WriteString(b, "HTTP/1.1 broken\r\n\r\n")
			}
			b.Flush()
			return
		}
		w.Write(body)
	}))
	defer stop()
	inv := t.Name()
	var wg sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		wg.Add(1)
		go func(worker int) {
			defer wg.Done()
			transport := &http.Transport{MaxIdleConnsPerHost: 1}
			defer transport.CloseIdleConnections()
			client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
			for i := 0; i < iterations; i++ {
				id := worker*iterations + i + 1
				payload := bytes.Repeat([]byte(fmt.Sprintf("worker=%d id=%d;", worker, id)), 97)
				req, err := http.NewRequest("POST", fmt.Sprintf("%s/echo?id=%d", address, id), bytes.NewReader(payload))
				if err != nil {
					t.Error(err)
					return
				}
				invocation := inv
				if id%7 == 0 {
					// Do not prescribe the original missing-end lifecycle bug.
					invocation += "-aborted"
				}
				req.Header.Set("X-Vercel-Internal-Invocation-Id", invocation)
				req.Header.Set("X-Vercel-Internal-Request-Id", strconv.Itoa(id))
				req.Close = i%3 == 0
				if i%4 == 0 {
					req.Header.Set("Te", "trailers")
				}
				response, err := client.Do(req)
				if err != nil {
					t.Errorf("request %d: %v", id, err)
					return
				}
				body, bodyErr := io.ReadAll(response.Body)
				response.Body.Close()
				switch {
				case id%7 == 0:
					var networkErr net.Error
					timedOut := errors.As(bodyErr, &networkErr) && networkErr.Timeout()
					aborted := errors.Is(bodyErr, io.ErrUnexpectedEOF) || errors.Is(bodyErr, net.ErrClosed) || errors.Is(bodyErr, io.ErrClosedPipe) || errors.Is(bodyErr, syscall.ECONNRESET)
					if response.StatusCode != 200 || timedOut || !aborted || string(body) != "partial" {
						t.Errorf("truncation %d: status=%d body=%q error=%v", id, response.StatusCode, body, bodyErr)
					}
				case id%5 == 0:
					if response.StatusCode != 502 || bodyErr != nil {
						t.Errorf("header failure %d: status=%d error=%v", id, response.StatusCode, bodyErr)
					}
				default:
					if response.StatusCode != 200 || bodyErr != nil || !bytes.Equal(body, payload) {
						t.Errorf("request %d corrupted: status=%d bytes=%d error=%v", id, response.StatusCode, len(body), bodyErr)
					}
				}
			}
		}(worker)
	}
	wg.Wait()
	var ids []uint64
	for id := 1; id <= workers*iterations; id++ {
		if id%7 != 0 {
			ids = append(ids, uint64(id))
		}
	}
	assertCompletionIDs(t, inv, ids...)
	mu.Lock()
	defer mu.Unlock()
	if len(calls) != workers*iterations {
		t.Fatalf("application saw %d distinct requests, want %d", len(calls), workers*iterations)
	}
	for id, count := range calls {
		if count != 1 {
			t.Errorf("request %d executed %d times", id, count)
		}
	}
}

func TestHTTPLargeAndLegacyBackendResponses(t *testing.T) {
	for _, tc := range []struct{ name, wire string }{
		{"large field", "HTTP/1.1 200 OK\r\nX-Pad: " + strings.Repeat("x", 40<<10) + "\r\nContent-Length: 2\r\n\r\nok"},
		{"many fields", "HTTP/1.1 200 OK\r\n" + strings.Repeat("X-Pad: x\r\n", 150) + "Content-Length: 2\r\n\r\nok"},
		{"HTTP 1.0", "HTTP/1.0 200 OK\r\nContent-Length: 2\r\n\r\nok"},
		{"LF delimiters", "HTTP/1.1 200 OK\nContent-Length: 2\n\nok"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int32
			address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
				io.WriteString(b, tc.wire)
				b.Flush()
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			defer c.Close()
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("POST /mutate HTTP/1.1\r\nHost: test\r\nContent-Length: 8\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\nmutation", inv))
			response, body := scenarioResponse(t, reader, "POST")
			if response.StatusCode != 200 || string(body) != "ok" || calls.Load() != 1 {
				t.Fatalf("legacy response: status=%d body=%q application calls=%d", response.StatusCode, body, calls.Load())
			}
			if tc.name == "large field" && response.Header.Get("X-Pad") != strings.Repeat("x", 40<<10) {
				t.Fatal("large response field corrupted")
			}
			if tc.name == "many fields" && len(response.Header.Values("X-Pad")) != 150 {
				t.Fatal("response field values lost")
			}
			assertCompletionIDs(t, inv, 1)
		})
	}
}

func TestHTTPFragmentedUnannouncedPublicTrailer(t *testing.T) {
	release := make(chan struct{})
	bodyRead := make(chan struct{})
	fragmentReady := make(chan struct{})
	var bodyOnce sync.Once
	beginTrailer := func() { bodyOnce.Do(func() { close(bodyRead) }) }
	var once sync.Once
	unblock := func() { once.Do(func() { close(release) }) }
	var calls atomic.Int32
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		c, b, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer c.Close()
		io.WriteString(b, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nok\r\n")
		b.Flush()
		<-bodyRead
		io.WriteString(b, "0\r\nX-Result: public-prefix")
		b.Flush()
		close(fragmentReady)
		<-release
		io.WriteString(b, "-suffix\r\n\r\n")
		b.Flush()
	}))
	defer stop()
	defer unblock()
	defer beginTrailer()
	c, reader := scenarioConn(t, address)
	defer c.Close()
	inv := t.Name()
	scenarioWrite(t, c, fmt.Sprintf("GET /trailers HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
	response, err := http.ReadResponse(reader, nil)
	if err != nil {
		t.Fatal(err)
	}
	prefix := make([]byte, 2)
	if _, err := io.ReadFull(response.Body, prefix); err != nil || string(prefix) != "ok" {
		t.Fatalf("body before trailer completion: %q %v", prefix, err)
	}
	beginTrailer()
	select {
	case <-fragmentReady:
	case <-time.After(5 * time.Second):
		t.Fatal("backend did not flush partial trailer")
	}
	ipcBarrier(t)
	if got := completions(inv); len(got) != 0 {
		t.Fatalf("incomplete trailer completed invocation: %v", got)
	}
	unblock()
	rest, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || response.StatusCode != 200 || len(rest) != 0 || response.Trailer.Get("X-Result") != "public-prefix-suffix" {
		t.Fatalf("fragmented trailer: status=%d rest=%q trailers=%v error=%v", response.StatusCode, rest, response.Trailer, err)
	}
	assertCompletionIDs(t, inv, 1)
	if calls.Load() != 1 {
		t.Fatalf("trailer request executed %d times", calls.Load())
	}
}
