// Package ipc implements the runtime IPC wire protocol shared by Go adapters.
package ipc

import (
	"net/http"
	"strconv"
)

type RequestContext struct {
	InvocationID string `json:"invocationId"`
	RequestID    uint64 `json:"requestId"`
}

func ContextFromRequest(r *http.Request) RequestContext {
	id, _ := strconv.ParseUint(r.Header.Get("X-Vercel-Internal-Request-Id"), 10, 64)
	return RequestContext{InvocationID: r.Header.Get("X-Vercel-Internal-Invocation-Id"), RequestID: id}
}

type StartMessage struct {
	Type    string       `json:"type"`
	Payload StartPayload `json:"payload"`
}
type StartPayload struct {
	InitDuration int `json:"initDuration"`
	HTTPPort     int `json:"httpPort"`
}
type EndMessage struct {
	Type    string     `json:"type"`
	Payload EndPayload `json:"payload"`
}
type EndPayload struct {
	Context RequestContext `json:"context"`
	Error   interface{}    `json:"error,omitempty"`
}
type UnrecoverableErrorMessage struct {
	Type    string                    `json:"type"`
	Payload UnrecoverableErrorPayload `json:"payload"`
}
type UnrecoverableErrorPayload struct {
	ExitCode int    `json:"exitCode"`
	Message  string `json:"message"`
}

// LogMessage carries output associated with one invocation. Message is base64.
type LogMessage struct {
	Type    string     `json:"type"`
	Payload LogPayload `json:"payload"`
}
type LogPayload struct {
	Message string         `json:"message"`
	Stream  string         `json:"stream"`
	Context RequestContext `json:"context"`
}
