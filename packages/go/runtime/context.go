package vercel

import (
	"context"
	"sync"
)

// contextKey is the type for context keys to avoid collisions
type contextKey int

const (
	requestContextKey contextKey = iota
)

// requestContext holds per-request state for the Vercel runtime
type requestContext struct {
	invocationID string
	requestID    int
	waitGroup    *sync.WaitGroup
}

// newRequestContext creates a new request context
func newRequestContext(invocationID string, requestID int) *requestContext {
	return &requestContext{
		invocationID: invocationID,
		requestID:    requestID,
		waitGroup:    &sync.WaitGroup{},
	}
}

// withRequestContext adds the request context to a context.Context
func withRequestContext(ctx context.Context, rc *requestContext) context.Context {
	return context.WithValue(ctx, requestContextKey, rc)
}

// getRequestContext retrieves the request context from a context.Context
func getRequestContext(ctx context.Context) *requestContext {
	if ctx == nil {
		return nil
	}
	rc, _ := ctx.Value(requestContextKey).(*requestContext)
	return rc
}
