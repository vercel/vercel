package bootstrap_test

import (
	"testing"

	"main/bootstrap"
)

func TestBuildEntryParsesJSONLevelWithExtraFields(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`{"time":"2026-03-20T15:55:54.702Z","service":"api","request_id":"123","level":"error","msg":"boom"}`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{
			InvocationID: "inv-1",
			RequestID:    42,
		},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "error" {
		t.Fatalf("expected error level, got %q", got)
	}

	if got := entry.Stream; got != "" {
		t.Fatalf("expected structured entry to omit stream, got %q", got)
	}
}

func TestBuildEntryDoesNotClassifyJSONWithoutExplicitLevel(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`{"service":"api","msg":"user typed error into the search box"}`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := entry.Stream; got != bootstrap.StreamStderr {
		t.Fatalf("expected stderr fallback, got %q", got)
	}
}

func TestBuildEntryParsesLogfmtLevelWithExtraKeys(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`time=2026-03-20T15:55:54.702Z service=api request_id=123 level=warn msg="slow path"`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "warn" {
		t.Fatalf("expected warn level, got %q", got)
	}

	if got := entry.Stream; got != "" {
		t.Fatalf("expected structured entry to omit stream, got %q", got)
	}
}

func TestBuildEntryUsesExplicitLogfmtLevelNotMessageText(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`service=api msg="error appeared in the user payload" level=info`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "info" {
		t.Fatalf("expected info level, got %q", got)
	}
}

func TestBuildEntryDoesNotInferSeverityFromPlainMessageText(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`error appeared in the user payload`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := entry.Stream; got != bootstrap.StreamStderr {
		t.Fatalf("expected stderr fallback, got %q", got)
	}
}

func TestBuildEntryKeepsPlainStdoutAsStdout(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`bootstrap: stdout message`,
		bootstrap.StreamStdout,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "" {
		t.Fatalf("expected no inferred level, got %q", got)
	}

	if got := entry.Stream; got != bootstrap.StreamStdout {
		t.Fatalf("expected stdout stream, got %q", got)
	}
}

func TestBuildEntryParsesBracketedLevels(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`[WARN] slow path`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "warn" {
		t.Fatalf("expected warn level, got %q", got)
	}
}

func TestBuildEntryTreatsPanicPrefixAsFatal(t *testing.T) {
	entry, ok := bootstrap.BuildEntry(
		`panic: runtime error: index out of range`,
		bootstrap.StreamStderr,
		bootstrap.RequestContext{},
	)
	if !ok {
		t.Fatal("expected entry to be emitted")
	}

	if got := entry.Level; got != "fatal" {
		t.Fatalf("expected fatal level, got %q", got)
	}
}

func TestContextTrackerFallsBackWhenConcurrent(t *testing.T) {
	tracker := bootstrap.NewContextTracker()
	first := bootstrap.RequestContext{
		InvocationID: "inv-1",
		RequestID:    1,
	}
	second := bootstrap.RequestContext{
		InvocationID: "inv-2",
		RequestID:    2,
	}

	tracker.Start(first)
	if got := tracker.Current(); got != first {
		t.Fatalf("expected current context to be %+v, got %+v", first, got)
	}

	tracker.Start(second)
	if got := tracker.Current(); got != bootstrap.DefaultRequestContext() {
		t.Fatalf("expected concurrent requests to fall back to default context, got %+v", got)
	}

	tracker.Finish(second)
	if got := tracker.Current(); got != first {
		t.Fatalf("expected current context to recover to %+v, got %+v", first, got)
	}
}
