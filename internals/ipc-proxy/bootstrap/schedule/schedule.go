// Package schedule maps schedule CloudEvent dispatches to the environment a
// schedule process runs with.
package schedule

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	cloudEventType = "com.vercel.schedule.v1beta"
	traceparentEnv = "TRACEPARENT"
	tracestateEnv  = "TRACESTATE"
)

type headerEnvMap struct {
	header string
	env    string
}

// Dispatch header -> contract variable. All are required.
var headerEnv = []headerEnvMap{
	{"Ce-Vssscheduleid", "VERCEL_SCHEDULE_ID"},
	{"Ce-Id", "VERCEL_SCHEDULE_EXECUTION_ID"},
	{"Ce-Vssschedulename", "VERCEL_SCHEDULE_NAME"},
	{"Ce-Vssnamespace", "VERCEL_SCHEDULE_NAMESPACE"},
	{"Ce-Vssscheduledat", "VERCEL_SCHEDULE_SCHEDULED_AT"},
	{"Ce-Vssschedulesource", "VERCEL_SCHEDULE_SOURCE"},
}

func requireHeader(header http.Header, name string) (string, error) {
	value := header.Get(name)
	if value == "" {
		return "", fmt.Errorf(
			"request is missing header %q: not a schedule dispatch",
			strings.ToLower(name),
		)
	}
	return value, nil
}

// Env maps a schedule dispatch to the contract variables, as KEY=VALUE pairs.
// It returns an error when the request is not a schedule dispatch.
func Env(header http.Header) ([]string, error) {
	if version := header.Get("Ce-Specversion"); version != "1.0" {
		return nil, fmt.Errorf(
			"unrecognized CloudEvent spec version %q: expected \"1.0\"", version,
		)
	}
	if eventType := header.Get("Ce-Type"); eventType != cloudEventType {
		return nil, fmt.Errorf(
			"unrecognized CloudEvent type %q: expected %q", eventType, cloudEventType,
		)
	}
	if _, err := requireHeader(header, "Ce-Source"); err != nil {
		return nil, err
	}

	env := make([]string, 0, len(headerEnv))
	for _, pair := range headerEnv {
		value, err := requireHeader(header, pair.header)
		if err != nil {
			return nil, err
		}
		if pair.env == "VERCEL_SCHEDULE_SCHEDULED_AT" {
			scheduledAt, err := time.Parse(time.RFC3339Nano, value)
			if err != nil {
				return nil, fmt.Errorf(
					"invalid schedule time %q: not RFC 3339 with an offset", value,
				)
			}
			value = scheduledAt.UTC().Format("2006-01-02T15:04:05.000Z")
		}
		env = append(env, pair.env+"="+value)
	}
	return env, nil
}

// ChildEnv is base plus this firing's variables, trace context and OIDC token.
// Every schedule variable is set per firing and os/exec keeps the last
// duplicate, so only the optional trace context can go stale. Other
// `VERCEL_SCHEDULE_*` client settings are kept.
func ChildEnv(base []string, scheduleEnv []string, header http.Header) []string {
	env := make([]string, 0, len(base)+len(scheduleEnv)+3)
	for _, entry := range base {
		key, _, _ := strings.Cut(entry, "=")
		if key != traceparentEnv && key != tracestateEnv {
			env = append(env, entry)
		}
	}
	env = append(env, scheduleEnv...)
	for _, name := range []string{traceparentEnv, tracestateEnv} {
		if value := header.Get(name); value != "" {
			env = append(env, name+"="+value)
		}
	}
	// A function gets its OIDC token with each request. Without a request
	// context, SDKs in the process read VERCEL_OIDC_TOKEN instead.
	if token := oidcToken(header); token != "" {
		env = append(env, "VERCEL_OIDC_TOKEN="+token)
	}
	return env
}

// oidcToken prefers the public token header, like the Python runtime.
func oidcToken(header http.Header) string {
	if token := header.Get("X-Vercel-Oidc-Token"); token != "" {
		return token
	}
	return header.Get("X-Vercel-Internal-Oidc-Token")
}
