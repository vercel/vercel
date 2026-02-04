package vercel

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"sync"
)

const (
	// IPC message terminator
	msgTerminator = '\x00'
)

// IPCClient handles communication with Vercel's infrastructure via Unix socket
type IPCClient struct {
	conn     net.Conn
	mu       sync.Mutex
	buffer   []ipcMessage // Buffer for messages before connection is ready
	bufferMu sync.Mutex
	ready    bool
}

// ipcMessage represents a generic IPC message
type ipcMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// serverStartedPayload is the payload for server-started message
type serverStartedPayload struct {
	InitDuration int `json:"initDuration"`
	HTTPPort     int `json:"httpPort"`
}

// handlerStartedPayload is the payload for handler-started message
type handlerStartedPayload struct {
	HandlerStartedAt int64            `json:"handlerStartedAt"`
	Context          requestIDContext `json:"context"`
}

// endPayload is the payload for end message
type endPayload struct {
	Context requestIDContext `json:"context"`
	Error   *errorPayload    `json:"error"`
}

// errorPayload represents an error in the end message
type errorPayload struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

// logPayload is the payload for log message
type logPayload struct {
	Context requestIDContext `json:"context"`
	Message string           `json:"message"` // base64 encoded
	Level   string           `json:"level,omitempty"`
	Stream  string           `json:"stream,omitempty"`
}

// metricPayload is the payload for metric message
type metricPayload struct {
	Context requestIDContext `json:"context"`
	Type    string           `json:"type"`
	Payload fetchMetric      `json:"payload"`
}

// fetchMetric represents a fetch metric
type fetchMetric struct {
	Pathname   string `json:"pathname"`
	Search     string `json:"search,omitempty"`
	Start      int64  `json:"start"`
	Duration   int64  `json:"duration"`
	Host       string `json:"host"`
	StatusCode int    `json:"statusCode"`
	Method     string `json:"method"`
	ID         int    `json:"id"`
}

// requestIDContext contains the invocation and request IDs
type requestIDContext struct {
	InvocationID string `json:"invocationId"`
	RequestID    int    `json:"requestId"`
}

// NewIPCClient creates a new IPC client
func NewIPCClient() (*IPCClient, error) {
	ipcPath := os.Getenv("VERCEL_IPC_PATH")
	if ipcPath == "" {
		// Not running in Vercel environment
		return nil, nil
	}

	client := &IPCClient{
		buffer: make([]ipcMessage, 0),
	}

	conn, err := net.Dial("unix", ipcPath)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to IPC socket: %w", err)
	}

	client.conn = conn
	return client, nil
}

// send sends a message over the IPC connection
func (c *IPCClient) send(msg ipcMessage) error {
	if c == nil || c.conn == nil {
		return nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal IPC message: %w", err)
	}

	// Append null terminator
	data = append(data, msgTerminator)

	_, err = c.conn.Write(data)
	if err != nil {
		return fmt.Errorf("failed to write to IPC socket: %w", err)
	}

	return nil
}

// bufferMessage buffers a message for later sending
func (c *IPCClient) bufferMessage(msg ipcMessage) {
	if c == nil {
		return
	}
	c.bufferMu.Lock()
	defer c.bufferMu.Unlock()
	c.buffer = append(c.buffer, msg)
}

// flushBuffer sends all buffered messages
func (c *IPCClient) flushBuffer() error {
	if c == nil {
		return nil
	}
	c.bufferMu.Lock()
	messages := c.buffer
	c.buffer = nil
	c.bufferMu.Unlock()

	for _, msg := range messages {
		if err := c.send(msg); err != nil {
			return err
		}
	}
	return nil
}

// SendServerStarted sends the server-started message
func (c *IPCClient) SendServerStarted(initDurationMs int, httpPort int) error {
	msg := ipcMessage{
		Type: "server-started",
		Payload: serverStartedPayload{
			InitDuration: initDurationMs,
			HTTPPort:     httpPort,
		},
	}

	if err := c.send(msg); err != nil {
		return err
	}

	// Mark as ready and flush buffer
	c.bufferMu.Lock()
	c.ready = true
	c.bufferMu.Unlock()

	return c.flushBuffer()
}

// SendHandlerStarted sends the handler-started message
func (c *IPCClient) SendHandlerStarted(invocationID string, requestID int, startedAt int64) error {
	return c.send(ipcMessage{
		Type: "handler-started",
		Payload: handlerStartedPayload{
			HandlerStartedAt: startedAt,
			Context: requestIDContext{
				InvocationID: invocationID,
				RequestID:    requestID,
			},
		},
	})
}

// SendEnd sends the end message
func (c *IPCClient) SendEnd(invocationID string, requestID int, err error) error {
	payload := endPayload{
		Context: requestIDContext{
			InvocationID: invocationID,
			RequestID:    requestID,
		},
	}

	if err != nil {
		payload.Error = &errorPayload{
			Name:    "Error",
			Message: err.Error(),
		}
	}

	return c.send(ipcMessage{
		Type:    "end",
		Payload: payload,
	})
}

// SendLog sends a log message
func (c *IPCClient) SendLog(invocationID string, requestID int, level, message string) error {
	if c == nil {
		return nil
	}

	msg := ipcMessage{
		Type: "log",
		Payload: logPayload{
			Context: requestIDContext{
				InvocationID: invocationID,
				RequestID:    requestID,
			},
			Message: base64.StdEncoding.EncodeToString([]byte(message)),
			Level:   level,
		},
	}

	// Buffer if not ready yet
	c.bufferMu.Lock()
	ready := c.ready
	c.bufferMu.Unlock()

	if !ready {
		c.bufferMessage(msg)
		return nil
	}

	return c.send(msg)
}

// SendStreamLog sends a raw stream log (stdout/stderr)
func (c *IPCClient) SendStreamLog(invocationID string, requestID int, stream, message string) error {
	if c == nil {
		return nil
	}

	msg := ipcMessage{
		Type: "log",
		Payload: logPayload{
			Context: requestIDContext{
				InvocationID: invocationID,
				RequestID:    requestID,
			},
			Message: base64.StdEncoding.EncodeToString([]byte(message)),
			Stream:  stream,
		},
	}

	c.bufferMu.Lock()
	ready := c.ready
	c.bufferMu.Unlock()

	if !ready {
		c.bufferMessage(msg)
		return nil
	}

	return c.send(msg)
}

// SendFetchMetric sends a fetch metric
func (c *IPCClient) SendFetchMetric(invocationID string, requestID int, metric fetchMetric) error {
	return c.send(ipcMessage{
		Type: "metric",
		Payload: metricPayload{
			Context: requestIDContext{
				InvocationID: invocationID,
				RequestID:    requestID,
			},
			Type:    "fetch-metric",
			Payload: metric,
		},
	})
}

// Close closes the IPC connection
func (c *IPCClient) Close() error {
	if c == nil || c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

// FlushToStderr writes buffered logs to stderr (used during shutdown if IPC failed)
func (c *IPCClient) FlushToStderr() {
	if c == nil {
		return
	}
	c.bufferMu.Lock()
	messages := c.buffer
	c.buffer = nil
	c.bufferMu.Unlock()

	for _, msg := range messages {
		if msg.Type == "log" {
			if payload, ok := msg.Payload.(logPayload); ok {
				decoded, _ := base64.StdEncoding.DecodeString(payload.Message)
				fmt.Fprintf(os.Stderr, "[%s] %s\n", payload.Level, string(decoded))
			}
		}
	}
}
