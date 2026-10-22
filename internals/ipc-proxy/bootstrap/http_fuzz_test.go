package main

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"sync"
	"testing"
)

// This is black-box wire fuzzing; subprocess parser coverage is not shared
// with the fuzz worker. Run with -parallel=1 because main owns port 3000.
// Each callback owns its fixture, including in fuzz workers.
func FuzzHTTPFragmentedPersistentExchanges(f *testing.F) {
	f.Add([]byte("one payload"), uint8(1), false)
	f.Add(bytes.Repeat([]byte{0, 255, '\r', '\n', 'x'}, 53), uint8(31), true)
	f.Add([]byte{}, uint8(0), true)
	f.Fuzz(func(t *testing.T, payload []byte, split uint8, chunked bool) {
		if len(payload) > 8<<10 {
			return
		}
		var mu sync.Mutex
		calls := make(map[string]int)
		address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			mu.Lock()
			calls[r.URL.Path]++
			mu.Unlock()
			body, err := io.ReadAll(r.Body)
			if err != nil {
				t.Error(err)
				return
			}
			if r.URL.Path == "/trailers" {
				w.Header().Set("X-Observed-Te", r.Header.Get("Te"))
			}
			w.Header().Set("X-Observed-Path", r.URL.Path)
			if chunked {
				w.Header().Set("Trailer", "X-Result")
			}
			w.Write(body)
			if chunked {
				w.(http.Flusher).Flush()
				w.Header().Set("X-Result", "done")
			}
		}))
		defer stop()
		c, reader := scenarioConn(t, address)
		var wire bytes.Buffer
		for i, target := range []string{"/first", "/trailers", "/after"} {
			fmt.Fprintf(&wire, "POST %s HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: fuzz\r\nX-Vercel-Internal-Request-Id: %d\r\n", target, i+1)
			if i == 1 {
				wire.WriteString("Te: trailers\r\n")
			}
			if chunked {
				wire.WriteString("Transfer-Encoding: chunked\r\n\r\n")
				for offset := 0; offset < len(payload); offset += 97 {
					part := payload[offset:min(offset+97, len(payload))]
					fmt.Fprintf(&wire, "%x;test=yes\r\n", len(part))
					wire.Write(part)
					wire.WriteString("\r\n")
				}
				wire.WriteString("0\r\n\r\n")
			} else {
				fmt.Fprintf(&wire, "Content-Length: %d\r\n\r\n", len(payload))
				wire.Write(payload)
			}
		}
		raw := wire.Bytes()
		step := int(split) + 1
		for offset := 0; offset < len(raw); offset += step {
			scenarioWrite(t, c, string(raw[offset:min(offset+step, len(raw))]))
		}
		for i, path := range []string{"/first", "/trailers", "/after"} {
			response, body := scenarioResponse(t, reader, "POST")
			if response.StatusCode != 200 || !bytes.Equal(body, payload) || response.Header.Get("X-Observed-Path") != path {
				t.Fatalf("exchange %d: status=%d bytes=%d", i, response.StatusCode, len(body))
			}
			if i == 1 && response.Header.Get("X-Observed-Te") != "trailers" {
				t.Fatal("TE trailers lost")
			}
			if chunked && response.Trailer.Get("X-Result") != "done" {
				t.Fatalf("response trailers=%v", response.Trailer)
			}
		}
		assertCompletionIDs(t, "fuzz", 1, 2, 3)
		mu.Lock()
		defer mu.Unlock()
		for _, path := range []string{"/first", "/trailers", "/after"} {
			if calls[path] != 1 {
				t.Errorf("path %s executed %d times", path, calls[path])
			}
		}
	})
}
