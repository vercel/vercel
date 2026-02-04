// Package vercel provides the Vercel Fluid runtime for Go serverless functions.
//
// This runtime implements the Fluid IPC protocol for HTTP streaming, request
// multiplexing, and efficient resource utilization.
//
// Basic usage:
//
//	package handler
//
//	import (
//		"fmt"
//		"net/http"
//
//		"github.com/vercel/go-runtime"
//	)
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		fmt.Fprintf(w, "Hello from Go!")
//	}
//
//	func init() {
//		vercel.Register(http.HandlerFunc(Handler))
//	}
//
// For background tasks that should complete after the response:
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		vercel.WaitUntil(r.Context(), func() {
//			// Background work here
//		})
//		fmt.Fprintf(w, "Response sent!")
//	}
package vercel

import (
	"context"
	"net/http"
	"os"
	"sync"
)

var (
	// globalHandler is the registered HTTP handler
	globalHandler http.Handler
	// globalRuntime is the singleton runtime instance
	globalRuntime *Runtime
	// initOnce ensures runtime is initialized only once
	initOnce sync.Once
)

// Register registers an HTTP handler with the Vercel runtime.
// This should be called from init() in your handler package.
func Register(handler http.Handler) {
	globalHandler = handler
}

// Start starts the Vercel runtime server. This is called by the
// generated main.go wrapper and should not be called directly.
func Start() error {
	if globalHandler == nil {
		panic("vercel: no handler registered. Call vercel.Register() in init()")
	}

	var err error
	initOnce.Do(func() {
		globalRuntime, err = NewRuntime(globalHandler)
	})
	if err != nil {
		return err
	}

	return globalRuntime.ListenAndServe()
}

// WaitUntil registers a background task that should complete before the
// function instance is terminated. The task will run after the response
// is sent to the client.
//
// Tasks have a maximum timeout of 30 seconds. If the context is cancelled
// or the timeout is reached, the task will be interrupted.
//
// Example:
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		vercel.WaitUntil(r.Context(), func() {
//			// Send analytics, flush logs, etc.
//		})
//		w.Write([]byte("Response sent!"))
//	}
func WaitUntil(ctx context.Context, fn func()) {
	rc := getRequestContext(ctx)
	if rc == nil {
		// Not running in Vercel environment, execute synchronously
		fn()
		return
	}
	rc.waitGroup.Add(1)
	go func() {
		defer rc.waitGroup.Done()
		fn()
	}()
}

// Log sends a log message to Vercel's logging infrastructure.
// The level can be "debug", "info", "warn", or "error".
//
// If called outside of a request context, logs are written to stderr.
func Log(ctx context.Context, level, message string) {
	rc := getRequestContext(ctx)
	if rc == nil || globalRuntime == nil || globalRuntime.ipc == nil {
		// Fallback to stderr
		os.Stderr.WriteString("[" + level + "] " + message + "\n")
		return
	}
	globalRuntime.ipc.SendLog(rc.invocationID, rc.requestID, level, message)
}

// Info logs an info-level message.
func Info(ctx context.Context, message string) {
	Log(ctx, "info", message)
}

// Debug logs a debug-level message.
func Debug(ctx context.Context, message string) {
	Log(ctx, "debug", message)
}

// Warn logs a warn-level message.
func Warn(ctx context.Context, message string) {
	Log(ctx, "warn", message)
}

// Error logs an error-level message.
func Error(ctx context.Context, message string) {
	Log(ctx, "error", message)
}

// InvocationID returns the current invocation ID from the request context.
// Returns an empty string if not running in Vercel environment.
func InvocationID(ctx context.Context) string {
	rc := getRequestContext(ctx)
	if rc == nil {
		return ""
	}
	return rc.invocationID
}

// RequestID returns the current request ID from the request context.
// Returns 0 if not running in Vercel environment.
func RequestID(ctx context.Context) int {
	rc := getRequestContext(ctx)
	if rc == nil {
		return 0
	}
	return rc.requestID
}
