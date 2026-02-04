package vercel

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRequestContext(t *testing.T) {
	rc := newRequestContext("inv-123", 42)

	if rc.invocationID != "inv-123" {
		t.Errorf("expected invocationID 'inv-123', got '%s'", rc.invocationID)
	}
	if rc.requestID != 42 {
		t.Errorf("expected requestID 42, got %d", rc.requestID)
	}
	if rc.waitGroup == nil {
		t.Error("waitGroup should not be nil")
	}
}

func TestContextStorage(t *testing.T) {
	rc := newRequestContext("inv-456", 99)
	ctx := withRequestContext(context.Background(), rc)

	retrieved := getRequestContext(ctx)
	if retrieved == nil {
		t.Fatal("expected to retrieve request context")
	}
	if retrieved.invocationID != "inv-456" {
		t.Errorf("expected invocationID 'inv-456', got '%s'", retrieved.invocationID)
	}
	if retrieved.requestID != 99 {
		t.Errorf("expected requestID 99, got %d", retrieved.requestID)
	}
}

func TestGetRequestContextNil(t *testing.T) {
	// Test with nil context
	rc := getRequestContext(nil)
	if rc != nil {
		t.Error("expected nil for nil context")
	}

	// Test with context without request context
	ctx := context.Background()
	rc = getRequestContext(ctx)
	if rc != nil {
		t.Error("expected nil for context without request context")
	}
}

func TestWaitUntilWithoutContext(t *testing.T) {
	// Without a valid request context, WaitUntil should execute synchronously
	executed := false
	WaitUntil(context.Background(), func() {
		executed = true
	})

	if !executed {
		t.Error("expected function to be executed synchronously")
	}
}

func TestWaitUntilWithContext(t *testing.T) {
	rc := newRequestContext("inv-789", 1)
	ctx := withRequestContext(context.Background(), rc)

	var wg sync.WaitGroup
	wg.Add(1)

	executed := false
	WaitUntil(ctx, func() {
		executed = true
		wg.Done()
	})

	// Wait for the background task
	rc.waitGroup.Wait()
	wg.Wait()

	if !executed {
		t.Error("expected function to be executed")
	}
}

func TestInvocationID(t *testing.T) {
	rc := newRequestContext("test-inv-id", 1)
	ctx := withRequestContext(context.Background(), rc)

	id := InvocationID(ctx)
	if id != "test-inv-id" {
		t.Errorf("expected 'test-inv-id', got '%s'", id)
	}

	// Without context
	id = InvocationID(context.Background())
	if id != "" {
		t.Errorf("expected empty string, got '%s'", id)
	}
}

func TestRequestID(t *testing.T) {
	rc := newRequestContext("inv", 123)
	ctx := withRequestContext(context.Background(), rc)

	id := RequestID(ctx)
	if id != 123 {
		t.Errorf("expected 123, got %d", id)
	}

	// Without context
	id = RequestID(context.Background())
	if id != 0 {
		t.Errorf("expected 0, got %d", id)
	}
}

func TestFluidResponseWriter(t *testing.T) {
	rec := httptest.NewRecorder()
	w := newFluidResponseWriter(rec)

	if w.IsStreaming() {
		t.Error("should not be streaming initially")
	}

	w.Flush()

	if !w.IsStreaming() {
		t.Error("should be streaming after Flush")
	}

	// Test Unwrap
	if w.Unwrap() != rec {
		t.Error("Unwrap should return underlying ResponseWriter")
	}
}

func TestFluidResponseWriterWrite(t *testing.T) {
	rec := httptest.NewRecorder()
	w := newFluidResponseWriter(rec)

	data := []byte("Hello, World!")
	n, err := w.Write(data)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if n != len(data) {
		t.Errorf("expected %d bytes written, got %d", len(data), n)
	}

	if rec.Body.String() != "Hello, World!" {
		t.Errorf("expected 'Hello, World!', got '%s'", rec.Body.String())
	}
}

func TestIsStreamingContentType(t *testing.T) {
	tests := []struct {
		contentType string
		expected    bool
	}{
		{"text/event-stream", true},
		{"TEXT/EVENT-STREAM", true},
		{"application/x-ndjson", true},
		{"application/stream+json", true},
		{"application/json", false},
		{"text/html", false},
		{"text/plain", false},
	}

	for _, tt := range tests {
		result := isStreamingContentType(tt.contentType)
		if result != tt.expected {
			t.Errorf("isStreamingContentType(%q) = %v, expected %v",
				tt.contentType, result, tt.expected)
		}
	}
}

func TestHealthCheck(t *testing.T) {
	// Create a test handler
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("user handler"))
	})

	r, err := NewRuntime(handler)
	if err != nil {
		t.Fatalf("failed to create runtime: %v", err)
	}

	wrappedHandler := r.wrapHandler()

	// Test health check endpoint
	req := httptest.NewRequest(http.MethodGet, "/_vercel/ping", nil)
	rec := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", rec.Code)
	}
}

func TestHeaderExtraction(t *testing.T) {
	var capturedReq *http.Request

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedReq = r
		w.Write([]byte("ok"))
	})

	r, err := NewRuntime(handler)
	if err != nil {
		t.Fatalf("failed to create runtime: %v", err)
	}

	wrappedHandler := r.wrapHandler()

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	req.Header.Set("x-vercel-internal-invocation-id", "test-inv-id")
	req.Header.Set("x-vercel-internal-request-id", "42")
	req.Header.Set("x-vercel-internal-span-id", "span-123")
	req.Header.Set("x-vercel-internal-trace-id", "trace-456")

	rec := httptest.NewRecorder()
	wrappedHandler.ServeHTTP(rec, req)

	// Verify headers were removed from the request passed to user handler
	if capturedReq.Header.Get("x-vercel-internal-invocation-id") != "" {
		t.Error("x-vercel-internal-invocation-id should be removed")
	}
	if capturedReq.Header.Get("x-vercel-internal-request-id") != "" {
		t.Error("x-vercel-internal-request-id should be removed")
	}
	if capturedReq.Header.Get("x-vercel-internal-span-id") != "" {
		t.Error("x-vercel-internal-span-id should be removed")
	}
	if capturedReq.Header.Get("x-vercel-internal-trace-id") != "" {
		t.Error("x-vercel-internal-trace-id should be removed")
	}

	// Verify context was set correctly
	rc := getRequestContext(capturedReq.Context())
	if rc == nil {
		t.Fatal("expected request context to be set")
	}
	if rc.invocationID != "test-inv-id" {
		t.Errorf("expected invocationID 'test-inv-id', got '%s'", rc.invocationID)
	}
	if rc.requestID != 42 {
		t.Errorf("expected requestID 42, got %d", rc.requestID)
	}
}

func TestPanicRecovery(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("test panic")
	})

	r, err := NewRuntime(handler)
	if err != nil {
		t.Fatalf("failed to create runtime: %v", err)
	}

	wrappedHandler := r.wrapHandler()

	req := httptest.NewRequest(http.MethodGet, "/test", nil)
	rec := httptest.NewRecorder()

	// Should not panic
	wrappedHandler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Errorf("expected status 500, got %d", rec.Code)
	}
}

// IPC Tests

func TestIPCClientNilWhenNoPath(t *testing.T) {
	// Ensure VERCEL_IPC_PATH is not set
	os.Unsetenv("VERCEL_IPC_PATH")

	client, err := NewIPCClient()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if client != nil {
		t.Error("expected nil client when VERCEL_IPC_PATH is not set")
	}
}

func TestIPCMessages(t *testing.T) {
	// Create a temporary Unix socket
	tmpDir := t.TempDir()
	socketPath := filepath.Join(tmpDir, "test.sock")

	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	defer listener.Close()

	// Set up environment
	os.Setenv("VERCEL_IPC_PATH", socketPath)
	defer os.Unsetenv("VERCEL_IPC_PATH")

	// Collect received messages
	var receivedMsgs []string
	var msgMu sync.Mutex
	done := make(chan struct{})

	go func() {
		conn, err := listener.Accept()
		if err != nil {
			return
		}
		defer conn.Close()

		buf := make([]byte, 4096)
		for {
			n, err := conn.Read(buf)
			if err != nil {
				break
			}
			msgMu.Lock()
			// Split by null terminator
			msgs := strings.Split(string(buf[:n]), "\x00")
			for _, msg := range msgs {
				if msg != "" {
					receivedMsgs = append(receivedMsgs, msg)
				}
			}
			msgMu.Unlock()
		}
		close(done)
	}()

	// Create IPC client
	client, err := NewIPCClient()
	if err != nil {
		t.Fatalf("failed to create IPC client: %v", err)
	}
	defer client.Close()

	// Send server-started message
	err = client.SendServerStarted(100, 3000)
	if err != nil {
		t.Fatalf("failed to send server-started: %v", err)
	}

	// Send handler-started message
	err = client.SendHandlerStarted("inv-123", 1, 1704067200000)
	if err != nil {
		t.Fatalf("failed to send handler-started: %v", err)
	}

	// Send log message
	err = client.SendLog("inv-123", 1, "info", "test log message")
	if err != nil {
		t.Fatalf("failed to send log: %v", err)
	}

	// Send end message
	err = client.SendEnd("inv-123", 1, nil)
	if err != nil {
		t.Fatalf("failed to send end: %v", err)
	}

	// Close client to trigger server read to complete
	client.Close()

	// Wait for server to process
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for messages")
	}

	// Verify messages
	msgMu.Lock()
	defer msgMu.Unlock()

	if len(receivedMsgs) < 4 {
		t.Fatalf("expected at least 4 messages, got %d", len(receivedMsgs))
	}

	// Verify server-started
	var serverStarted ipcMessage
	if err := json.Unmarshal([]byte(receivedMsgs[0]), &serverStarted); err != nil {
		t.Fatalf("failed to parse server-started: %v", err)
	}
	if serverStarted.Type != "server-started" {
		t.Errorf("expected type 'server-started', got '%s'", serverStarted.Type)
	}

	// Verify handler-started
	var handlerStarted ipcMessage
	if err := json.Unmarshal([]byte(receivedMsgs[1]), &handlerStarted); err != nil {
		t.Fatalf("failed to parse handler-started: %v", err)
	}
	if handlerStarted.Type != "handler-started" {
		t.Errorf("expected type 'handler-started', got '%s'", handlerStarted.Type)
	}

	// Verify log
	var logMsg ipcMessage
	if err := json.Unmarshal([]byte(receivedMsgs[2]), &logMsg); err != nil {
		t.Fatalf("failed to parse log: %v", err)
	}
	if logMsg.Type != "log" {
		t.Errorf("expected type 'log', got '%s'", logMsg.Type)
	}

	// Verify the log message is base64 encoded
	payload := logMsg.Payload.(map[string]interface{})
	encodedMsg := payload["message"].(string)
	decoded, err := base64.StdEncoding.DecodeString(encodedMsg)
	if err != nil {
		t.Fatalf("failed to decode log message: %v", err)
	}
	if string(decoded) != "test log message" {
		t.Errorf("expected 'test log message', got '%s'", string(decoded))
	}

	// Verify end
	var endMsg ipcMessage
	if err := json.Unmarshal([]byte(receivedMsgs[3]), &endMsg); err != nil {
		t.Fatalf("failed to parse end: %v", err)
	}
	if endMsg.Type != "end" {
		t.Errorf("expected type 'end', got '%s'", endMsg.Type)
	}
}

// HTTP Transport instrumentation tests

func TestInstrumentedTransport(t *testing.T) {
	// Create a test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	}))
	defer server.Close()

	// Create instrumented client
	client := NewClient()

	// Make a request
	resp, err := client.Get(server.URL + "/test")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "ok" {
		t.Errorf("expected 'ok', got '%s'", string(body))
	}
}

func TestInstrumentedTransportWithContext(t *testing.T) {
	// Create a test server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create request context
	rc := newRequestContext("inv-transport-test", 99)
	ctx := withRequestContext(context.Background(), rc)

	// Make a request with context
	resp, err := Get(ctx, server.URL+"/api/test")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}
