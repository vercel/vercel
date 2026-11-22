package schedule

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func dispatchHeader() http.Header {
	header := http.Header{}
	for name, value := range map[string]string{
		"Ce-Specversion":       "1.0",
		"Ce-Type":              "com.vercel.schedule.v1beta",
		"Ce-Source":            "/schedule/default/nightly",
		"Ce-Id":                "execution-id",
		"Ce-Vssscheduledat":    "2026-09-02T14:00:00+02:00",
		"Ce-Vssscheduleid":     "schedule-id",
		"Ce-Vssschedulename":   "nightly",
		"Ce-Vssnamespace":      "default",
		"Ce-Vssschedulesource": "static",
	} {
		header.Set(name, value)
	}
	return header
}

func TestEnv(t *testing.T) {
	env, err := Env(dispatchHeader())
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"VERCEL_SCHEDULE_ID=schedule-id",
		"VERCEL_SCHEDULE_EXECUTION_ID=execution-id",
		"VERCEL_SCHEDULE_NAME=nightly",
		"VERCEL_SCHEDULE_NAMESPACE=default",
		"VERCEL_SCHEDULE_SCHEDULED_AT=2026-09-02T12:00:00.000Z",
		"VERCEL_SCHEDULE_SOURCE=static",
	}
	if !reflect.DeepEqual(env, want) {
		t.Fatalf("env = %q, want %q", env, want)
	}

	for name, value := range map[string]string{
		"Ce-Type":            "other",
		"Ce-Vssschedulename": "",
		"Ce-Vssscheduledat":  "2026-09-02T12:00:00",
	} {
		header := dispatchHeader()
		header.Set(name, value)
		if _, err := Env(header); err == nil {
			t.Errorf("%s=%q: expected a dispatch error", name, value)
		}
	}
}

// Client settings that share the prefix, such as the Schedules API base URL,
// must reach the process.
func TestChildEnvKeepsClientSettingsAndDropsStaleTraceContext(t *testing.T) {
	header := dispatchHeader()
	header.Set("Traceparent", "00-abc-def-01")
	base := []string{"VERCEL_SCHEDULE_BASE_URL=http://schedules.test", "TRACESTATE=stale"}
	env := ChildEnv(base, []string{"VERCEL_SCHEDULE_NAME=nightly"}, header)
	want := []string{
		"VERCEL_SCHEDULE_BASE_URL=http://schedules.test",
		"VERCEL_SCHEDULE_NAME=nightly",
		"TRACEPARENT=00-abc-def-01",
	}
	if !reflect.DeepEqual(env, want) {
		t.Fatalf("env = %q, want %q", env, want)
	}
}

// The process has no request context, so SDKs read the firing's token from
// VERCEL_OIDC_TOKEN, overriding the container's.
func TestChildEnvSetsOIDCToken(t *testing.T) {
	base := []string{"VERCEL_OIDC_TOKEN=container"}
	for _, tt := range []struct {
		name    string
		headers map[string]string
		want    string
	}{
		{"public", map[string]string{"X-Vercel-Oidc-Token": "public", "X-Vercel-Internal-Oidc-Token": "internal"}, "public"},
		{"internal", map[string]string{"X-Vercel-Internal-Oidc-Token": "internal"}, "internal"},
		{"none", nil, "container"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			header := dispatchHeader()
			for name, value := range tt.headers {
				header.Set(name, value)
			}
			if got := lookupEnv(ChildEnv(base, nil, header), "VERCEL_OIDC_TOKEN"); got != tt.want {
				t.Fatalf("VERCEL_OIDC_TOKEN = %q, want %q", got, tt.want)
			}
		})
	}
}

// os/exec uses the last value of a duplicated key.
func lookupEnv(env []string, key string) (value string) {
	for _, entry := range env {
		if name, v, _ := strings.Cut(entry, "="); name == key {
			value = v
		}
	}
	return value
}
