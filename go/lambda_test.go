package vercel

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
)

// TestIsLambdaEnvironment tests the Lambda environment detection.
func TestIsLambdaEnvironment(t *testing.T) {
	tests := []struct {
		name     string
		envValue string
		expected bool
	}{
		{"Lambda environment detected", "my-function", true},
		{"Empty value", "", false},
		{"Not set", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue != "" {
				os.Setenv("AWS_LAMBDA_FUNCTION_NAME", tt.envValue)
				defer os.Unsetenv("AWS_LAMBDA_FUNCTION_NAME")
			} else {
				os.Unsetenv("AWS_LAMBDA_FUNCTION_NAME")
			}

			result := isLambdaEnvironment()
			if result != tt.expected {
				t.Errorf("isLambdaEnvironment() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestConvertEventToRequest tests the conversion of API Gateway events to http.Request.
func TestConvertEventToRequest(t *testing.T) {
	tests := []struct {
		name           string
		event          events.APIGatewayProxyRequest
		expectedMethod string
		expectedPath   string
		expectedHost   string
		expectedBody   string
	}{
		{
			name: "Basic GET request",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/api/users",
				Headers:    map[string]string{"Host": "example.com"},
			},
			expectedMethod: "GET",
			expectedPath:   "/api/users",
			expectedHost:   "example.com",
			expectedBody:   "",
		},
		{
			name: "POST request with body",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "POST",
				Path:       "/api/users",
				Headers: map[string]string{
					"Host":         "example.com",
					"Content-Type": "application/json",
				},
				Body: `{"name":"test"}`,
			},
			expectedMethod: "POST",
			expectedPath:   "/api/users",
			expectedHost:   "example.com",
			expectedBody:   `{"name":"test"}`,
		},
		{
			name: "Request with base64 encoded body",
			event: events.APIGatewayProxyRequest{
				HTTPMethod:      "POST",
				Path:            "/api/upload",
				Headers:         map[string]string{"Host": "example.com"},
				Body:            base64.StdEncoding.EncodeToString([]byte("binary data")),
				IsBase64Encoded: true,
			},
			expectedMethod: "POST",
			expectedPath:   "/api/upload",
			expectedHost:   "example.com",
			expectedBody:   "binary data",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := convertEventToRequest(context.Background(), tt.event)
			if err != nil {
				t.Fatalf("convertEventToRequest() error = %v", err)
			}

			if req.Method != tt.expectedMethod {
				t.Errorf("Method = %v, want %v", req.Method, tt.expectedMethod)
			}

			if req.URL.Path != tt.expectedPath {
				t.Errorf("Path = %v, want %v", req.URL.Path, tt.expectedPath)
			}

			if req.Host != tt.expectedHost {
				t.Errorf("Host = %v, want %v", req.Host, tt.expectedHost)
			}

			if tt.expectedBody != "" {
				body, _ := io.ReadAll(req.Body)
				if string(body) != tt.expectedBody {
					t.Errorf("Body = %v, want %v", string(body), tt.expectedBody)
				}
			}
		})
	}
}

// TestQueryParameters tests query parameter handling.
func TestQueryParameters(t *testing.T) {
	tests := []struct {
		name          string
		event         events.APIGatewayProxyRequest
		expectedQuery map[string]string
	}{
		{
			name: "Single value query parameters",
			event: events.APIGatewayProxyRequest{
				HTTPMethod:            "GET",
				Path:                  "/api/search",
				QueryStringParameters: map[string]string{"q": "test", "page": "1"},
			},
			expectedQuery: map[string]string{"q": "test", "page": "1"},
		},
		{
			name: "Multi-value query parameters",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/api/filter",
				MultiValueQueryStringParameters: map[string][]string{
					"tag": {"go", "rust"},
				},
			},
			expectedQuery: map[string]string{"tag": "go"}, // First value
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := convertEventToRequest(context.Background(), tt.event)
			if err != nil {
				t.Fatalf("convertEventToRequest() error = %v", err)
			}

			for key, expected := range tt.expectedQuery {
				actual := req.URL.Query().Get(key)
				if actual != expected {
					t.Errorf("Query[%s] = %v, want %v", key, actual, expected)
				}
			}
		})
	}
}

// TestRequestHeaders tests header preservation.
func TestRequestHeaders(t *testing.T) {
	tests := []struct {
		name            string
		event           events.APIGatewayProxyRequest
		expectedHeaders map[string]string
	}{
		{
			name: "Single value headers",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/",
				Headers: map[string]string{
					"Accept":        "application/json",
					"Authorization": "Bearer token123",
					"X-Custom":      "custom-value",
				},
			},
			expectedHeaders: map[string]string{
				"Accept":        "application/json",
				"Authorization": "Bearer token123",
				"X-Custom":      "custom-value",
			},
		},
		{
			name: "Multi-value headers",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/",
				MultiValueHeaders: map[string][]string{
					"Accept":   {"application/json", "text/html"},
					"X-Custom": {"value1"},
				},
			},
			expectedHeaders: map[string]string{
				"Accept":   "application/json",
				"X-Custom": "value1",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := convertEventToRequest(context.Background(), tt.event)
			if err != nil {
				t.Fatalf("convertEventToRequest() error = %v", err)
			}

			for key, expected := range tt.expectedHeaders {
				actual := req.Header.Get(key)
				if actual != expected {
					t.Errorf("Header[%s] = %v, want %v", key, actual, expected)
				}
			}
		})
	}
}

// TestRemoteAddrFromXFF tests X-Forwarded-For handling.
func TestRemoteAddrFromXFF(t *testing.T) {
	tests := []struct {
		name               string
		event              events.APIGatewayProxyRequest
		expectedRemoteAddr string
	}{
		{
			name: "Single IP in X-Forwarded-For",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/",
				Headers:    map[string]string{"X-Forwarded-For": "192.168.1.1"},
			},
			expectedRemoteAddr: "192.168.1.1",
		},
		{
			name: "Multiple IPs in X-Forwarded-For",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/",
				Headers:    map[string]string{"X-Forwarded-For": "192.168.1.1, 10.0.0.1, 172.16.0.1"},
			},
			expectedRemoteAddr: "192.168.1.1",
		},
		{
			name: "Lowercase x-forwarded-for",
			event: events.APIGatewayProxyRequest{
				HTTPMethod: "GET",
				Path:       "/",
				Headers:    map[string]string{"x-forwarded-for": "10.0.0.5"},
			},
			expectedRemoteAddr: "10.0.0.5",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req, err := convertEventToRequest(context.Background(), tt.event)
			if err != nil {
				t.Fatalf("convertEventToRequest() error = %v", err)
			}

			if req.RemoteAddr != tt.expectedRemoteAddr {
				t.Errorf("RemoteAddr = %v, want %v", req.RemoteAddr, tt.expectedRemoteAddr)
			}
		})
	}
}

// TestConvertResponseToEvent tests the conversion of http.Response to API Gateway response.
func TestConvertResponseToEvent(t *testing.T) {
	tests := []struct {
		name             string
		handler          http.HandlerFunc
		expectedStatus   int
		expectedBody     string
		expectedBase64   bool
		expectedHeaders  map[string]string
	}{
		{
			name: "Simple 200 response",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("Hello, World!"))
			},
			expectedStatus:  200,
			expectedBody:    "Hello, World!",
			expectedBase64:  false,
			expectedHeaders: map[string]string{},
		},
		{
			name: "JSON response with headers",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Custom", "value")
				w.WriteHeader(http.StatusCreated)
				w.Write([]byte(`{"id":1}`))
			},
			expectedStatus: 201,
			expectedBody:   `{"id":1}`,
			expectedBase64: false,
			expectedHeaders: map[string]string{
				"Content-Type": "application/json",
				"X-Custom":     "value",
			},
		},
		{
			name: "404 Not Found",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte("Not Found"))
			},
			expectedStatus:  404,
			expectedBody:    "Not Found",
			expectedBase64:  false,
			expectedHeaders: map[string]string{},
		},
		{
			name: "500 Internal Server Error",
			handler: func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte("Internal Server Error"))
			},
			expectedStatus:  500,
			expectedBody:    "Internal Server Error",
			expectedBase64:  false,
			expectedHeaders: map[string]string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			tt.handler(rec, httptest.NewRequest("GET", "/", nil))

			resp := convertResponseToEvent(rec)

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("StatusCode = %v, want %v", resp.StatusCode, tt.expectedStatus)
			}

			if resp.IsBase64Encoded != tt.expectedBase64 {
				t.Errorf("IsBase64Encoded = %v, want %v", resp.IsBase64Encoded, tt.expectedBase64)
			}

			if resp.Body != tt.expectedBody {
				t.Errorf("Body = %v, want %v", resp.Body, tt.expectedBody)
			}

			for key, expected := range tt.expectedHeaders {
				actual := resp.Headers[key]
				if actual != expected {
					t.Errorf("Headers[%s] = %v, want %v", key, actual, expected)
				}
			}
		})
	}
}

// TestBinaryResponse tests binary response handling.
func TestBinaryResponse(t *testing.T) {
	binaryData := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A} // PNG header

	handler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.WriteHeader(http.StatusOK)
		w.Write(binaryData)
	}

	rec := httptest.NewRecorder()
	handler(rec, httptest.NewRequest("GET", "/", nil))

	resp := convertResponseToEvent(rec)

	if !resp.IsBase64Encoded {
		t.Error("Expected IsBase64Encoded = true for image/png")
	}

	decoded, err := base64.StdEncoding.DecodeString(resp.Body)
	if err != nil {
		t.Fatalf("Failed to decode base64 body: %v", err)
	}

	if string(decoded) != string(binaryData) {
		t.Errorf("Decoded body doesn't match original binary data")
	}
}

// TestIsBinaryContentType tests the binary content type detection.
func TestIsBinaryContentType(t *testing.T) {
	tests := []struct {
		contentType string
		expected    bool
	}{
		{"image/png", true},
		{"image/jpeg", true},
		{"image/gif", true},
		{"image/webp", true},
		{"audio/mp3", true},
		{"audio/wav", true},
		{"video/mp4", true},
		{"video/webm", true},
		{"application/octet-stream", true},
		{"application/pdf", true},
		{"application/zip", true},
		{"application/gzip", true},
		{"application/wasm", true},
		{"font/woff", true},
		{"font/woff2", true},
		{"text/html", false},
		{"text/plain", false},
		{"text/css", false},
		{"application/json", false},
		{"application/javascript", false},
		{"application/xml", false},
		{"text/html; charset=utf-8", false},
		{"application/json; charset=utf-8", false},
		{"IMAGE/PNG", true}, // Case insensitive
		{"", false},
	}

	for _, tt := range tests {
		t.Run(tt.contentType, func(t *testing.T) {
			result := isBinaryContentType(tt.contentType)
			if result != tt.expected {
				t.Errorf("isBinaryContentType(%q) = %v, want %v", tt.contentType, result, tt.expected)
			}
		})
	}
}

// TestLambdaHandlerIntegration tests the full request/response cycle.
func TestLambdaHandlerIntegration(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Echo back some request info
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Method", r.Method)
		w.Header().Set("X-Path", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	lambdaHandler := newLambdaHandler(handler)

	event := events.APIGatewayProxyRequest{
		HTTPMethod: "POST",
		Path:       "/api/test",
		Headers: map[string]string{
			"Host":         "example.com",
			"Content-Type": "application/json",
		},
		Body: `{"test":true}`,
	}

	resp, err := lambdaHandler(context.Background(), event)
	if err != nil {
		t.Fatalf("lambdaHandler() error = %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("StatusCode = %v, want 200", resp.StatusCode)
	}

	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("Content-Type = %v, want application/json", resp.Headers["Content-Type"])
	}

	if resp.Headers["X-Method"] != "POST" {
		t.Errorf("X-Method = %v, want POST", resp.Headers["X-Method"])
	}

	if resp.Headers["X-Path"] != "/api/test" {
		t.Errorf("X-Path = %v, want /api/test", resp.Headers["X-Path"])
	}

	if !strings.Contains(resp.Body, `"status":"ok"`) {
		t.Errorf("Body = %v, want to contain status:ok", resp.Body)
	}
}

// TestPathParameters tests that path information is preserved for routers.
func TestPathParameters(t *testing.T) {
	// Note: Path parameter extraction is router-specific (Gin, Chi, etc.)
	// The wrapper just needs to preserve the full path correctly
	event := events.APIGatewayProxyRequest{
		HTTPMethod: "GET",
		Path:       "/users/123/posts/456",
		PathParameters: map[string]string{
			"userId": "123",
			"postId": "456",
		},
	}

	req, err := convertEventToRequest(context.Background(), event)
	if err != nil {
		t.Fatalf("convertEventToRequest() error = %v", err)
	}

	if req.URL.Path != "/users/123/posts/456" {
		t.Errorf("Path = %v, want /users/123/posts/456", req.URL.Path)
	}
}
