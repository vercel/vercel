// Package vercel provides runtime integration for Go HTTP handlers on Vercel.
package vercel

import (
	"context"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
)

const (
	requestKeyHeader   = "X-Vercel-Runtime-V1-Key"
	invocationIDHeader = "X-Vercel-Runtime-V1-Invocation-Id"
	requestIDHeader    = "X-Vercel-Runtime-V1-Request-Id"
)

type contextKey uint8

const (
	requestKeyContextKey contextKey = iota
	invocationIDContextKey
	requestIDContextKey
)

var (
	registeredHandler struct {
		sync.RWMutex
		http.Handler
	}
	tasks = newTaskGroup()
)

type taskGroup struct {
	mu    sync.Mutex
	ready *sync.Cond
	count uint64
}

func newTaskGroup() *taskGroup {
	tasks := &taskGroup{}
	tasks.ready = sync.NewCond(&tasks.mu)
	return tasks
}

func (g *taskGroup) Add() {
	g.mu.Lock()
	g.count++
	g.mu.Unlock()
}

func (g *taskGroup) Done() {
	g.mu.Lock()
	g.count--
	if g.count == 0 {
		g.ready.Broadcast()
	}
	g.mu.Unlock()
}

func (g *taskGroup) Wait() {
	g.mu.Lock()
	for g.count != 0 {
		g.ready.Wait()
	}
	g.mu.Unlock()
}

// Register sets the handler served by Start. The most recent call wins.
func Register(handler http.Handler) {
	registeredHandler.Lock()
	registeredHandler.Handler = handler
	registeredHandler.Unlock()
}

// Start serves the registered handler, or http.DefaultServeMux if none was registered.
func Start() error {
	registeredHandler.RLock()
	handler := registeredHandler.Handler
	registeredHandler.RUnlock()
	if handler == nil {
		handler = http.DefaultServeMux
	}
	return ListenAndServe(handler)
}

// ListenAndServe starts a runtime server bound to 127.0.0.1.
func ListenAndServe(handler http.Handler) error {
	if handler == nil {
		handler = http.DefaultServeMux
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	listener, err := net.Listen("tcp", net.JoinHostPort("127.0.0.1", port))
	if err != nil {
		return err
	}

	server := &http.Server{Handler: runtimeHandler(handler)}
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- server.Serve(listener)
	}()

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	defer signal.Stop(signals)

	select {
	case err := <-serveResult:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-signals:
		err := server.Shutdown(context.Background())
		serveErr := <-serveResult
		tasks.Wait()
		if err != nil {
			return err
		}
		if serveErr != nil && serveErr != http.ErrServerClosed {
			return serveErr
		}
		return nil
	}
}

// Handler adds Vercel request context and lifecycle tracking to next.
func Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestKey := r.Header.Get(requestKeyHeader)
		invocationID := r.Header.Get(invocationIDHeader)
		requestID := parseID(r.Header.Get(requestIDHeader))

		r.Header.Del(requestKeyHeader)
		r.Header.Del(invocationIDHeader)
		r.Header.Del(requestIDHeader)

		ctx := context.WithValue(r.Context(), requestKeyContextKey, requestKey)
		ctx = context.WithValue(ctx, invocationIDContextKey, invocationID)
		ctx = context.WithValue(ctx, requestIDContextKey, requestID)
		defer sendFrame("request-complete", requestKey, nil)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func runtimeHandler(next http.Handler) http.Handler {
	return Handler(next)
}

func parseID(value string) uint64 {
	id, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0
	}
	return id
}

// InvocationID returns the invocation ID associated with ctx, or an empty string if absent.
func InvocationID(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	id, _ := ctx.Value(invocationIDContextKey).(string)
	return id
}

// RequestID returns the request ID associated with ctx, or zero if absent.
func RequestID(ctx context.Context) uint64 {
	if ctx == nil {
		return 0
	}
	id, _ := ctx.Value(requestIDContextKey).(uint64)
	return id
}

func requestKey(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	key, _ := ctx.Value(requestKeyContextKey).(string)
	return key
}

// WaitUntil starts task in the background and drains it during graceful shutdown.
func WaitUntil(ctx context.Context, task func()) {
	if task == nil {
		return
	}
	key := requestKey(ctx)
	if key == "" {
		task()
		return
	}
	sendFrame("retain", key, nil)
	tasks.Add()
	go func() {
		defer tasks.Done()
		defer sendFrame("release", key, nil)
		defer func() {
			_ = recover()
		}()
		task()
	}()
}

var stderrMu sync.Mutex

// Log emits a structured runtime log.
func Log(ctx context.Context, level, message string) {
	key := requestKey(ctx)
	if key != "" {
		if sendFrame("log", key, map[string]interface{}{
			"level":   level,
			"message": message,
		}) {
			return
		}
	}
	stderrMu.Lock()
	_, _ = os.Stderr.WriteString("[" + level + "] " + message + "\n")
	stderrMu.Unlock()
}

// Debug emits a debug-level log.
func Debug(ctx context.Context, message string) { Log(ctx, "debug", message) }

// Info emits an info-level log.
func Info(ctx context.Context, message string) { Log(ctx, "info", message) }

// Warn emits a warn-level log.
func Warn(ctx context.Context, message string) { Log(ctx, "warn", message) }

// Error emits an error-level log.
func Error(ctx context.Context, message string) { Log(ctx, "error", message) }
