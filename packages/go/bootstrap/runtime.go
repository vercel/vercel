package bootstrap

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

type StartMessage struct {
	Type    string       `json:"type"`
	Payload StartPayload `json:"payload"`
}

type StartPayload struct {
	InitDuration int `json:"initDuration"`
	HTTPPort     int `json:"httpPort"`
}

type HandlerStartedMessage struct {
	Type    string                `json:"type"`
	Payload HandlerStartedPayload `json:"payload"`
}

type HandlerStartedPayload struct {
	Context          RequestContext `json:"context"`
	HandlerStartedAt int            `json:"handlerStartedAt"`
}

type EndMessage struct {
	Type    string     `json:"type"`
	Payload EndPayload `json:"payload"`
}

type EndPayload struct {
	Context RequestContext `json:"context"`
	Error   interface{}    `json:"error,omitempty"`
}

var (
	ipcConn   net.Conn
	ipcMutex  sync.Mutex
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

	_, err = ipcConn.Write(append(data, 0))
	return err
}

func connectIPC() error {
	ipcPath := os.Getenv("VERCEL_IPC_PATH")
	if ipcPath == "" {
		return nil
	}

	conn, err := net.Dial("unix", ipcPath)
	if err != nil {
		return fmt.Errorf("failed to connect to IPC socket: %w", err)
	}

	ipcConn = conn
	return nil
}

func Main() {
	startTime = time.Now()
	serviceRoutePrefix := ResolveServiceRoutePrefix()

	if err := connectIPC(); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: %v\n", err)
	}

	userPort, err := FindFreePort()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find free port: %v\n", err)
		os.Exit(1)
	}

	userBinary := "./user-server"
	if _, err := os.Stat(userBinary); os.IsNotExist(err) {
		fmt.Fprintf(os.Stderr, "User server binary not found: %s\n", userBinary)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, userBinary)
	cmd.Env = append(os.Environ(), fmt.Sprintf("PORT=%d", userPort))

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to capture user server stdout: %v\n", err)
		os.Exit(1)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to capture user server stderr: %v\n", err)
		os.Exit(1)
	}

	requestTracker := NewContextTracker()

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start user server: %v\n", err)
		os.Exit(1)
	}

	go ForwardProcessLogs(
		stdoutPipe,
		StreamStdout,
		requestTracker,
		func(entry Entry) {
			emitLogMessage(logMessageFromEntry(entry))
		},
		func(err error) {
			fmt.Fprintf(os.Stderr, "Warning: Failed to read user server stdout: %v\n", err)
		},
	)
	go ForwardProcessLogs(
		stderrPipe,
		StreamStderr,
		requestTracker,
		func(entry Entry) {
			emitLogMessage(logMessageFromEntry(entry))
		},
		func(err error) {
			fmt.Fprintf(os.Stderr, "Warning: Failed to read user server stderr: %v\n", err)
		},
	)

	if err := WaitForServer(userPort, 30*time.Second); err != nil {
		flushBufferedLogMessagesToLocalOutput()
		fmt.Fprintf(os.Stderr, "User server failed to start: %v\n", err)
		_ = cmd.Process.Kill()
		os.Exit(1)
	}

	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", userPort))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		if host := req.Header.Get("X-Forwarded-Host"); host != "" {
			req.Host = host
		}
	}

	listenPort := 3000
	server := &http.Server{
		Addr: fmt.Sprintf("127.0.0.1:%d", listenPort),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/_vercel/ping" {
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("OK"))
				return
			}

			invocationID := r.Header.Get("X-Vercel-Internal-Invocation-Id")
			requestIDStr := r.Header.Get("X-Vercel-Internal-Request-Id")
			requestID, _ := strconv.ParseUint(requestIDStr, 10, 64)
			requestContext := EnsureRequestContext(RequestContext{
				InvocationID: invocationID,
				RequestID:    requestID,
			})

			for key := range r.Header {
				if strings.HasPrefix(strings.ToLower(key), "x-vercel-internal-") {
					r.Header.Del(key)
				}
			}

			if r.URL != nil {
				originalPath := r.URL.Path
				r.URL.Path = StripServiceRoutePrefix(r.URL.Path, serviceRoutePrefix)
				if r.URL.Path != originalPath {
					r.URL.RawPath = ""
				}
			}

			requestTracker.Start(requestContext)
			defer requestTracker.Finish(requestContext)

			if err := sendIPCMessage(HandlerStartedMessage{
				Type: "handler-started",
				Payload: HandlerStartedPayload{
					Context:          requestContext,
					HandlerStartedAt: int(time.Now().UnixMilli()),
				},
			}); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to send IPC handler-started message: %v\n", err)
			}

			proxy.ServeHTTP(w, r)

			endMsg := EndMessage{
				Type: "end",
				Payload: EndPayload{
					Context: requestContext,
				},
			}
			if err := sendIPCMessage(endMsg); err != nil {
				fmt.Fprintf(os.Stderr, "Warning: Failed to send IPC end message: %v\n", err)
			}
		}),
	}

	startMsg := StartMessage{
		Type: "server-started",
		Payload: StartPayload{
			InitDuration: int(time.Since(startTime).Milliseconds()),
			HTTPPort:     listenPort,
		},
	}

	if err := sendIPCMessage(startMsg); err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Failed to send IPC start message: %v\n", err)
		flushBufferedLogMessagesToLocalOutput()
	} else {
		flushBufferedLogMessages()
	}

	if ipcConn == nil {
		fmt.Printf(
			"Server listening on port %d (proxying to user server on port %d)\n",
			listenPort,
			userPort,
		)
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}

	_ = cmd.Process.Kill()
}
