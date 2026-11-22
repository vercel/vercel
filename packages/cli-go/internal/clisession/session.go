// Package clisession is util/telemetry/session.ts: an ID reused while
// invocations are under 30 minutes apart, for up to a day. Writes are best
// effort.
package clisession

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
)

const (
	inactivityTimeout = 30 * time.Minute
	maxLifetime       = 24 * time.Hour
)

// Session times are Unix milliseconds.
type Session struct {
	ID         string `json:"id"`
	CreatedAt  int64  `json:"createdAt"`
	LastSeenAt int64  `json:"lastSeenAt"`

	path string
}

// Load is getOrCreatePersistedCliSession.
func Load(dir string, now time.Time, newID func() string) *Session {
	path := filepath.Join(dir, "telemetry-session.json")
	ms := now.UnixMilli()
	s := read(path)
	if s == nil || ms-s.LastSeenAt > inactivityTimeout.Milliseconds() || ms-s.CreatedAt > maxLifetime.Milliseconds() {
		s = &Session{ID: newID(), CreatedAt: ms}
	}
	s.LastSeenAt, s.path = ms, path
	s.write()
	return s
}

// Touch is touchPersistedCliSession.
func (s *Session) Touch(now time.Time) {
	s.LastSeenAt = now.UnixMilli()
	s.write()
}

// read returns nil for a missing or malformed session.
func read(path string) *Session {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var raw struct {
		ID         *string  `json:"id"`
		CreatedAt  *float64 `json:"createdAt"`
		LastSeenAt *float64 `json:"lastSeenAt"`
	}
	if json.Unmarshal(data, &raw) != nil || raw.ID == nil || raw.CreatedAt == nil || raw.LastSeenAt == nil {
		return nil
	}
	return &Session{ID: *raw.ID, CreatedAt: int64(*raw.CreatedAt), LastSeenAt: int64(*raw.LastSeenAt)}
}

func (s *Session) write() {
	_ = config.WriteFile(s.path, append(config.Stringify(s, "  "), '\n'), 0o600)
}
