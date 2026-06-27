// proxy.go - IPC proxy for standalone servers on Vercel.
// This handles the IPC protocol required for executable runtime mode.
//
// The proxy:
// 1. Connects to VERCEL_IPC_PATH Unix socket
// 2. Starts the user's server on an internal port
// 3. Sends "server-started" IPC message
// 4. Reverse proxies requests to user's server
// 5. Handles /_vercel/ping health check
// 6. Sends "end" IPC message after each request

package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

// hijackAwareResponseWriter reports when an HTTP protocol upgrade has written
// and flushed its handshake response. ReverseProxy performs the hijack only
// after receiving and validating a 101 response from the upstream server.
//
// Unwrap preserves optional ResponseWriter capabilities used by ReverseProxy
// for ordinary and streaming HTTP responses.
type hijackAwareResponseWriter struct {
	http.ResponseWriter
	onUpgrade func()
}

func (w *hijackAwareResponseWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func (w *hijackAwareResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	conn, readWriter, err := http.NewResponseController(w.ResponseWriter).Hijack()
	if err != nil {
		return conn, readWriter, err
	}

	upgradeWriter := &upgradeHandshakeWriter{
		writer:     readWriter.Writer,
		onComplete: w.onUpgrade,
	}
	return conn, bufio.NewReadWriter(
		readWriter.Reader,
		bufio.NewWriter(upgradeWriter),
	), nil
}

type upgradeHandshakeWriter struct {
	writer     *bufio.Writer
	onComplete func()
	header     bytes.Buffer
	complete   bool
}

func (w *upgradeHandshakeWriter) Write(data []byte) (int, error) {
	written, err := w.writer.Write(data)
	if err != nil {
		return written, err
	}
	if err := w.writer.Flush(); err != nil {
		return written, err
	}

	if !w.complete && written > 0 {
		_, _ = w.header.Write(data[:written])
		if bytes.Contains(w.header.Bytes(), []byte("\r\n\r\n")) {
			w.complete = true
			w.header.Reset()
			if w.onComplete != nil {
				w.onComplete()
			}
		}
	}

	return written, nil
}

func onceCallback(callback func()) func() {
	var once sync.Once
	return func() {
		once.Do(callback)
	}
}

func serveWithUpgradeLifecycle(
	handler http.Handler,
	w http.ResponseWriter,
	r *http.Request,
	onEnd func(),
) {
	endRequest := onceCallback(onEnd)
	handler.ServeHTTP(&hijackAwareResponseWriter{
		ResponseWriter: w,
		onUpgrade:      endRequest,
	}, r)
	endRequest()
}

// IPC message types
type StartMessage struct {
	Type    string       `json:"type"`
	Payload StartPayload `json:"payload"`
}

type StartPayload struct {
	InitDuration int `json:"initDuration"`
	HTTPPort     int `json:"httpPort"`
}

type EndMessage struct {
	Type    string     `json:"type"`
	Payload EndPayload `json:"payload"`
}

type EndPayload struct {
	Context RequestContext `json:"context"`
	Error   interface{}    `json:"error,omitempty"`
}

type RequestContext struct {
	InvocationID string `json:"invocationId"`
	RequestID    uint64 `json:"requestId"`
}

type UnrecoverableErrorMessage struct {
	Type    string                    `json:"type"`
	Payload UnrecoverableErrorPayload `json:"payload"`
}

type UnrecoverableErrorPayload struct {
	ExitCode int    `json:"exitCode"`
	Message  string `json:"message"`
}

var (
	ipcConn   net.Conn
	ipcMutex  sync.Mutex
	ipcReady  bool
	startTime time.Time
)

func sendIPCMessage(msg interface{}) error {
	if ipcConn == nil {
		return nil
	}

	ipcMutex.Lock()
	defer ipcMutex.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	// IPC messages are JSON followed by null byte
	_, err = ipcConn.Write(append(data, 0))
	return err
}

// fatal reports an unrecoverable error via IPC and exits.
func fatal(exitCode int, msg string) {
	fmt.Fprintln(os.Stderr, msg)
	sendIPCMessage(UnrecoverableErrorMessage{
		Type: "unrecoverable-error",
		Payload: UnrecoverableErrorPayload{
			ExitCode: exitCode,
			Message:  msg,
		},
	})
	os.Exit(proxyExitCode(exitCode))
}

// childExitCode derives the user server exit code to report from a cmd.Wait()
// error. A clean exit is reported as 0 even though it is fatal for the proxy.
func childExitCode(waitErr error) int {
	if waitErr == nil {
		return 0
	}

	var exitErr *exec.ExitError
	if errors.As(waitErr, &exitErr) {
		exitCode := exitErr.ExitCode()
		if exitCode >= 0 {
			return exitCode
		}
	}

	return 1
}

// proxyExitCode derives the proxy process exit code from the reported user
// server exit code. A clean child exit is still fatal because the process must
// keep serving requests.
func proxyExitCode(exitCode int) int {
	if exitCode <= 0 {
		return 1
	}
	return exitCode
}

func childExitMessage(waitErr error, reason string) string {
	msg := fmt.Sprintf(
		"Expected a long-running server process, but the user server %s",
		reason,
	)
	if waitErr == nil {
		return fmt.Sprintf("%s with exit code 0", msg)
	}
	return fmt.Sprintf("%s: %v", msg, waitErr)
}

func connectIPC() error {
	ipcPath := os.Getenv("VERCEL_IPC_PATH")
	if ipcPath == "" {
		// No IPC path - running in dev mode or locally
		return nil
	}

	conn, err := net.Dial("unix", ipcPath)
	if err != nil {
		return fmt.Errorf("failed to connect to IPC socket: %w", err)
	}

	ipcConn = conn
	return nil
}

func main() {
	startTime = time.Now()
	serviceRoutePrefix := resolveServiceRoutePrefix()

	// Connect to IPC socket
	if err := connectIPC(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
	}

	// Find a free port for the user's server
	userPort, err := findFreePort()
	if err != nil {
		fatal(1, fmt.Sprintf("Failed to find free port: %v", err))
	}

	// Start the user's server binary
	userBinary := "./user-server"
	if _, err := os.Stat(userBinary); os.IsNotExist(err) {
		fatal(1, fmt.Sprintf("User server binary not found: %s", userBinary))
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, userBinary)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", userPort))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		fatal(1, fmt.Sprintf("Failed to start user server: %v", err))
	}

	// Race server readiness against early child death.
	childDone := make(chan error, 1)
	go func() { childDone <- cmd.Wait() }()

	serverReady := make(chan error, 1)
	go func() { serverReady <- waitForServer(userPort, 30*time.Second) }()

	select {
	case waitErr := <-childDone:
		// Child exited before the server became ready.
		fatal(
			childExitCode(waitErr),
			childExitMessage(waitErr, "exited during startup"),
		)
	case err := <-serverReady:
		if err != nil {
			cmd.Process.Kill()
			fatal(1, fmt.Sprintf("User server failed to start: %v", err))
		}
	}

	// Supervise the user server for the lifetime of the instance. If it
	// exits after startup, report an unrecoverable error so the platform
	// recycles this instance instead of leaving the proxy serving 502s
	// while the health check still reports OK.
	go func() {
		waitErr := <-childDone
		fatal(
			childExitCode(waitErr),
			childExitMessage(waitErr, "exited unexpectedly"),
		)
	}()

	// Create reverse proxy to user's server
	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", userPort))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	// Customize the proxy director to preserve headers
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// Preserve the original Host header
		if host := req.Header.Get("X-Forwarded-Host"); host != "" {
			req.Host = host
		}
	}

	// The port we'll listen on (Vercel will route traffic here)
	listenPort := 3000

	// Create HTTP server with IPC-aware handler
	server := &http.Server{
		Addr: fmt.Sprintf("127.0.0.1:%d", listenPort),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Handle Vercel health check
			if r.URL.Path == "/_vercel/ping" {
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("OK"))
				return
			}

			// Extract Vercel internal headers
			invocationID := r.Header.Get("X-Vercel-Internal-Invocation-Id")
			requestIDStr := r.Header.Get("X-Vercel-Internal-Request-Id")
			requestID, _ := strconv.ParseUint(requestIDStr, 10, 64)

			// A successful protocol upgrade detaches the connection from the
			// request lifecycle. End the invocation at that boundary while the
			// reverse proxy continues tunneling the upgraded connection. The
			// fallback after ServeHTTP handles ordinary responses and failed
			// upgrades. sync.Once prevents a second end message when an upgraded
			// connection eventually closes and ServeHTTP returns.
			endRequest := func() {
				if ipcConn != nil && invocationID != "" {
					endMsg := EndMessage{
						Type: "end",
						Payload: EndPayload{
							Context: RequestContext{
								InvocationID: invocationID,
								RequestID:    requestID,
							},
						},
					}
					sendIPCMessage(endMsg)
				}
			}

			// Remove internal headers before forwarding
			for key := range r.Header {
				if strings.HasPrefix(strings.ToLower(key), "x-vercel-internal-") {
					r.Header.Del(key)
				}
			}

			if r.URL != nil {
				originalPath := r.URL.Path
				r.URL.Path = stripServiceRoutePrefix(r.URL.Path, serviceRoutePrefix)
				if r.URL.Path != originalPath {
					// Keep URL path encoding fields consistent after rewrite.
					r.URL.RawPath = ""
				}
			}

			// Forward request to user's server
			serveWithUpgradeLifecycle(proxy, w, r, endRequest)
		}),
	}

	// Send server-started IPC message
	initDuration := int(time.Since(startTime).Milliseconds())
	startMsg := StartMessage{
		Type: "server-started",
		Payload: StartPayload{
			InitDuration: initDuration,
			HTTPPort:     listenPort,
		},
	}

	if err := sendIPCMessage(startMsg); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to send IPC start message: %v\n", err)
	} else {
		ipcReady = true
	}

	// If no IPC, print the port for local development
	if ipcConn == nil {
		fmt.Printf("Server listening on port %d (proxying to user server on port %d)\n", listenPort, userPort)
	}

	// Start the proxy server
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}

	// Clean up
	cmd.Process.Kill()
}
