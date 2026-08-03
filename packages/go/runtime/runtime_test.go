package vercel

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestControlFrameEncoding(t *testing.T) {
	reader, cleanup := useControlPipe(t)
	defer cleanup()

	if !sendFrame("test", "request-key", map[string]interface{}{"ok": true}) {
		t.Fatal("sendFrame returned false")
	}
	frame := readControlFrame(t, reader)
	if frame.Version != 1 || frame.Type != "test" || frame.RequestKey != "request-key" {
		t.Fatalf("unexpected frame: %+v", frame)
	}
	payload := frame.Payload.(map[string]interface{})
	if payload["ok"] != true {
		t.Fatalf("unexpected payload: %#v", payload)
	}
}

func TestRuntimeHandlerContextHeadersAndCompletion(t *testing.T) {
	reader, cleanup := useControlPipe(t)
	defer cleanup()

	var gotInvocation string
	var gotRequest uint64
	handler := runtimeHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotInvocation = InvocationID(r.Context())
		gotRequest = RequestID(r.Context())
		for _, header := range []string{requestKeyHeader, invocationIDHeader, requestIDHeader} {
			if value := r.Header.Get(header); value != "" {
				t.Errorf("internal header %s reached handler: %q", header, value)
			}
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("passed through"))
	}))

	req := httptest.NewRequest(http.MethodGet, "http://example.test/path", nil)
	req.Header.Set(requestKeyHeader, "key-1")
	req.Header.Set(invocationIDHeader, "invocation-123")
	req.Header.Set(requestIDHeader, "42")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusCreated || recorder.Body.String() != "passed through" {
		t.Fatalf("response was not passed through: %d %q", recorder.Code, recorder.Body.String())
	}
	if gotInvocation != "invocation-123" || gotRequest != 42 {
		t.Fatalf("unexpected IDs: invocation=%s request=%d", gotInvocation, gotRequest)
	}
	frame := readControlFrame(t, reader)
	if frame.Type != "request-complete" || frame.RequestKey != "key-1" || frame.Payload != nil {
		t.Fatalf("unexpected completion frame: %+v", frame)
	}
}

func TestWaitUntilLifecycleAndPanicRecovery(t *testing.T) {
	reader, cleanup := useControlPipe(t)
	defer cleanup()

	ctx := context.WithValue(context.Background(), requestKeyContextKey, "wait-key")
	releaseTask := make(chan struct{})
	done := make(chan struct{})
	WaitUntil(ctx, func() {
		defer close(done)
		<-releaseTask
		panic("recovered")
	})

	retain := readControlFrame(t, reader)
	if retain.Type != "retain" || retain.RequestKey != "wait-key" {
		t.Fatalf("unexpected retain frame: %+v", retain)
	}
	select {
	case <-done:
		t.Fatal("task started before test released it")
	default:
	}
	close(releaseTask)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("task did not complete")
	}
	release := readControlFrame(t, reader)
	if release.Type != "release" || release.RequestKey != "wait-key" {
		t.Fatalf("unexpected release frame: %+v", release)
	}
	waitDone := make(chan struct{})
	go func() {
		tasks.Wait()
		close(waitDone)
	}()
	select {
	case <-waitDone:
	case <-time.After(time.Second):
		t.Fatal("global task tracking did not drain")
	}
}

func TestLoggingProtocolAndStderrFallback(t *testing.T) {
	reader, cleanup := useControlPipe(t)
	defer cleanup()
	ctx := context.WithValue(context.Background(), requestKeyContextKey, "log-key")
	Warn(ctx, "problem 7")
	frame := readControlFrame(t, reader)

	if frame.Type != "log" || frame.RequestKey != "log-key" {
		t.Fatalf("unexpected log frame: %+v", frame)
	}
	payload := frame.Payload.(map[string]interface{})
	if payload["level"] != "warn" || payload["message"] != "problem 7" {
		t.Fatalf("unexpected log payload: %#v", payload)
	}

	oldStderr := os.Stderr
	stderrReader, stderrWriter, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stderr = stderrWriter
	Info(context.Background(), "fallback")
	_ = stderrWriter.Close()
	os.Stderr = oldStderr
	data, err := io.ReadAll(stderrReader)
	if err != nil {
		t.Fatal(err)
	}
	_ = stderrReader.Close()
	if string(data) != "[info] fallback\n" {
		t.Fatalf("unexpected stderr fallback: %q", data)
	}
}

func TestTransportMetricAndPassThrough(t *testing.T) {
	reader, cleanup := useControlPipe(t)
	defer cleanup()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/hello world" || r.URL.RawQuery != "x=1" {
			t.Errorf("unexpected upstream request: %s %s", r.Method, r.URL.String())
		}
		body, _ := io.ReadAll(r.Body)
		if string(body) != "body" {
			t.Errorf("unexpected body: %q", body)
		}
		w.Header().Set("X-Upstream", "yes")
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("response"))
	}))
	defer server.Close()

	ctx := context.WithValue(context.Background(), requestKeyContextKey, "fetch-key")
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/hello%20world?x=1", strings.NewReader("body"))
	if err != nil {
		t.Fatal(err)
	}
	response, err := NewClient().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	responseBody, err := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusAccepted || response.Header.Get("X-Upstream") != "yes" || string(responseBody) != "response" {
		t.Fatalf("response was not passed through: status=%d header=%q body=%q", response.StatusCode, response.Header.Get("X-Upstream"), responseBody)
	}

	frame := readControlFrame(t, reader)
	if frame.Type != "fetch-metric" || frame.RequestKey != "fetch-key" {
		t.Fatalf("unexpected metric frame: %+v", frame)
	}
	payload := frame.Payload.(map[string]interface{})
	if payload["pathname"] != "/hello world" || payload["search"] != "x=1" || payload["method"] != "POST" {
		t.Fatalf("unexpected metric URL fields: %#v", payload)
	}
	if payload["statusCode"] != float64(http.StatusAccepted) || payload["id"].(float64) <= 0 {
		t.Fatalf("unexpected metric result fields: %#v", payload)
	}
	if payload["host"] == "" || payload["start"].(float64) <= 0 || payload["duration"].(float64) < 0 {
		t.Fatalf("unexpected metric timing fields: %#v", payload)
	}
}

func TestInstrumentClientRetainsClientSettings(t *testing.T) {
	client := &http.Client{Timeout: 3 * time.Second}
	result := InstrumentClient(client)
	if result != client || client.Timeout != 3*time.Second {
		t.Fatal("InstrumentClient did not instrument in place")
	}
	if _, ok := client.Transport.(*Transport); !ok {
		t.Fatalf("unexpected transport type: %T", client.Transport)
	}
	if InstrumentClient(client) != client {
		t.Fatal("repeated instrumentation changed the client")
	}
}

func useControlPipe(t *testing.T) (*bufio.Reader, func()) {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv(controlFDEnv, formatFD(writer.Fd()))
	controlState.Lock()
	controlState.fd = ""
	controlState.file = nil
	controlState.Unlock()

	cleaned := false
	cleanup := func() {
		if cleaned {
			return
		}
		cleaned = true
		_ = writer.Close()
		_ = reader.Close()
		controlState.Lock()
		controlState.fd = ""
		controlState.file = nil
		controlState.Unlock()
	}
	return bufio.NewReader(reader), cleanup
}

func formatFD(fd uintptr) string {
	return strconv.FormatUint(uint64(fd), 10)
}

func readControlFrame(t *testing.T, reader *bufio.Reader) controlFrame {
	t.Helper()
	var length uint32
	if err := binary.Read(reader, binary.BigEndian, &length); err != nil {
		t.Fatal(err)
	}
	body := make([]byte, length)
	if _, err := io.ReadFull(reader, body); err != nil {
		t.Fatal(err)
	}
	var frame controlFrame
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(&frame); err != nil {
		t.Fatalf("invalid frame JSON %q: %v", body, err)
	}
	return frame
}
