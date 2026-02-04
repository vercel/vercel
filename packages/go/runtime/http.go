package vercel

import (
	"context"
	"net/http"
	"net/url"
	"sync/atomic"
	"time"
)

var (
	// fetchID is an incrementing counter for fetch metrics
	fetchID int64
)

// Transport is an http.RoundTripper that instruments HTTP requests
// and sends fetch metrics to Vercel's infrastructure.
type Transport struct {
	// Base is the underlying RoundTripper. If nil, http.DefaultTransport is used.
	Base http.RoundTripper
}

// RoundTrip implements http.RoundTripper and instruments the request
func (t *Transport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.Base
	if base == nil {
		base = http.DefaultTransport
	}

	// Get request context
	rc := getRequestContext(req.Context())
	if rc == nil || globalRuntime == nil || globalRuntime.ipc == nil {
		// Not in Vercel context, just pass through
		return base.RoundTrip(req)
	}

	// Record start time
	start := time.Now()
	startMs := start.UnixMilli()

	// Make the actual request
	resp, err := base.RoundTrip(req)

	// Calculate duration
	duration := time.Since(start).Milliseconds()

	// Prepare metric
	metric := fetchMetric{
		Method:   req.Method,
		Host:     req.URL.Host,
		Pathname: req.URL.Path,
		Search:   req.URL.RawQuery,
		Start:    startMs,
		Duration: duration,
		ID:       int(atomic.AddInt64(&fetchID, 1)),
	}

	if resp != nil {
		metric.StatusCode = resp.StatusCode
	} else if err != nil {
		metric.StatusCode = 0 // Request failed
	}

	// Send metric (async, don't block the response)
	go globalRuntime.ipc.SendFetchMetric(rc.invocationID, rc.requestID, metric)

	return resp, err
}

// NewClient creates a new http.Client with instrumented transport.
// Use this instead of http.DefaultClient to get fetch metrics.
//
// Example:
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		client := vercel.NewClient()
//		resp, err := client.Get("https://api.example.com/data")
//		// ...
//	}
func NewClient() *http.Client {
	return &http.Client{
		Transport: &Transport{},
	}
}

// NewClientWithBase creates a new instrumented http.Client with a custom base transport.
//
// Example:
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		base := &http.Transport{
//			MaxIdleConns: 100,
//		}
//		client := vercel.NewClientWithBase(base)
//		// ...
//	}
func NewClientWithBase(base http.RoundTripper) *http.Client {
	return &http.Client{
		Transport: &Transport{Base: base},
	}
}

// Get is a convenience function that performs a GET request with instrumentation.
// It uses the request's context to associate the metric with the current invocation.
//
// Example:
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		resp, err := vercel.Get(r.Context(), "https://api.example.com/data")
//		// ...
//	}
func Get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return NewClient().Do(req)
}

// Post is a convenience function that performs a POST request with instrumentation.
func Post(ctx context.Context, url, contentType string, body interface{}) (*http.Response, error) {
	var bodyReader interface {
		Read([]byte) (int, error)
	}
	if body != nil {
		if r, ok := body.(interface{ Read([]byte) (int, error) }); ok {
			bodyReader = r
		}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	return NewClient().Do(req)
}

// Do performs an HTTP request with instrumentation.
// The request's context is used to associate the metric with the current invocation.
func Do(req *http.Request) (*http.Response, error) {
	return NewClient().Do(req)
}

// InstrumentDefaultClient replaces http.DefaultClient's transport with an
// instrumented version. Call this in init() to automatically instrument
// all HTTP requests made with http.DefaultClient.
//
// Note: This modifies the global http.DefaultClient and should be used
// with caution in library code.
//
// Example:
//
//	func init() {
//		vercel.InstrumentDefaultClient()
//	}
//
//	func Handler(w http.ResponseWriter, r *http.Request) {
//		// This request will now be instrumented
//		resp, err := http.Get("https://api.example.com/data")
//		// ...
//	}
func InstrumentDefaultClient() {
	http.DefaultClient.Transport = &Transport{Base: http.DefaultClient.Transport}
}

// InstrumentClient wraps an existing http.Client's transport with instrumentation.
// Returns the same client for chaining.
//
// Example:
//
//	client := &http.Client{Timeout: 30 * time.Second}
//	vercel.InstrumentClient(client)
func InstrumentClient(client *http.Client) *http.Client {
	client.Transport = &Transport{Base: client.Transport}
	return client
}

// parseURL is a helper to safely parse a URL
func parseURL(rawURL string) (*url.URL, error) {
	return url.Parse(rawURL)
}
