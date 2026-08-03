package vercel

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"sync/atomic"
	"time"
)

var fetchID uint64

// Transport instruments an underlying HTTP transport with runtime fetch metrics.
type Transport struct {
	Base http.RoundTripper
}

// RoundTrip performs an HTTP request and reports its result to the runtime proxy.
func (t *Transport) RoundTrip(req *http.Request) (*http.Response, error) {
	base := t.Base
	if base == nil {
		base = http.DefaultTransport
	}

	started := time.Now()
	response, err := base.RoundTrip(req)
	duration := time.Since(started)

	statusCode := 0
	if response != nil {
		statusCode = response.StatusCode
	}
	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	pathname := req.URL.Path
	if pathname == "" {
		pathname = "/"
	}
	// time.Time.UnixMilli was added in Go 1.17, but the runtime supports Go 1.13.
	startMillis := started.UnixNano() / int64(time.Millisecond)
	sendFrame("fetch-metric", requestKey(req.Context()), map[string]interface{}{
		"pathname":   pathname,
		"search":     req.URL.RawQuery,
		"start":      startMillis,
		"duration":   duration.Milliseconds(),
		"host":       req.URL.Host,
		"statusCode": statusCode,
		"method":     method,
		"id":         atomic.AddUint64(&fetchID, 1),
	})
	return response, err
}

// NewClient returns an HTTP client instrumented with the default transport.
func NewClient() *http.Client {
	return NewClientWithBase(http.DefaultTransport)
}

// NewClientWithBase returns an instrumented HTTP client using base for requests.
func NewClientWithBase(base http.RoundTripper) *http.Client {
	return &http.Client{Transport: &Transport{Base: base}}
}

// InstrumentClient instruments client in place and returns it.
func InstrumentClient(client *http.Client) *http.Client {
	if client == nil {
		return NewClient()
	}
	if _, ok := client.Transport.(*Transport); !ok {
		client.Transport = &Transport{Base: client.Transport}
	}
	return client
}

// InstrumentDefaultClient instruments http.DefaultClient in place.
func InstrumentDefaultClient() {
	InstrumentClient(http.DefaultClient)
}

// Get performs an instrumented HTTP GET request.
func Get(ctx context.Context, url string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	return Do(req)
}

// Post performs an instrumented HTTP POST request.
func Post(ctx context.Context, url, contentType string, body interface{}) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		var ok bool
		reader, ok = body.(io.Reader)
		if !ok {
			return nil, fmt.Errorf("vercel: POST body has type %T, want io.Reader", body)
		}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	return Do(req)
}

// Do performs an instrumented HTTP request.
func Do(req *http.Request) (*http.Response, error) {
	return NewClient().Do(req)
}
