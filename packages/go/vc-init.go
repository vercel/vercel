// vc-init.go - Bootstrap wrapper for standalone Go servers on Vercel
// This handles the IPC protocol required for executable runtime mode.
//
// The bootstrap:
// 1. Connects to VERCEL_IPC_PATH Unix socket
// 2. Starts the user's server on an internal port
// 3. Sends "server-started" IPC message
// 4. Reverse proxies requests to user's server
// 5. Handles /_vercel/ping health check
// 6. Sends "end" IPC message after each request

package main

import (
	"context"
	"encoding/json"
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

func findFreePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	return port, nil
}

func waitForServer(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	return fmt.Errorf("server did not start within %v", timeout)
}

func main() {
	startTime = time.Now()

	// Connect to IPC socket
	if err := connectIPC(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
	}

	// Find a free port for the user's server
	userPort, err := findFreePort()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find free port: %v\n", err)
		os.Exit(1)
	}

	// Start the user's server binary
	userBinary := "./user-server"
	if _, err := os.Stat(userBinary); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "User server binary not found: %s\n", userBinary)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, userBinary)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", userPort))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start user server: %v\n", err)
		os.Exit(1)
	}

	// Wait for user's server to be ready
	if err := waitForServer(userPort, 30*time.Second); err != nil {
		fmt.Fprintf(os.Stderr, "User server failed to start: %v\n", err)
		cmd.Process.Kill()
		os.Exit(1)
	}

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

			// Remove internal headers before forwarding
			for key := range r.Header {
				if strings.HasPrefix(strings.ToLower(key), "x-vercel-internal-") {
					r.Header.Del(key)
				}
			}

			// Forward request to user's server
			proxy.ServeHTTP(w, r)

			// Send end message via IPC
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

// Ensure we close IPC connection on exit
func init() {
	// Note: Using a deferred cleanup in main() is preferred,
	// but this provides a fallback
}
