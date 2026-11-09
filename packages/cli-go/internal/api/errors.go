package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// Error is upstream's APIError. Message is "<server message> (<status>)".
type Error struct {
	Status        int
	Message       string
	ServerMessage string
	Code          string
	Slug          string
	Link          string
	Action        string
	RetryAfterMs  *int64
	// The error body's invalidToken and missingToken, which upstream's
	// APIError copies from the body.
	InvalidToken, MissingToken bool
}

func (e *Error) Error() string { return e.Message }

func responseError(res *http.Response) *Error {
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var body map[string]json.RawMessage
	_ = json.Unmarshal(data, &body)
	// Some APIs return `err` instead of `error`.
	fields := body
	for _, key := range []string{"error", "err"} {
		var nested map[string]json.RawMessage
		if raw, ok := body[key]; ok && json.Unmarshal(raw, &nested) == nil {
			fields = nested
			break
		}
	}
	e := &Error{Status: res.StatusCode, ServerMessage: "Response Error"}
	str := func(k string) string {
		var s string
		_ = json.Unmarshal(fields[k], &s)
		return s
	}
	if m := str("message"); m != "" {
		e.ServerMessage = m
	}
	e.Message = fmt.Sprintf("%s (%d)", e.ServerMessage, res.StatusCode)
	e.Code, e.Slug, e.Link, e.Action = str("code"), str("slug"), str("link"), str("action")
	_ = json.Unmarshal(fields["invalidToken"], &e.InvalidToken)
	_ = json.Unmarshal(fields["missingToken"], &e.MissingToken)
	if res.StatusCode == 429 || res.StatusCode == 503 {
		if ms, ok := retryAfterMs(res.Header.Get("Retry-After")); ok {
			e.RetryAfterMs = &ms
		} else if res.StatusCode == 429 {
			zero := int64(0)
			e.RetryAfterMs = &zero
		}
	}
	return e
}

func retryAfterMs(header string) (int64, bool) {
	if header == "" {
		return 0, false
	}
	if secs, err := strconv.ParseInt(header, 10, 64); err == nil {
		return max(secs*1000, 0), true
	}
	if t, err := http.ParseTime(header); err == nil {
		return max(time.Until(t).Milliseconds(), 0), true
	}
	return 0, false
}
