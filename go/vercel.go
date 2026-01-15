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
	"net/http"
	"os"
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
