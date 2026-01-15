// Package vercel provides utilities for running Go HTTP handlers on Vercel's serverless platform.
//
// The Start function is the main entry point for wrapper mode applications.
// It automatically detects whether the code is running in AWS Lambda (Vercel's serverless
// infrastructure) or locally, and starts the appropriate server.
//
// Example usage:
//
//	package main
//
//	import (
//		"net/http"
//		vercel "github.com/vercel/vercel-go"
//	)
//
//	func main() {
//		mux := http.NewServeMux()
//		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
//			w.Write([]byte("Hello, World!"))
//		})
//		vercel.Start(mux)
//	}
package vercel

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
)

// Start initializes the appropriate server based on the runtime environment.
// When running in AWS Lambda (detected via AWS_LAMBDA_FUNCTION_NAME environment variable),
// it starts a Lambda handler that converts API Gateway events to http.Request objects.
// When running locally, it starts a standard HTTP server on the port specified by
// the PORT environment variable (defaulting to 3000).
//
// The handler parameter must implement http.Handler. This includes:
//   - http.ServeMux (standard library)
//   - gin.Engine (Gin framework)
//   - chi.Mux (Chi router)
//   - mux.Router (gorilla/mux)
//   - Any custom type implementing ServeHTTP(http.ResponseWriter, *http.Request)
func Start(handler http.Handler) {
	if isLambdaEnvironment() {
		startLambda(handler)
	} else {
		startLocalServer(handler)
	}
}

// isLambdaEnvironment checks if we're running in AWS Lambda by looking for
// the AWS_LAMBDA_FUNCTION_NAME environment variable, which is always set
// in Lambda execution environments.
func isLambdaEnvironment() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") != ""
}

// startLocalServer starts a standard HTTP server for local development.
// It reads the port from the PORT environment variable, defaulting to 3000.
func startLocalServer(handler http.Handler) {
	// If running under 'vercel dev', we need to signal the port we're listening on.
	// We check for VERCEL_DEV_PORT_FILE which is set by the Vercel CLI.
	if portFile := os.Getenv("VERCEL_DEV_PORT_FILE"); portFile != "" {
		startDevServer(handler, portFile)
		return
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	addr := ":" + port
	fmt.Printf("Starting local server on http://localhost%s\n", addr)

	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting server: %v\n", err)
		os.Exit(1)
	}
}

func startDevServer(handler http.Handler, portFile string) {
	// Listen on an ephemeral port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating listener: %v\n", err)
		os.Exit(1)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	portBytes := []byte(strconv.Itoa(port))

	// Try writing to FD 3 (pipe) first, as used by legacy dev-server.go
	file := os.NewFile(3, "pipe")
	if _, err := file.Write(portBytes); err != nil {
		// Fallback to writing to the file specified by env var
		// We unset the env var to avoid confusion if we were to support reloading,
		// but matching dev-server.go logic:
		os.Unsetenv("VERCEL_DEV_PORT_FILE")
		if err := os.WriteFile(portFile, portBytes, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing port file: %v\n", err)
			os.Exit(1)
		}
	}

	fmt.Printf("Starting dev server on http://localhost:%d\n", port)

	if err := http.Serve(listener, handler); err != nil {
		fmt.Fprintf(os.Stderr, "Error starting server: %v\n", err)
		os.Exit(1)
	}
}
