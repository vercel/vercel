package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// Cover each method and status, with explicit HEAD and uploaded-body interactions
// for bodyless responses. Persistent bodyless sequencing is tested separately.
func TestHTTPMethodsStatusesAndBinaryBodies(t *testing.T) {
	methods := []string{"HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "PROPFIND"}
	statuses := []int{200, 201, 202, 204, 205, 206, 301, 302, 303, 304, 307, 308, 400, 401, 404, 409, 418, 429, 500, 503, 599}
	type methodStatus struct {
		method string
		status int
	}
	var cases []methodStatus
	for _, status := range statuses {
		cases = append(cases, methodStatus{"GET", status})
	}
	for _, method := range methods {
		cases = append(cases, methodStatus{method, 200})
	}
	for _, method := range []string{"HEAD", "POST"} {
		for _, status := range []int{204, 304} {
			cases = append(cases, methodStatus{method, status})
		}
	}
	payload := bytes.Repeat([]byte{0, 255, '\r', '\n', 'x'}, 97)
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var calls atomic.Int32
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, err := io.ReadAll(r.Body)
				if err != nil || !bytes.Equal(body, payload) {
					t.Errorf("%s upload: bytes=%d error=%v", r.Method, len(body), err)
				}
				status, _ := strconv.Atoi(r.URL.Query().Get("status"))
				w.Header().Set("Content-Length", strconv.Itoa(len(payload)))
				w.Header().Set("Content-Type", "application/octet-stream")
				w.Header().Set("X-Method", r.Method)
				w.Header().Add("Set-Cookie", "first=1; Path=/; HttpOnly")
				w.Header().Add("Set-Cookie", "second=2; Path=/; Secure")
				w.Header().Add("Vary", "Accept-Encoding")
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Location", "/do-not-follow")
				w.WriteHeader(status)
				if status != 204 && status != 304 {
					w.Write(payload)
				}
			}))
			defer stop()
			inv := t.Name()
			var ids []uint64
			for _, tc := range cases {
				method, status := tc.method, tc.status
				t.Run(fmt.Sprintf("%s/%d", method, status), func(t *testing.T) {
					id := uint64(len(ids) + 1)
					ids = append(ids, id)
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("%s /status?status=%d HTTP/1.1\r\nHost: test\r\nContent-Length: %d\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n%s", method, status, len(payload), inv, id, payload))
					response, body := scenarioResponse(t, reader, method)
					want := payload
					if method == "HEAD" || status == 204 || status == 304 {
						want = nil
					}
					if response.StatusCode != status || !bytes.Equal(body, want) || !response.Close || response.Header.Get("X-Method") != method {
						t.Fatalf("status=%d body=%d close=%v method=%q", response.StatusCode, len(body), response.Close, response.Header.Get("X-Method"))
					}
					if !reflect.DeepEqual(response.Header.Values("Set-Cookie"), []string{"first=1; Path=/; HttpOnly", "second=2; Path=/; Secure"}) || !reflect.DeepEqual(response.Header.Values("Vary"), []string{"Accept-Encoding", "Origin"}) {
						t.Fatalf("multi-value headers changed: %v", response.Header)
					}
					if response.Header.Get("Location") != "/do-not-follow" {
						t.Fatal("Location lost")
					}
				})
			}
			assertCompletionIDs(t, inv, ids...)
			if calls.Load() != int32(len(ids)) {
				t.Fatalf("app executed %d times for %d requests", calls.Load(), len(ids))
			}
		})
	}
}

func TestHTTPRequestHeaderSemantics(t *testing.T) {
	type observation struct {
		Host, ForwardedFor, TE, Hop, Upgrade, Secret, Public string
		Cookies                                              []string
	}
	cases := []struct {
		name, fields, host, xff, te string
	}{
		{"ordinary", "", "incoming.example", "127.0.0.1", ""},
		{"forwarded host", "X-Forwarded-Host: app.example\r\n", "app.example", "127.0.0.1", ""},
		{"duplicate forwarded host", "X-Forwarded-Host: first.example\r\nX-Forwarded-Host: second.example\r\n", "first.example", "127.0.0.1", ""},
		{"empty first forwarded host", "X-Forwarded-Host: \r\nX-Forwarded-Host: second.example\r\n", "incoming.example", "127.0.0.1", ""},
		{"forwarded IPv6 host", "X-Forwarded-Host: [2001:db8::1]:8443\r\n", "[2001:db8::1]:8443", "127.0.0.1", ""},
		{"multiple forwarded fields", "X-Forwarded-For: 192.0.2.1\r\nX-Forwarded-For: 198.51.100.2\r\n", "incoming.example", "192.0.2.1, 198.51.100.2, 127.0.0.1", ""},
		{"empty forwarded fields", "X-Forwarded-For: \r\nX-Forwarded-For: 192.0.2.1\r\n", "incoming.example", ", 192.0.2.1, 127.0.0.1", ""},
		{"nominated forwarded field", "Connection: X-Forwarded-For\r\nX-Forwarded-For: must-be-removed\r\n", "incoming.example", "127.0.0.1", ""},
		{"TE before host", "Te: trailers\r\nX-Forwarded-Host: app.example\r\n", "app.example", "127.0.0.1", "trailers"},
		{"TE after host", "X-Forwarded-Host: app.example\r\ntE: trailers\r\n", "app.example", "127.0.0.1", "trailers"},
		{"TE non-trailer", "Te: gzip\r\n", "incoming.example", "127.0.0.1", ""},
		{"TE token list", "Te: gzip, Trailers\r\n", "incoming.example", "127.0.0.1", "trailers"},
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				json.NewEncoder(w).Encode(observation{r.Host, r.Header.Get("X-Forwarded-For"), r.Header.Get("Te"), r.Header.Get("X-Hop"), r.Header.Get("Upgrade"), r.Header.Get("X-Vercel-Internal-Secret"), r.Header.Get("X-Public"), r.Header.Values("Cookie")})
			}))
			defer stop()
			inv := t.Name()
			var ids []uint64
			for i, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					id := uint64(i + 1)
					ids = append(ids, id)
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("GET /headers HTTP/1.1\r\nHost: incoming.example\r\n%sConnection: close, X-Hop\r\nX-Hop: removed\r\nUpgrade: echo\r\nX-Public: retained\r\nCookie: first=1\r\nCookie: second=2\r\nx-vErCeL-iNtErNaL-sEcReT: private\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", tc.fields, inv, id))
					response, body := scenarioResponse(t, reader, "GET")
					var got observation
					if response.StatusCode != 200 || json.Unmarshal(body, &got) != nil {
						t.Fatalf("response=%d body=%q", response.StatusCode, body)
					}
					want := observation{Host: tc.host, ForwardedFor: tc.xff, TE: tc.te, Public: "retained", Cookies: []string{"first=1", "second=2"}}
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("request semantics: got %+v want %+v", got, want)
					}
				})
			}
			assertCompletionIDs(t, inv, ids...)
		})
	}
}

func TestHTTPResponseHopHeadersDoNotLeakAcrossReuse(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Length", "2")
				w.Header().Set("X-Public", "retained")
				w.Header().Set("X-Hop", "public-on-next-response")
				if r.URL.Path == "/first" {
					w.Header().Set("Connection", "X-Hop")
					w.Header().Set("Keep-Alive", "timeout=5")
					w.Header().Set("Proxy-Connection", "keep-alive")
				}
				io.WriteString(w, "ok")
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			inv := t.Name()
			scenarioWrite(t, c, fmt.Sprintf("GET /first HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\nGET /second HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv, inv))
			for i, name := range []string{"nominated", "ordinary-after-nominated"} {
				t.Run(name, func(t *testing.T) {
					response, body := scenarioResponse(t, reader, "GET")
					wantHop := ""
					if i == 1 {
						wantHop = "public-on-next-response"
					}
					if response.StatusCode != 200 || string(body) != "ok" || response.Close || response.Header.Get("X-Hop") != wantHop || response.Header.Get("X-Public") != "retained" {
						t.Fatalf("response hop state: status=%d body=%q close=%v headers=%v", response.StatusCode, body, response.Close, response.Header)
					}
					for _, field := range []string{"Connection", "Keep-Alive", "Proxy-Connection"} {
						if response.Header.Get(field) != "" {
							t.Fatalf("hop header %s leaked", field)
						}
					}
				})
			}
			assertCompletionIDs(t, inv, 1, 2)
		})
	}
}

func TestHTTPMalformedRequestCannotExecutePipelinedSentinel(t *testing.T) {
	cases := []struct {
		name, header string
		status       int
	}{
		{"missing Host", "GET /bad HTTP/1.1\r\n", 400},
		{"duplicate Host", "GET /bad HTTP/1.1\r\nHost: first\r\nHost: second\r\n", 400},
		{"invalid Host", "GET /bad HTTP/1.1\r\nHost: bad host\r\n", 400},
		{"conflicting lengths", "POST /bad HTTP/1.1\r\nHost: test\r\nContent-Length: 1\r\nContent-Length: 2\r\n", 400},
		{"negative length", "POST /bad HTTP/1.1\r\nHost: test\r\nContent-Length: -1\r\n", 400},
		{"length overflow", "POST /bad HTTP/1.1\r\nHost: test\r\nContent-Length: 9223372036854775808\r\n", 400},
		{"comma lengths", "POST /bad HTTP/1.1\r\nHost: test\r\nContent-Length: 1, 1\r\n", 400},
		{"unsupported transfer coding", "POST /bad HTTP/1.1\r\nHost: test\r\nTransfer-Encoding: gzip\r\n", 501},
		{"multiple transfer fields", "POST /bad HTTP/1.1\r\nHost: test\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n", 501},
		{"space before colon", "GET /bad HTTP/1.1\r\nHost: test\r\nBad : value\r\n", 400},
		{"control in value", "GET /bad HTTP/1.1\r\nHost: test\r\nX-Bad: value\x00tail\r\n", 400},
		{"invalid field name", "GET /bad HTTP/1.1\r\nHost: test\r\nBad(Name): value\r\n", 400},
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var calls atomic.Int32
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); io.WriteString(w, "must not run") }))
			defer stop()
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, tc.header+"\r\nGET /sentinel HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n")
					response, _ := scenarioResponse(t, reader, "GET")
					if response.StatusCode != tc.status {
						t.Fatalf("malformed request returned %d, want %d", response.StatusCode, tc.status)
					}
					if _, err := reader.ReadByte(); err != io.EOF {
						t.Fatalf("rejected connection not closed: %v", err)
					}
					if calls.Load() != 0 {
						t.Fatalf("malformed input or sentinel reached application %d times", calls.Load())
					}
				})
			}
		})
	}
}

func TestHTTPInformationalResponsesAndFinalHeaderIsolation(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		for _, count := range []int{2, 5, 10} {
			t.Run(fmt.Sprintf("%s/%d hints", arm.name, count), func(t *testing.T) {
				var calls atomic.Int32
				release := make(chan struct{})
				var once sync.Once
				unblock := func() { once.Do(func() { close(release) }) }
				address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					c, b, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer c.Close()
					for i := 0; i < count; i++ {
						fmt.Fprintf(b, "HTTP/1.1 103 Early Hints\r\nLink: </asset-%d>; rel=preload\r\n\r\n", i)
					}
					if err := b.Flush(); err != nil {
						t.Error(err)
						return
					}
					<-release
					io.WriteString(b, "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nX-Final: yes\r\n\r\nok")
					b.Flush()
				}))
				defer stop()
				defer unblock()
				c, reader := scenarioConn(t, address)
				inv := t.Name()
				scenarioWrite(t, c, fmt.Sprintf("GET /hints HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
				bounded := false
				for i := 0; i < count; i++ {
					response, body := scenarioResponse(t, reader, "GET")
					// Go 1.23 rejects after five informational responses; newer
					// toolchains permit more. Beyond the common supported range,
					// a bound must produce a final error, never a bare disconnect.
					if count == 10 && i >= 5 && response.StatusCode == 502 {
						if response.Header.Get("Link") != "" {
							t.Fatal("hint headers leaked into final error")
						}
						bounded = true
						break
					}
					if response.StatusCode != 103 || len(body) != 0 || response.Header.Get("Link") != fmt.Sprintf("</asset-%d>; rel=preload", i) {
						t.Fatalf("hint %d: %d %q %v", i, response.StatusCode, body, response.Header)
					}
				}
				ipcBarrier(t)
				if got := completions(inv); !bounded && len(got) != 0 {
					t.Fatalf("informational response completed invocation: %v", got)
				}
				unblock()
				if !bounded {
					response, body := scenarioResponse(t, reader, "GET")
					if response.StatusCode != 200 || string(body) != "ok" || response.Header.Get("X-Final") != "yes" || response.Header.Get("Link") != "" {
						t.Fatalf("final response contaminated: %d %q %v", response.StatusCode, body, response.Header)
					}
				}
				assertCompletionIDs(t, inv, 1)
				if calls.Load() != 1 {
					t.Fatalf("request replayed %d times", calls.Load())
				}
			})
		}
	}
}

func TestHTTPMalformedBackendHeadersDoNotReplayPost(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			for _, tc := range []struct{ name, wire string }{
				{"conflicting lengths", "HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\nx"},
				{"negative length", "HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\n"},
				{"bad field name", "HTTP/1.1 200 OK\r\nBad(Name): value\r\nContent-Length: 0\r\n\r\n"},
				{"unsupported coding", "HTTP/1.1 200 OK\r\nTransfer-Encoding: gzip\r\n\r\n"},
				{"duplicate coding", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n"},
			} {
				t.Run(tc.name, func(t *testing.T) {
					var calls atomic.Int32
					address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						if r.URL.Path == "/recover" {
							io.WriteString(w, "recovered")
							return
						}
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
					inv := t.Name()
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("POST /mutate HTTP/1.1\r\nHost: test\r\nContent-Length: 8\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\nmutation", inv))
					response, _ := scenarioResponse(t, reader, "POST")
					if response.StatusCode != 502 {
						t.Fatalf("bad backend headers returned %d", response.StatusCode)
					}
					c.Close()
					c, reader = scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("GET /recover HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv))
					response, body := scenarioResponse(t, reader, "GET")
					if response.StatusCode != 200 || string(body) != "recovered" || calls.Load() != 1 {
						t.Fatalf("failed recovery/replayed POST: status=%d body=%q calls=%d", response.StatusCode, body, calls.Load())
					}
					assertCompletionIDs(t, inv, 1, 2)
				})
			}
		})
	}
}

func TestHTTPInterimThenBackendFailureStillSendsFinalError(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		for _, failure := range []struct{ name, tail string }{
			{"eof", ""}, {"malformed", "HTTP/1.1 broken\r\n\r\n"},
		} {
			t.Run(arm.name+"/"+failure.name, func(t *testing.T) {
				var calls atomic.Int32
				address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					c, b, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer c.Close()
					io.WriteString(b, "HTTP/1.1 103 Early Hints\r\nLink: </asset>; rel=preload\r\n\r\n"+failure.tail)
					b.Flush()
				}))
				defer stop()
				c, reader := scenarioConn(t, address)
				inv := t.Name()
				scenarioWrite(t, c, fmt.Sprintf("POST /mutate HTTP/1.1\r\nHost: test\r\nContent-Length: 0\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", inv))
				hint, body := scenarioResponse(t, reader, "POST")
				if hint.StatusCode != 103 || len(body) != 0 {
					t.Fatalf("missing hint: %d %q", hint.StatusCode, body)
				}
				final, _ := scenarioResponse(t, reader, "POST")
				if final.StatusCode != 502 || final.Header.Get("Link") != "" {
					t.Fatalf("invalid final error: %d %v", final.StatusCode, final.Header)
				}
				assertCompletionIDs(t, inv, 1)
				if calls.Load() != 1 {
					t.Fatalf("mutation replayed %d times", calls.Load())
				}
			})
		}
	}
}

func TestHTTPPersistentFramingAndPipelining(t *testing.T) {
	steps := []struct{ method, fields, wireBody, body string }{
		// Reuse one public connection across methods and binary request bodies
		// before exercising the less common framing forms below.
		{"GET", "", "", ""},
		{"POST", "Content-Length: 3\r\n", "one", "one"},
		{"PUT", "Content-Length: 5\r\n", "\x00\xff\r\nx", "\x00\xff\r\nx"},
		{"HEAD", "Content-Length: 0\r\n", "", ""},
		{"GET", "", "", ""},
		// Follow equal duplicate lengths and chunked requests with another
		// request to verify that framing boundaries remain intact.
		{"POST", "Content-Length: 3\r\nContent-Length: 3\r\n", "one", "one"},
		// net/http uses chunked framing and deletes CL; neither length may
		// consume bytes belonging to the following request.
		{"POST", "Content-Length: 999\r\nTransfer-Encoding: chunked\r\n", "3;ext=yes\r\none\r\n0\r\n\r\n", "one"},
		{"POST", "Transfer-Encoding: chunked\r\n", "0\r\n\r\n", ""},
		{"GET", "", "", ""},
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			var mu sync.Mutex
			calls := map[string]int{}
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Error(err)
					return
				}
				mu.Lock()
				calls[r.URL.Path]++
				mu.Unlock()
				value := fmt.Sprintf("%s %s %x", r.Method, r.URL.Path, body)
				w.Header().Set("Content-Length", strconv.Itoa(len(value)))
				w.Header().Set("X-Path", r.URL.Path)
				io.WriteString(w, value)
			}))
			defer stop()
			c, reader := scenarioConn(t, address)
			inv := t.Name()
			var wire strings.Builder
			var ids []uint64
			for i, step := range steps {
				id := uint64(i + 1)
				ids = append(ids, id)
				fmt.Fprintf(&wire, "%s /step-%d HTTP/1.1\r\nHost: test\r\n%sX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n%s", step.method, id, step.fields, inv, id, step.wireBody)
			}
			scenarioWrite(t, c, wire.String())
			for i, step := range steps {
				response, body := scenarioResponse(t, reader, step.method)
				path := fmt.Sprintf("/step-%d", i+1)
				want := fmt.Sprintf("%s %s %x", step.method, path, step.body)
				if step.method == "HEAD" {
					want = ""
				}
				if response.StatusCode != 200 || response.Close || string(body) != want || response.Header.Get("X-Path") != path {
					t.Fatalf("step %d: status=%d close=%v body=%q headers=%v", i, response.StatusCode, response.Close, body, response.Header)
				}
			}
			assertCompletionIDs(t, inv, ids...)
			mu.Lock()
			defer mu.Unlock()
			if len(calls) != len(steps) {
				t.Fatalf("app saw %d paths for %d requests", len(calls), len(steps))
			}
			for path, n := range calls {
				if n != 1 {
					t.Errorf("%s executed %d times", path, n)
				}
			}
		})
	}
}

func TestHTTPConnectionVersionsAndCloseTokens(t *testing.T) {
	cases := []struct {
		name, version, connection string
		close                     bool
	}{
		{"HTTP1.0 default close", "HTTP/1.0", "", true},
		{"HTTP1.0 explicit keepalive", "HTTP/1.0", "Connection: keep-alive\r\n", false},
		{"HTTP1.1 default persistent", "HTTP/1.1", "", false},
		{"HTTP1.1 mixed close tokens", "HTTP/1.1", "Connection: keep-alive, ClOsE\r\n", true},
		{"HTTP1.1 close in second field", "HTTP/1.1", "Connection: keep-alive\r\nConnection: close\r\n", true},
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Length", "2")
				io.WriteString(w, "ok")
			}))
			defer stop()
			for _, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					c, reader := scenarioConn(t, address)
					inv := t.Name()
					scenarioWrite(t, c, fmt.Sprintf("GET /first %s\r\nHost: test\r\n%sX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", tc.version, tc.connection, inv))
					response, body := scenarioResponse(t, reader, "GET")
					if response.StatusCode != 200 || string(body) != "ok" || response.Close != tc.close {
						t.Fatalf("status=%d body=%q close=%v wantClose=%v", response.StatusCode, body, response.Close, tc.close)
					}
					if tc.close {
						if _, err := reader.ReadByte(); err != io.EOF {
							t.Fatalf("close not honored: %v", err)
						}
						assertCompletionIDs(t, inv, 1)
					} else {
						scenarioWrite(t, c, fmt.Sprintf("GET /second HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv))
						response, body = scenarioResponse(t, reader, "GET")
						if response.StatusCode != 200 || string(body) != "ok" || !response.Close {
							t.Fatal("persistent connection did not serve the next request")
						}
						assertCompletionIDs(t, inv, 1, 2)
					}
				})
			}
		})
	}
}

func TestHTTPResponseTrailersAcrossPersistentRequests(t *testing.T) {
	for _, arm := range httpScenarioFactories {
		for _, tc := range []struct {
			name      string
			announced bool
			values    []string
		}{
			{"announced", true, []string{"first", "second"}},
			{"unannounced", false, []string{"first", "second"}},
			{"empty", true, nil},
		} {
			t.Run(arm.name+"/"+tc.name, func(t *testing.T) {
				var calls atomic.Int32
				address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					if r.URL.Path == "/after" {
						io.WriteString(w, "after")
						return
					}
					c, b, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer c.Close()
					io.WriteString(b, "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n")
					if tc.announced {
						io.WriteString(b, "Trailer: X-Result\r\n")
					}
					io.WriteString(b, "\r\n3;ext=\"value\"\r\none\r\n2\r\n\x00\xff\r\n0\r\n")
					for _, value := range tc.values {
						fmt.Fprintf(b, "X-Result: %s\r\n", value)
					}
					io.WriteString(b, "\r\n")
					b.Flush()
				}))
				defer stop()
				c, reader := scenarioConn(t, address)
				inv := t.Name()
				scenarioWrite(t, c, fmt.Sprintf("GET /trailers HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\nGET /after HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 2\r\n\r\n", inv, inv))
				response, body := scenarioResponse(t, reader, "GET")
				if response.StatusCode != 200 || string(body) != "one\x00\xff" {
					t.Fatalf("chunked body: status=%d body=%q", response.StatusCode, body)
				}
				values := response.Trailer.Values("X-Result")
				if !reflect.DeepEqual(values, tc.values) {
					t.Fatalf("trailers changed: %v", response.Trailer)
				}
				response, body = scenarioResponse(t, reader, "GET")
				if response.StatusCode != 200 || string(body) != "after" || len(response.Trailer) != 0 {
					t.Fatalf("trailer state leaked to next response: status=%d body=%q trailers=%v", response.StatusCode, body, response.Trailer)
				}
				assertCompletionIDs(t, inv, 1, 2)
				if calls.Load() != 2 {
					t.Fatalf("replayed/lost request: app calls=%d", calls.Load())
				}
			})
		}
	}
}

func TestHTTPConditionalAndRangeRequests(t *testing.T) {
	modified := time.Unix(1700000000, 0).UTC()
	cases := []struct {
		name, method, fields string
		status               int
		body, contentRange   string
		ignoreBody           bool
		check                func(*testing.T, *http.Response, []byte)
	}{
		{"matching ETag", "GET", "If-None-Match: \"version-1\"\r\n", 304, "", "", false, nil},
		{"matching weak ETag", "GET", "If-None-Match: W/\"version-1\"\r\n", 304, "", "", false, nil},
		{"matching HEAD ETag", "HEAD", "If-None-Match: \"version-1\"\r\n", 304, "", "", false, nil},
		{"different ETag", "GET", "If-None-Match: \"other\"\r\n", 200, "0123456789", "", false, nil},
		{"failed If-Match", "GET", "If-Match: \"other\"\r\n", 412, "", "", false, nil},
		{"matching modification date", "GET", "If-Modified-Since: " + modified.Format(http.TimeFormat) + "\r\n", 304, "", "", false, nil},
		{"single range", "GET", "Range: bytes=0-2\r\n", 206, "012", "bytes 0-2/10", false, nil},
		{"suffix range", "GET", "Range: bytes=-3\r\n", 206, "789", "bytes 7-9/10", false, nil},
		{"open range", "GET", "Range: bytes=6-\r\n", 206, "6789", "bytes 6-9/10", false, nil},
		{"HEAD range", "HEAD", "Range: bytes=0-2\r\n", 206, "", "bytes 0-2/10", false, nil},
		{"unsatisfiable range", "GET", "Range: bytes=20-\r\n", 416, "", "bytes */10", true, nil},
		{"matching If-Range", "GET", "Range: bytes=0-2\r\nIf-Range: \"version-1\"\r\n", 206, "012", "bytes 0-2/10", false, nil},
		{"different If-Range", "GET", "Range: bytes=0-2\r\nIf-Range: \"other\"\r\n", 200, "0123456789", "", false, nil},
		{"multiple ranges", "GET", "Range: bytes=0-2,7-9\r\n", 206, "", "", false, assertMultipartRanges},
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("ETag", `"version-1"`)
				http.ServeContent(w, r, "data.txt", modified, strings.NewReader("0123456789"))
			}))
			defer stop()
			inv := t.Name()
			var ids []uint64
			for i, tc := range cases {
				t.Run(tc.name, func(t *testing.T) {
					id := uint64(i + 1)
					ids = append(ids, id)
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("%s /data HTTP/1.1\r\nHost: test\r\n%sConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", tc.method, tc.fields, inv, id))
					response, body := scenarioResponse(t, reader, tc.method)
					if response.StatusCode != tc.status || response.Header.Get("Content-Range") != tc.contentRange {
						t.Fatalf("status=%d range=%q", response.StatusCode, response.Header.Get("Content-Range"))
					}
					if tc.check != nil {
						tc.check(t, response, body)
					} else if !tc.ignoreBody && string(body) != tc.body {
						t.Fatalf("body=%q want=%q", body, tc.body)
					}
				})
			}
			assertCompletionIDs(t, inv, ids...)
		})
	}
}

func assertMultipartRanges(t *testing.T, response *http.Response, body []byte) {
	t.Helper()
	kind, params, err := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if err != nil || kind != "multipart/byteranges" {
		t.Fatalf("multipart content type: %v %v", kind, err)
	}
	parts := multipart.NewReader(bytes.NewReader(body), params["boundary"])
	for i, want := range []struct{ body, contentRange string }{
		{"012", "bytes 0-2/10"},
		{"789", "bytes 7-9/10"},
	} {
		part, err := parts.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		value, err := io.ReadAll(part)
		part.Close()
		if err != nil || string(value) != want.body || part.Header.Get("Content-Range") != want.contentRange {
			t.Fatalf("part %d: %q %v %v", i, value, part.Header, err)
		}
	}
	if _, err := parts.NextPart(); err != io.EOF {
		t.Fatalf("unexpected extra multipart data: %v", err)
	}
}

func TestHTTPExplicitContentEncodingPreservesWireBody(t *testing.T) {
	payload := bytes.Repeat([]byte{0, 255, 'a', 'b', 'c', '\r', '\n'}, 2048)
	var compressed bytes.Buffer
	zw := gzip.NewWriter(&compressed)
	if _, err := zw.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	for _, arm := range httpScenarioFactories {
		t.Run(arm.name, func(t *testing.T) {
			address, stop := arm.start(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body := payload
				if r.Header.Get("Accept-Encoding") == "gzip" {
					body = compressed.Bytes()
					w.Header().Set("Content-Encoding", "gzip")
				}
				w.Header().Set("Vary", "Accept-Encoding")
				w.Header().Set("Content-Length", strconv.Itoa(len(body)))
				w.Write(body)
			}))
			defer stop()
			inv := t.Name()
			for i, encoding := range []string{"gzip", "identity"} {
				t.Run(encoding, func(t *testing.T) {
					c, reader := scenarioConn(t, address)
					scenarioWrite(t, c, fmt.Sprintf("GET /data HTTP/1.1\r\nHost: test\r\nAccept-Encoding: %s\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", encoding, inv, i+1))
					response, body := scenarioResponse(t, reader, "GET")
					want := payload
					coding := ""
					if encoding == "gzip" {
						want = compressed.Bytes()
						coding = "gzip"
					}
					if response.StatusCode != 200 || !bytes.Equal(body, want) || response.Header.Get("Content-Encoding") != coding || response.ContentLength != int64(len(want)) || response.Header.Get("Vary") != "Accept-Encoding" {
						t.Fatalf("encoding=%s status=%d bytes=%d headers=%v", encoding, response.StatusCode, len(body), response.Header)
					}
				})
			}
			assertCompletionIDs(t, inv, 1, 2)
		})
	}
}
