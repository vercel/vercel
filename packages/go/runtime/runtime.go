package vercel

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	// DefaultPort is the default HTTP port for the runtime
	DefaultPort = 3000

	// WaitUntilTimeout is the maximum time to wait for background tasks
	WaitUntilTimeout = 30 * time.Second

	// Header names for Vercel internal context
	HeaderInvocationID = "x-vercel-internal-invocation-id"
	HeaderRequestID    = "x-vercel-internal-request-id"
	HeaderSpanID       = "x-vercel-internal-span-id"
	HeaderTraceID      = "x-vercel-internal-trace-id"
)

// Runtime is the Vercel Fluid runtime
type Runtime struct {
	handler   http.Handler
	ipc       *IPCClient
	server    *http.Server
	listener  net.Listener
	startTime time.Time
	port      int

	// For tracking active requests
	activeRequests sync.WaitGroup
}

// NewRuntime creates a new Vercel runtime instance
func NewRuntime(handler http.Handler) (*Runtime, error) {
	startTime := time.Now()

	ipc, err := NewIPCClient()
	if err != nil {
		return nil, fmt.Errorf("failed to create IPC client: %w", err)
	}

	port := DefaultPort
	if portStr := os.Getenv("PORT"); portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil {
			port = p
		}
	}

	r := &Runtime{
		handler:   handler,
		ipc:       ipc,
		startTime: startTime,
		port:      port,
	}

	return r, nil
}

// ListenAndServe starts the HTTP server and begins handling requests
func (r *Runtime) ListenAndServe() error {
	// Create listener
	addr := fmt.Sprintf(":%d", r.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen on %s: %w", addr, err)
	}
	r.listener = listener

	// Get actual port (in case port 0 was used)
	r.port = listener.Addr().(*net.TCPAddr).Port

	// Create server with our handler wrapper
	r.server = &http.Server{
		Handler: r.wrapHandler(),
	}

	// Calculate init duration
	initDuration := time.Since(r.startTime).Milliseconds()

	// Send server-started IPC message
	if r.ipc != nil {
		if err := r.ipc.SendServerStarted(int(initDuration), r.port); err != nil {
			// Log error but continue - don't fail startup
			fmt.Fprintf(os.Stderr, "vercel: failed to send server-started: %v\n", err)
		}
	}

	// Print for dev server detection
	fmt.Printf("Dev server listening: %d\n", r.port)

	// Handle graceful shutdown
	go r.handleShutdown()

	// Start serving
	if err := r.server.Serve(listener); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("server error: %w", err)
	}

	return nil
}

// wrapHandler creates an http.Handler that wraps the user's handler with
// Vercel runtime functionality
func (r *Runtime) wrapHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		// Handle health check
		if req.URL.Path == "/_vercel/ping" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Extract Vercel context headers
		invocationID := req.Header.Get(HeaderInvocationID)
		requestIDStr := req.Header.Get(HeaderRequestID)
		requestID := 0
		if requestIDStr != "" {
			requestID, _ = strconv.Atoi(requestIDStr)
		}

		// Remove internal headers before passing to user code
		req.Header.Del(HeaderInvocationID)
		req.Header.Del(HeaderRequestID)
		req.Header.Del(HeaderSpanID)
		req.Header.Del(HeaderTraceID)

		// Create request context
		rc := newRequestContext(invocationID, requestID)
		ctx := withRequestContext(req.Context(), rc)
		req = req.WithContext(ctx)

		// Track active request
		r.activeRequests.Add(1)
		defer r.activeRequests.Done()

		// Record handler start time
		handlerStartedAt := time.Now().UnixMilli()

		// Send handler-started IPC message
		if r.ipc != nil && invocationID != "" {
			r.ipc.SendHandlerStarted(invocationID, requestID, handlerStartedAt)
		}

		// Create wrapped response writer for streaming detection
		wrappedWriter := newFluidResponseWriter(w)

		// Call user handler
		var handlerErr error
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					handlerErr = fmt.Errorf("panic: %v", rec)
					http.Error(wrappedWriter, "Internal Server Error", http.StatusInternalServerError)
				}
			}()
			r.handler.ServeHTTP(wrappedWriter, req)
		}()

		// Wait for background tasks (waitUntil) with timeout
		done := make(chan struct{})
		go func() {
			rc.waitGroup.Wait()
			close(done)
		}()

		select {
		case <-done:
			// All tasks completed
		case <-time.After(WaitUntilTimeout):
			// Timeout reached
			if r.ipc != nil {
				r.ipc.SendLog(invocationID, requestID, "warn",
					"waitUntil tasks did not complete within 30 seconds")
			}
		}

		// Send end IPC message
		if r.ipc != nil && invocationID != "" {
			r.ipc.SendEnd(invocationID, requestID, handlerErr)
		}
	})
}

// handleShutdown handles graceful shutdown on SIGINT/SIGTERM
func (r *Runtime) handleShutdown() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	// Flush any buffered logs to stderr
	if r.ipc != nil {
		r.ipc.FlushToStderr()
	}

	// Create shutdown context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Wait for active requests
	done := make(chan struct{})
	go func() {
		r.activeRequests.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-ctx.Done():
	}

	// Shutdown server
	r.server.Shutdown(ctx)

	// Close IPC
	if r.ipc != nil {
		r.ipc.Close()
	}
}

// fluidResponseWriter wraps http.ResponseWriter to support streaming detection
type fluidResponseWriter struct {
	http.ResponseWriter
	flushed bool
}

func newFluidResponseWriter(w http.ResponseWriter) *fluidResponseWriter {
	return &fluidResponseWriter{ResponseWriter: w}
}

// Flush implements http.Flusher and marks the response as streaming
func (w *fluidResponseWriter) Flush() {
	w.flushed = true
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

// IsStreaming returns whether the response has been flushed (streaming)
func (w *fluidResponseWriter) IsStreaming() bool {
	return w.flushed
}

// Unwrap returns the underlying ResponseWriter (for http.ResponseController)
func (w *fluidResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

// Hijack implements http.Hijacker if the underlying writer supports it
func (w *fluidResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hijacker, ok := w.ResponseWriter.(http.Hijacker); ok {
		return hijacker.Hijack()
	}
	return nil, nil, fmt.Errorf("underlying ResponseWriter does not support hijacking")
}

// Push implements http.Pusher if the underlying writer supports it
func (w *fluidResponseWriter) Push(target string, opts *http.PushOptions) error {
	if pusher, ok := w.ResponseWriter.(http.Pusher); ok {
		return pusher.Push(target, opts)
	}
	return http.ErrNotSupported
}

// isStreamingContentType checks if the content type indicates streaming
func isStreamingContentType(contentType string) bool {
	contentType = strings.ToLower(contentType)
	return strings.Contains(contentType, "text/event-stream") ||
		strings.Contains(contentType, "application/x-ndjson") ||
		strings.Contains(contentType, "application/stream+json")
}
