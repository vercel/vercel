package bootstrap_test

import (
	"testing"

	"main/bootstrap"
)

func TestBuildLogMessageParsesJSONLevelWithExtraFields(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`{"time":"2026-03-20T15:55:54.702Z","service":"api","request_id":"123","level":"error","msg":"boom"}`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "error" {
		t.Fatalf("expected error level, got %q", got)
	}

	if got := msg.Payload.Stream; got != "" {
		t.Fatalf("expected structured entry to omit stream, got %q", got)
	}
}

func TestBuildLogMessageDoesNotClassifyJSONWithoutExplicitLevel(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`{"service":"api","msg":"user typed error into the search box"}`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := msg.Payload.Stream; got != bootstrap.StreamStderr {
		t.Fatalf("expected stderr fallback, got %q", got)
	}
}

func TestBuildLogMessageParsesLogfmtLevelWithExtraKeys(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`time=2026-03-20T15:55:54.702Z service=api request_id=123 level=warn msg="slow path"`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "warn" {
		t.Fatalf("expected warn level, got %q", got)
	}

	if got := msg.Payload.Stream; got != "" {
		t.Fatalf("expected structured entry to omit stream, got %q", got)
	}
}

func TestBuildLogMessageUsesExplicitLogfmtLevelNotMessageText(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`service=api msg="error appeared in the user payload" level=info`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "info" {
		t.Fatalf("expected info level, got %q", got)
	}
}

func TestBuildLogMessageDoesNotInferSeverityFromPlainMessageText(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`error appeared in the user payload`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := msg.Payload.Stream; got != bootstrap.StreamStderr {
		t.Fatalf("expected stderr fallback, got %q", got)
	}
}

func TestBuildLogMessageKeepsPlainStdoutAsStdout(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`bootstrap: stdout message`,
		bootstrap.StreamStdout,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := msg.Payload.Stream; got != bootstrap.StreamStdout {
		t.Fatalf("expected stdout stream, got %q", got)
	}
}

func TestBuildLogMessageParsesBracketedLevels(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`[WARN] slow path`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "warn" {
		t.Fatalf("expected warn level, got %q", got)
	}
}

func TestBuildLogMessageTreatsPanicPrefixAsFatal(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`panic: runtime error: index out of range`,
		bootstrap.StreamStderr,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Level; got != "fatal" {
		t.Fatalf("expected fatal level, got %q", got)
	}
}

func TestBuildLogMessageUsesDefaultProcessContext(t *testing.T) {
	msg, ok := bootstrap.BuildLogMessage(
		`{"time":"2026-03-20T15:55:54.702Z","level":"info","msg":"booted"}`,
		bootstrap.StreamStdout,
	)
	if !ok {
		t.Fatal("expected log message to be emitted")
	}

	if got := msg.Payload.Context; got != bootstrap.DefaultRequestContext() {
		t.Fatalf("expected default process context, got %+v", got)
	}
}
