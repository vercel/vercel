package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestHTTPServicePrefixAndRequestTargets(t *testing.T) {
	type observation struct {
		Method, URI, Host, Pad, Body, Internal, Forwarded, TE string
		Fields                                                int
	}
	var calls atomic.Int32
	address, stop := startOriginalProxyWithOptions(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
			return
		}
		json.NewEncoder(w).Encode(observation{r.Method, r.RequestURI, r.Host, r.Header.Get("X-Pad"), string(body), r.Header.Get("X-Vercel-Internal-Secret"), r.Header.Get("X-Forwarded-For"), r.Header.Get("Te"), len(r.Header.Values("X-Pad"))})
	}), proxyTestOptions{prefix: "/svc/", strip: true})
	defer stop()
	cases := []struct {
		name, line, fields, uri, body, pad, forwarded, te string
		padFields                                         int
		handled                                           bool
		lf                                                bool
	}{
		{name: "ordinary", line: "GET /svc/path?a=1&b=2 HTTP/1.1", uri: "/path?a=1&b=2"},
		{name: "forwarded empty fields", line: "GET /svc/path HTTP/1.1", fields: "X-Forwarded-For: \r\nX-Forwarded-For: 1.2.3.4\r\n", uri: "/path", forwarded: ", 1.2.3.4, 127.0.0.1"},
		{name: "TE trailers", line: "GET /svc/path HTTP/1.1", fields: "Te: trailers\r\n", uri: "/path", te: "trailers"},
		{name: "query with semicolon", line: "GET /svc/path?a=1;b=2&c=3 HTTP/1.1", uri: "/path?a=1;b=2&c=3"},
		{name: "exact prefix", line: "GET /svc HTTP/1.1", uri: "/"},
		{name: "other prefix", line: "GET /svc2/path HTTP/1.1", uri: "/svc2/path"},
		{name: "encoded path", line: "GET /svc/a%2Fb%20c?q=%2F HTTP/1.1", uri: "/a/b%20c?q=%2F"},
		{name: "encoded health", line: "GET /%5fvercel/ping HTTP/1.1", handled: true},
		{name: "health", line: "GET /_vercel/ping HTTP/1.1", handled: true},
		{name: "dot segments", line: "GET /svc/a/../b HTTP/1.1", uri: "/a/../b"},
		{name: "double separators", line: "GET /svc//b HTTP/1.1", uri: "//b"},
		{name: "HTTP 1.0", line: "GET /svc/path HTTP/1.0", uri: "/path"},
		{name: "absolute form", line: "GET http://origin.example/svc/path?x=1 HTTP/1.1", uri: "/path?x=1"},
		{name: "asterisk", line: "OPTIONS * HTTP/1.1", handled: true},
		{name: "large headers", line: "GET /svc/path HTTP/1.1", fields: "X-Pad: " + strings.Repeat("x", 40<<10) + "\r\n", uri: "/path", pad: strings.Repeat("x", 40<<10), padFields: 1},
		{name: "many fields", line: "GET /svc/path HTTP/1.1", fields: strings.Repeat("X-Pad: x\r\n", 150), uri: "/path", pad: "x", padFields: 150},
		{name: "equal lengths", line: "POST /svc/path HTTP/1.1", fields: "Content-Length: 1\r\nContent-Length: 1\r\n", uri: "/path", body: "x"},
		{name: "LF delimiters", line: "GET /svc/path HTTP/1.1", uri: "/path", lf: true},
	}
	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			inv := t.Name()
			c, reader := scenarioConn(t, address)
			method := strings.Fields(tc.line)[0]
			wire := fmt.Sprintf("%s\r\n%sHost: incoming.example\r\nX-Forwarded-Host: app.example\r\nX-Vercel-Internal-Secret: secret\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n%s", tc.line, tc.fields, inv, i+1, tc.body)
			if tc.lf {
				wire = strings.ReplaceAll(wire, "\r\n", "\n")
			}
			scenarioWrite(t, c, wire)
			response, body := scenarioResponse(t, reader, method)
			if response.StatusCode != 200 {
				t.Fatalf("status=%d body=%q", response.StatusCode, body)
			}
			if tc.handled {
				want := "OK"
				if method == "OPTIONS" {
					want = ""
				}
				if string(body) != want {
					t.Fatalf("built-in response=%q want=%q", body, want)
				}
				assertCompletionIDs(t, inv)
				return
			}
			forwarded := tc.forwarded
			if forwarded == "" {
				forwarded = "127.0.0.1"
			}
			want := observation{method, tc.uri, "app.example", tc.pad, tc.body, "", forwarded, tc.te, tc.padFields}
			var got observation
			if err := json.Unmarshal(body, &got); err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("observation=%+v want=%+v error=%v", got, want, err)
			}
			assertCompletionIDs(t, inv, uint64(i+1))
		})
	}
	if got := calls.Load(); got != int32(len(cases)-3) {
		t.Fatalf("application calls=%d", got)
	}
}

func TestHTTPKeepAliveMetadataAndHealth(t *testing.T) {
	var calls atomic.Int32
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		for key := range r.Header {
			if strings.HasPrefix(strings.ToLower(key), "x-vercel-internal-") {
				t.Errorf("internal header forwarded: %s", key)
			}
		}
		if r.Header.Get("X-Forwarded-For") != "127.0.0.1" {
			t.Errorf("forwarded address=%q", r.Header.Get("X-Forwarded-For"))
		}
		io.WriteString(w, r.Host)
	}))
	defer stop()
	c, reader := scenarioConn(t, address)
	inv := t.Name()
	for id := 1; id <= 8; id++ {
		host := fmt.Sprintf("request-%d.example", id)
		scenarioWrite(t, c, fmt.Sprintf("GET /metadata HTTP/1.1\r\nHost: incoming\r\nX-Forwarded-Host: %s\r\nX-Vercel-Internal-Secret: private\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: %d\r\n\r\n", host, inv, id))
		response, body := scenarioResponse(t, reader, "GET")
		if response.StatusCode != 200 || response.Close || string(body) != host {
			t.Fatalf("metadata request %d: status=%d close=%v host=%q", id, response.StatusCode, response.Close, body)
		}
		if id == 4 {
			scenarioWrite(t, c, "GET /_vercel/ping HTTP/1.1\r\nHost: test\r\nX-Vercel-Internal-Invocation-Id: health\r\nX-Vercel-Internal-Request-Id: 999\r\n\r\n")
			response, body := scenarioResponse(t, reader, "GET")
			if response.StatusCode != 200 || string(body) != "OK" || calls.Load() != 4 {
				t.Fatalf("health request: status=%d body=%q app calls=%d", response.StatusCode, body, calls.Load())
			}
		}
	}
	assertCompletionIDs(t, inv, 1, 2, 3, 4, 5, 6, 7, 8)
	assertCompletionIDs(t, "health")
	if calls.Load() != 8 {
		t.Fatalf("application calls=%d", calls.Load())
	}
}

func TestHTTPServicePrefixStripConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, prefix string
		strip        bool
		want         string
	}{
		{"disabled", "/svc", false, "/svc/path"},
		{"enabled", "/svc", true, "/path"},
		{"normalized", " svc/// ", true, "/path"},
		{"root", "/", true, "/svc/path"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			address, stop := startOriginalProxyWithOptions(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, r.RequestURI) }), proxyTestOptions{prefix: tc.prefix, strip: tc.strip})
			defer stop()
			c, reader := scenarioConn(t, address)
			scenarioWrite(t, c, fmt.Sprintf("GET /svc/path HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", t.Name()))
			response, body := scenarioResponse(t, reader, "GET")
			if response.StatusCode != 200 || string(body) != tc.want {
				t.Fatalf("status=%d path=%q want=%q", response.StatusCode, body, tc.want)
			}
			assertCompletionIDs(t, t.Name(), 1)
		})
	}
}

func TestHTTPStartsWithoutIPCCollector(t *testing.T) {
	address, stop := startOriginalProxyWithOptions(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, r.URL.Path) }), proxyTestOptions{noIPC: true})
	defer stop()
	for _, path := range []string{"/_vercel/ping", "/local"} {
		c, reader := scenarioConn(t, address)
		scenarioWrite(t, c, "GET "+path+" HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n")
		response, body := scenarioResponse(t, reader, "GET")
		want := path
		if path == "/_vercel/ping" {
			want = "OK"
		}
		if response.StatusCode != 200 || string(body) != want {
			t.Fatalf("status=%d body=%q", response.StatusCode, body)
		}
	}
}

func TestHTTPRequestCanRemainActiveBeyondFifteenSeconds(t *testing.T) {
	address, stop := startOriginalProxy(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-time.After(16 * time.Second):
			io.WriteString(w, "completed")
		case <-r.Context().Done():
		}
	}))
	defer stop()
	c, reader := scenarioConn(t, address)
	c.SetDeadline(time.Now().Add(25 * time.Second))
	scenarioWrite(t, c, fmt.Sprintf("GET /slow HTTP/1.1\r\nHost: test\r\nConnection: close\r\nX-Vercel-Internal-Invocation-Id: %s\r\nX-Vercel-Internal-Request-Id: 1\r\n\r\n", t.Name()))
	response, body := scenarioResponse(t, reader, "GET")
	if response.StatusCode != 200 || string(body) != "completed" {
		t.Fatalf("status=%d body=%q", response.StatusCode, body)
	}
	assertCompletionIDs(t, t.Name(), 1)
}
