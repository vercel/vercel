package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"io"
	"strconv"
	"sync"
	"sync/atomic"
)

const (
	runtimeControlVersion      = 1
	maxRuntimeControlFrameSize = 256 << 10
	runtimeControlMarker       = ".vercel-runtime-control-v1"
	runtimeRequestKeyHeader    = "X-Vercel-Runtime-V1-Key"
	runtimeInvocationIDHeader  = "X-Vercel-Runtime-V1-Invocation-Id"
	runtimeRequestIDHeader     = "X-Vercel-Runtime-V1-Request-Id"
)

type runtimeControlFrame struct {
	Version    int             `json:"version"`
	Type       string          `json:"type"`
	RequestKey string          `json:"requestKey"`
	Payload    json.RawMessage `json:"payload"`
}

type runtimeRequest struct {
	invocationID    string
	requestID       uint64
	retains         uint64
	requestComplete bool
	ended           bool
}

type runtimeControl struct {
	reader io.Reader

	mu       sync.Mutex
	requests map[string]*runtimeRequest
	nextKey  atomic.Uint64
}

type LogMessage struct {
	Type    string     `json:"type"`
	Payload LogPayload `json:"payload"`
}

type LogPayload struct {
	Context RequestContext `json:"context"`
	Message string         `json:"message"`
	Level   string         `json:"level"`
}

type MetricMessage struct {
	Type    string        `json:"type"`
	Payload MetricPayload `json:"payload"`
}

type MetricPayload struct {
	Context RequestContext  `json:"context"`
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type runtimeLogPayload struct {
	Message *string `json:"message"`
	Level   *string `json:"level"`
}

func newRuntimeControl(reader io.Reader) *runtimeControl {
	return &runtimeControl{
		reader:   reader,
		requests: make(map[string]*runtimeRequest),
	}
}

func (c *runtimeControl) run() {
	var prefix [4]byte
	for {
		if _, err := io.ReadFull(c.reader, prefix[:]); err != nil {
			return
		}

		frameSize := binary.BigEndian.Uint32(prefix[:])
		if frameSize > maxRuntimeControlFrameSize {
			if _, err := io.CopyN(io.Discard, c.reader, int64(frameSize)); err != nil {
				return
			}
			continue
		}

		body := make([]byte, int(frameSize))
		if _, err := io.ReadFull(c.reader, body); err != nil {
			return
		}

		var frame runtimeControlFrame
		if err := json.Unmarshal(body, &frame); err != nil {
			continue
		}
		if message := c.handleFrame(frame); message != nil {
			_ = sendIPCMessage(message)
		}
	}
}

func (c *runtimeControl) registerRequest(invocationID string, requestID uint64) string {
	key := strconv.FormatUint(c.nextKey.Add(1), 10)

	c.mu.Lock()
	c.requests[key] = &runtimeRequest{
		invocationID: invocationID,
		requestID:    requestID,
	}
	c.mu.Unlock()

	return key
}

func (c *runtimeControl) endRequest(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	request, ok := c.requests[key]
	if !ok {
		return
	}
	request.ended = true
	c.cleanupRequestLocked(key, request)
}

func (c *runtimeControl) handleFrame(frame runtimeControlFrame) interface{} {
	if frame.Version != runtimeControlVersion {
		return nil
	}

	c.mu.Lock()
	request, ok := c.requests[frame.RequestKey]
	if !ok {
		c.mu.Unlock()
		return nil
	}

	context := RequestContext{
		InvocationID: request.invocationID,
		RequestID:    request.requestID,
	}
	switch frame.Type {
	case "retain":
		if request.retains != ^uint64(0) {
			request.retains++
		}
	case "release":
		if request.retains > 0 {
			request.retains--
		}
		c.cleanupRequestLocked(frame.RequestKey, request)
	case "request-complete":
		request.requestComplete = true
		c.cleanupRequestLocked(frame.RequestKey, request)
	case "log", "fetch-metric":
		// Translation happens after releasing the registry lock.
	default:
		c.mu.Unlock()
		return nil
	}
	c.mu.Unlock()

	return translateRuntimeFrame(frame, context)
}

func (c *runtimeControl) cleanupRequestLocked(key string, request *runtimeRequest) {
	if request.ended && request.requestComplete && request.retains == 0 {
		delete(c.requests, key)
	}
}

func translateRuntimeFrame(frame runtimeControlFrame, context RequestContext) interface{} {
	switch frame.Type {
	case "log":
		var payload runtimeLogPayload
		if err := json.Unmarshal(frame.Payload, &payload); err != nil || payload.Message == nil || payload.Level == nil {
			return nil
		}
		return LogMessage{
			Type: "log",
			Payload: LogPayload{
				Context: context,
				Message: base64.StdEncoding.EncodeToString([]byte(*payload.Message)),
				Level:   *payload.Level,
			},
		}
	case "fetch-metric":
		if len(frame.Payload) == 0 || !json.Valid(frame.Payload) {
			return nil
		}
		return MetricMessage{
			Type: "metric",
			Payload: MetricPayload{
				Context: context,
				Type:    "fetch-metric",
				Payload: frame.Payload,
			},
		}
	default:
		return nil
	}
}
