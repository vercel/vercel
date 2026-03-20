package bootstrap

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"sync/atomic"
)

const (
	StreamStdout = "stdout"
	StreamStderr = "stderr"
)

type RequestContext struct {
	InvocationID string `json:"invocationId"`
	RequestID    uint64 `json:"requestId"`
}

type Entry struct {
	Context RequestContext
	Message string
	Level   string
	Stream  string
}

type LogMessage struct {
	Type    string     `json:"type"`
	Payload LogPayload `json:"payload"`
}

type LogPayload struct {
	Context RequestContext `json:"context"`
	Message string         `json:"message"`
	Level   string         `json:"level,omitempty"`
	Stream  string         `json:"stream,omitempty"`
}

type ContextTracker struct {
	mu     sync.Mutex
	active map[string]RequestContext
}

type jsonSeverityFields struct {
	Level        json.RawMessage `json:"level"`
	Severity     json.RawMessage `json:"severity"`
	Lvl          json.RawMessage `json:"lvl"`
	LogLevel     json.RawMessage `json:"log.level"`
	SeverityText json.RawMessage `json:"severity_text"`
}

var (
	ipcReady     atomic.Bool
	initLogBuf   []LogMessage
	initLogBufMu sync.Mutex
)

const maxBufferedInitLogMessages = 1024

func NewContextTracker() *ContextTracker {
	return &ContextTracker{
		active: make(map[string]RequestContext),
	}
}

func (t *ContextTracker) Start(ctx RequestContext) {
	if t == nil {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	t.active[requestContextKey(ctx)] = EnsureRequestContext(ctx)
}

func (t *ContextTracker) Finish(ctx RequestContext) {
	if t == nil {
		return
	}

	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.active, requestContextKey(ctx))
}

func (t *ContextTracker) Current() RequestContext {
	if t == nil {
		return DefaultRequestContext()
	}

	t.mu.Lock()
	defer t.mu.Unlock()

	if len(t.active) != 1 {
		return DefaultRequestContext()
	}

	for _, ctx := range t.active {
		return ctx
	}

	return DefaultRequestContext()
}

func DefaultRequestContext() RequestContext {
	return RequestContext{
		InvocationID: "0",
		RequestID:    0,
	}
}

func EnsureRequestContext(ctx RequestContext) RequestContext {
	if ctx.InvocationID == "" {
		ctx.InvocationID = "0"
	}

	return ctx
}

func BuildEntry(
	message string,
	sourceStream string,
	ctx RequestContext,
) (Entry, bool) {
	trimmed := strings.TrimRight(message, "\r\n")
	if strings.TrimSpace(trimmed) == "" {
		return Entry{}, false
	}

	entry := Entry{
		Context: EnsureRequestContext(ctx),
		Message: trimmed,
	}

	if level, ok := detectStructuredLevel(trimmed); ok {
		entry.Level = level
		return entry, true
	}

	entry.Stream = sourceStream
	return entry, true
}

func ForwardProcessLogs(
	reader io.Reader,
	sourceStream string,
	tracker *ContextTracker,
	emit func(Entry),
	handleReadError func(error),
) {
	bufferedReader := bufio.NewReader(reader)

	for {
		line, err := bufferedReader.ReadString('\n')
		if line != "" {
			ctx := DefaultRequestContext()
			if tracker != nil {
				ctx = tracker.Current()
			}
			if entry, ok := BuildEntry(line, sourceStream, ctx); ok && emit != nil {
				emit(entry)
			}
		}

		if err == nil {
			continue
		}

		if errors.Is(err, io.EOF) {
			return
		}

		if handleReadError != nil {
			handleReadError(err)
		}
		return
	}
}

func logMessageFromEntry(entry Entry) LogMessage {
	return LogMessage{
		Type: "log",
		Payload: LogPayload{
			Context: EnsureRequestContext(entry.Context),
			Message: base64.StdEncoding.EncodeToString([]byte(entry.Message)),
			Level:   entry.Level,
			Stream:  entry.Stream,
		},
	}
}

func emitLogMessage(msg LogMessage) {
	if ipcConn == nil {
		writeLogMessageToLocalOutput(msg)
		return
	}

	if ipcReady.Load() {
		if err := sendIPCMessage(msg); err != nil {
			writeLogMessageToLocalOutput(msg)
		}
		return
	}

	initLogBufMu.Lock()
	if len(initLogBuf) < maxBufferedInitLogMessages {
		initLogBuf = append(initLogBuf, msg)
		initLogBufMu.Unlock()
		return
	}
	initLogBufMu.Unlock()

	writeLogMessageToLocalOutput(msg)
}

func flushBufferedLogMessages() {
	ipcReady.Store(true)

	initLogBufMu.Lock()
	buffered := append([]LogMessage(nil), initLogBuf...)
	initLogBuf = nil
	initLogBufMu.Unlock()

	for _, msg := range buffered {
		if err := sendIPCMessage(msg); err != nil {
			writeLogMessageToLocalOutput(msg)
		}
	}
}

func flushBufferedLogMessagesToLocalOutput() {
	initLogBufMu.Lock()
	buffered := append([]LogMessage(nil), initLogBuf...)
	initLogBuf = nil
	initLogBufMu.Unlock()

	for _, msg := range buffered {
		writeLogMessageToLocalOutput(msg)
	}
}

func writeLogMessageToLocalOutput(msg LogMessage) {
	decoded, err := base64.StdEncoding.DecodeString(msg.Payload.Message)
	if err != nil || len(decoded) == 0 {
		return
	}

	writer := os.Stdout
	switch {
	case msg.Payload.Stream == StreamStderr:
		writer = os.Stderr
	case msg.Payload.Level == "warn" || msg.Payload.Level == "error" || msg.Payload.Level == "fatal":
		writer = os.Stderr
	}

	fmt.Fprintln(writer, string(decoded))
}

func detectStructuredLevel(message string) (string, bool) {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return "", false
	}

	lower := strings.ToLower(trimmed)
	if strings.HasPrefix(lower, "panic:") || strings.HasPrefix(lower, "fatal error:") {
		return "fatal", true
	}

	if level, ok := detectJSONLevel(trimmed); ok {
		return level, true
	}

	if level, ok := detectLogfmtLevel(trimmed); ok {
		return level, true
	}

	if level, ok := detectBracketedLevel(trimmed); ok {
		return level, true
	}

	return "", false
}

func detectJSONLevel(trimmed string) (string, bool) {
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return "", false
	}

	var fields jsonSeverityFields
	if err := json.Unmarshal([]byte(trimmed), &fields); err != nil {
		return "", false
	}

	for _, raw := range []json.RawMessage{
		fields.Level,
		fields.Severity,
		fields.Lvl,
		fields.LogLevel,
		fields.SeverityText,
	} {
		if level, ok := normalizeJSONLevel(raw); ok {
			return level, true
		}
	}

	return "", false
}

func normalizeJSONLevel(raw json.RawMessage) (string, bool) {
	if len(raw) == 0 || string(raw) == "null" {
		return "", false
	}

	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false
	}

	return normalizeLevel(value)
}

func detectLogfmtLevel(line string) (string, bool) {
	for idx := 0; idx < len(line); {
		for idx < len(line) && isSpace(line[idx]) {
			idx++
		}

		if idx >= len(line) {
			break
		}

		keyStart := idx
		for idx < len(line) && isLogfmtKeyChar(line[idx]) {
			idx++
		}

		if keyStart == idx || idx >= len(line) || line[idx] != '=' {
			for idx < len(line) && !isSpace(line[idx]) {
				idx++
			}
			continue
		}

		key := line[keyStart:idx]
		idx++

		value, nextIdx, ok := parseLogfmtValue(line, idx)
		if !ok {
			for idx < len(line) && !isSpace(line[idx]) {
				idx++
			}
			continue
		}

		idx = nextIdx
		if !isSeverityKey(key) {
			continue
		}

		if level, ok := normalizeLevel(value); ok {
			return level, true
		}
	}

	return "", false
}

func detectBracketedLevel(trimmed string) (string, bool) {
	if !strings.HasPrefix(trimmed, "[") {
		return "", false
	}

	endIdx := strings.IndexByte(trimmed, ']')
	if endIdx <= 1 {
		return "", false
	}

	if endIdx+1 < len(trimmed) {
		next := trimmed[endIdx+1]
		if next != ' ' && next != '\t' && next != ':' {
			return "", false
		}
	}

	return normalizeLevel(trimmed[1:endIdx])
}

func normalizeLevel(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "trace", "trc":
		return "debug", true
	case "debug", "dbg":
		return "debug", true
	case "info", "inf":
		return "info", true
	case "warn", "warning", "wrn":
		return "warn", true
	case "error", "err":
		return "error", true
	case "fatal", "critical", "crit", "panic":
		return "fatal", true
	default:
		return "", false
	}
}

func requestContextKey(ctx RequestContext) string {
	return fmt.Sprintf("%s:%d", ctx.InvocationID, ctx.RequestID)
}

func isSeverityKey(key string) bool {
	switch strings.ToLower(key) {
	case "level", "severity", "lvl", "log.level", "severity_text":
		return true
	default:
		return false
	}
}

func isLogfmtKeyChar(char byte) bool {
	return (char >= 'a' && char <= 'z') ||
		(char >= 'A' && char <= 'Z') ||
		(char >= '0' && char <= '9') ||
		char == '_' ||
		char == '-' ||
		char == '.'
}

func isSpace(char byte) bool {
	return char == ' ' || char == '\t' || char == '\n' || char == '\r'
}

func parseLogfmtValue(line string, startIdx int) (string, int, bool) {
	if startIdx >= len(line) {
		return "", startIdx, false
	}

	if line[startIdx] != '"' {
		endIdx := startIdx
		for endIdx < len(line) && !isSpace(line[endIdx]) {
			endIdx++
		}
		return line[startIdx:endIdx], endIdx, true
	}

	var builder strings.Builder
	for idx := startIdx + 1; idx < len(line); idx++ {
		switch line[idx] {
		case '\\':
			if idx+1 >= len(line) {
				return "", idx, false
			}
			builder.WriteByte(line[idx+1])
			idx++
		case '"':
			return builder.String(), idx + 1, true
		default:
			builder.WriteByte(line[idx])
		}
	}

	return "", len(line), false
}
