//go:build !vcdev
// +build !vcdev

package main

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
)

const (
	StreamStdout               = "stdout"
	StreamStderr               = "stderr"
	maxBufferedInitLogMessages = 1024
)

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

type jsonSeverityFields struct {
	Level        json.RawMessage `json:"level"`
	Severity     json.RawMessage `json:"severity"`
	Lvl          json.RawMessage `json:"lvl"`
	LogLevel     json.RawMessage `json:"log.level"`
	SeverityText json.RawMessage `json:"severity_text"`
}

var (
	initLogMutex            sync.Mutex
	initLogReady            bool
	bufferedInitLogMessages []LogMessage
)

func buildLogMessage(message string, sourceStream string) (LogMessage, bool) {
	trimmed := strings.TrimRight(message, "\r\n")
	if strings.TrimSpace(trimmed) == "" {
		return LogMessage{}, false
	}

	payload := LogPayload{
		// Process logs come from the child server's shared stdout/stderr stream.
		// They can include startup, background, and interleaved concurrent-request output,
		// so attributing them to a specific invocation would be misleading.
		Context: RequestContext{
			InvocationID: "0",
			RequestID:    0,
		},
		Message: base64.StdEncoding.EncodeToString([]byte(trimmed)),
	}

	if level, ok := detectStructuredLevel(trimmed); ok {
		payload.Level = level
	} else {
		payload.Stream = sourceStream
	}

	return LogMessage{
		Type:    "log",
		Payload: payload,
	}, true
}

func forwardProcessLogs(
	reader io.Reader,
	sourceStream string,
	handleReadError func(error),
) {
	bufferedReader := bufio.NewReader(reader)

	for {
		line, err := bufferedReader.ReadString('\n')
		if line != "" {
			if msg, ok := buildLogMessage(line, sourceStream); ok {
				emitLogMessage(msg)
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

func emitLogMessage(msg LogMessage) {
	initLogMutex.Lock()
	defer initLogMutex.Unlock()

	if ipcConn == nil {
		writeLogMessageToLocalOutput(msg)
		return
	}

	if initLogReady {
		forwardLogMessageToIPCOrLocalOutput(msg)
		return
	}

	if len(bufferedInitLogMessages) < maxBufferedInitLogMessages {
		bufferedInitLogMessages = append(bufferedInitLogMessages, msg)
		return
	}

	writeLogMessageToLocalOutput(msg)
}

func flushBufferedLogMessages() {
	initLogMutex.Lock()
	defer initLogMutex.Unlock()

	for _, msg := range bufferedInitLogMessages {
		forwardLogMessageToIPCOrLocalOutput(msg)
	}
	bufferedInitLogMessages = nil
	initLogReady = true
}

func flushBufferedLogMessagesToLocalOutput() {
	initLogMutex.Lock()
	defer initLogMutex.Unlock()

	for _, msg := range bufferedInitLogMessages {
		writeLogMessageToLocalOutput(msg)
	}
	bufferedInitLogMessages = nil
	initLogReady = true
}

func forwardLogMessageToIPCOrLocalOutput(msg LogMessage) {
	if err := sendIPCMessage(msg); err != nil {
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

// detectStructuredLevel recognizes explicit severity formats commonly emitted
// by Go loggers, such as `slog` JSON/text output.

// {"level":"error","msg":"boom"}                          // slog JSONHandler
// time=2026-03-20T15:55:54Z level=WARN msg="slow path"    // slog TextHandler
// [INFO] server started
// panic: runtime error: index out of range                 // Go panic output
func detectStructuredLevel(message string) (string, bool) {
	trimmed := strings.TrimSpace(message)
	if trimmed == "" {
		return "", false
	}

	lower := strings.ToLower(trimmed)
	// Go panic output is plain text rather than JSON/logfmt, e.g.
	// `panic: runtime error: index out of range`.
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

// detectJSONLevel recognizes JSON logs with an explicit severity field, e.g.:
//
//	{"time":"2026-03-20T15:55:54Z","level":"ERROR","msg":"boom"} // slog JSONHandler
func detectJSONLevel(trimmed string) (string, bool) {
	if len(trimmed) < 2 || trimmed[0] != '{' || trimmed[len(trimmed)-1] != '}' {
		return "", false
	}

	var fields jsonSeverityFields
	if err := json.Unmarshal([]byte(trimmed), &fields); err != nil {
		return "", false
	}

	// Check the common field names in priority order and return the first
	// recognized severity value.
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

// detectLogfmtLevel recognizes key=value text logs like:
//
//	time=2026-03-20T15:55:54Z level=INFO msg="slow path"   // slog TextHandler
//	time="2026-03-20T15:55:54Z" level=info msg="slow path" // logrus text formatter
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

		// Not a valid key=value token, so skip to the next space-delimited token.
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
			// Malformed value; skip this token rather than failing the whole line.
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

// detectBracketedLevel recognizes logger prefixes like "[WARN] message".
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
