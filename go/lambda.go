package vercel

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

// startLambda registers and starts the Lambda handler.
// It wraps the provided http.Handler to handle API Gateway proxy events.
func startLambda(handler http.Handler) {
	lambda.Start(newLambdaHandler(handler))
}

// newLambdaHandler creates a Lambda handler function that converts
// API Gateway proxy requests to http.Request objects, invokes the handler,
// and converts the response back to API Gateway proxy response format.
func newLambdaHandler(handler http.Handler) func(context.Context, events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return func(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
		req, err := convertEventToRequest(ctx, event)
		if err != nil {
			return events.APIGatewayProxyResponse{
				StatusCode: http.StatusInternalServerError,
				Body:       "Internal Server Error",
			}, nil
		}

		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		return convertResponseToEvent(rec), nil
	}
}

// convertEventToRequest converts an API Gateway proxy request event to an http.Request.
func convertEventToRequest(ctx context.Context, event events.APIGatewayProxyRequest) (*http.Request, error) {
	// Build the URL with path and query parameters
	u := buildURL(event)

	// Get the request body
	body, err := getRequestBody(event)
	if err != nil {
		return nil, err
	}

	// Create the request using httptest.NewRequest for proper initialization
	req := httptest.NewRequest(event.HTTPMethod, u.String(), body)
	req = req.WithContext(ctx)

	// Set headers from multi-value headers (preferred) or single-value headers
	setRequestHeaders(req, event)

	// Set the Host header explicitly
	if host := getHost(event); host != "" {
		req.Host = host
	}

	// Set RemoteAddr from X-Forwarded-For header
	if xff := getXForwardedFor(event); xff != "" {
		req.RemoteAddr = xff
	}

	// Set Content-Length if body is present
	if body != nil {
		if seeker, ok := body.(io.Seeker); ok {
			size, _ := seeker.Seek(0, io.SeekEnd)
			seeker.Seek(0, io.SeekStart)
			req.ContentLength = size
		}
	}

	return req, nil
}

// buildURL constructs the full URL from the event's path and query parameters.
func buildURL(event events.APIGatewayProxyRequest) *url.URL {
	u := &url.URL{
		Scheme: "https",
		Host:   getHost(event),
		Path:   event.Path,
	}

	// Build query string from multi-value or single-value query parameters
	query := url.Values{}
	if len(event.MultiValueQueryStringParameters) > 0 {
		for key, values := range event.MultiValueQueryStringParameters {
			for _, value := range values {
				query.Add(key, value)
			}
		}
	} else if len(event.QueryStringParameters) > 0 {
		for key, value := range event.QueryStringParameters {
			query.Set(key, value)
		}
	}
	u.RawQuery = query.Encode()

	return u
}

// getRequestBody extracts the request body from the event, handling base64 decoding if needed.
func getRequestBody(event events.APIGatewayProxyRequest) (io.Reader, error) {
	if event.Body == "" {
		return nil, nil
	}

	if event.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(event.Body)
		if err != nil {
			return nil, err
		}
		return bytes.NewReader(decoded), nil
	}

	return strings.NewReader(event.Body), nil
}

// setRequestHeaders sets the request headers from the event.
// It prefers multi-value headers when available.
func setRequestHeaders(req *http.Request, event events.APIGatewayProxyRequest) {
	// Clear default headers set by httptest.NewRequest
	req.Header = make(http.Header)

	// Use multi-value headers if available (preferred)
	if len(event.MultiValueHeaders) > 0 {
		for key, values := range event.MultiValueHeaders {
			for _, value := range values {
				req.Header.Add(key, value)
			}
		}
	} else {
		// Fall back to single-value headers
		for key, value := range event.Headers {
			req.Header.Set(key, value)
		}
	}
}

// getHost extracts the Host header from the event.
func getHost(event events.APIGatewayProxyRequest) string {
	// Check multi-value headers first
	if hosts, ok := event.MultiValueHeaders["Host"]; ok && len(hosts) > 0 {
		return hosts[0]
	}
	if hosts, ok := event.MultiValueHeaders["host"]; ok && len(hosts) > 0 {
		return hosts[0]
	}

	// Fall back to single-value headers
	if host, ok := event.Headers["Host"]; ok {
		return host
	}
	if host, ok := event.Headers["host"]; ok {
		return host
	}

	return ""
}

// getXForwardedFor extracts the client IP from the X-Forwarded-For header.
func getXForwardedFor(event events.APIGatewayProxyRequest) string {
	// Check multi-value headers first
	if xff, ok := event.MultiValueHeaders["X-Forwarded-For"]; ok && len(xff) > 0 {
		// Return the first IP (original client)
		return strings.Split(xff[0], ",")[0]
	}
	if xff, ok := event.MultiValueHeaders["x-forwarded-for"]; ok && len(xff) > 0 {
		return strings.Split(xff[0], ",")[0]
	}

	// Fall back to single-value headers
	if xff, ok := event.Headers["X-Forwarded-For"]; ok {
		return strings.Split(xff, ",")[0]
	}
	if xff, ok := event.Headers["x-forwarded-for"]; ok {
		return strings.Split(xff, ",")[0]
	}

	return ""
}

// convertResponseToEvent converts an httptest.ResponseRecorder to an API Gateway proxy response.
func convertResponseToEvent(rec *httptest.ResponseRecorder) events.APIGatewayProxyResponse {
	resp := events.APIGatewayProxyResponse{
		StatusCode: rec.Code,
		Headers:    make(map[string]string),
	}

	// Copy headers - for multi-value headers, use MultiValueHeaders
	multiValueHeaders := make(map[string][]string)
	for key, values := range rec.Header() {
		if len(values) > 0 {
			resp.Headers[key] = values[0]
		}
		if len(values) > 1 {
			multiValueHeaders[key] = values
		}
	}
	if len(multiValueHeaders) > 0 {
		resp.MultiValueHeaders = multiValueHeaders
	}

	// Handle response body
	body := rec.Body.Bytes()
	if len(body) > 0 {
		contentType := rec.Header().Get("Content-Type")
		if isBinaryContentType(contentType) {
			resp.Body = base64.StdEncoding.EncodeToString(body)
			resp.IsBase64Encoded = true
		} else {
			resp.Body = string(body)
		}
	}

	return resp
}

// isBinaryContentType determines if the content type represents binary data.
func isBinaryContentType(contentType string) bool {
	if contentType == "" {
		return false
	}

	// Normalize content type (remove parameters like charset)
	contentType = strings.ToLower(strings.Split(contentType, ";")[0])
	contentType = strings.TrimSpace(contentType)

	// Binary content type prefixes
	binaryPrefixes := []string{
		"image/",
		"audio/",
		"video/",
		"application/octet-stream",
		"application/pdf",
		"application/zip",
		"application/gzip",
		"application/x-tar",
		"application/x-gzip",
		"application/x-bzip2",
		"application/x-7z-compressed",
		"application/x-rar-compressed",
		"application/wasm",
		"font/",
	}

	for _, prefix := range binaryPrefixes {
		if strings.HasPrefix(contentType, prefix) {
			return true
		}
	}

	return false
}
