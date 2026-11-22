package clisession

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoad(t *testing.T) {
	start := time.UnixMilli(1_700_000_000_000)
	ids := 0
	newID := func() string { ids++; return string(rune('a' + ids - 1)) }
	dir := t.TempDir()

	first := Load(dir, start, newID)
	if first.ID != "a" || first.CreatedAt != start.UnixMilli() || first.LastSeenAt != start.UnixMilli() {
		t.Fatalf("new session %+v", first)
	}
	data, err := os.ReadFile(filepath.Join(dir, "telemetry-session.json"))
	if want := "{\n  \"id\": \"a\",\n  \"createdAt\": 1700000000000,\n  \"lastSeenAt\": 1700000000000\n}\n"; err != nil || string(data) != want {
		t.Errorf("file %q, %v", data, err)
	}
	if info, _ := os.Stat(filepath.Join(dir, "telemetry-session.json")); info.Mode().Perm() != 0o600 {
		t.Errorf("mode %o", info.Mode().Perm())
	}

	cases := []struct {
		name  string
		after time.Duration // since the last run
		want  string
	}{
		{"within 30 minutes reuses it", 29 * time.Minute, "a"},
		{"after 30 idle minutes starts a new one", 31 * time.Minute, "b"},
	}
	now := start
	for _, c := range cases {
		now = now.Add(c.after)
		if s := Load(dir, now, newID); s.ID != c.want || s.LastSeenAt != now.UnixMilli() {
			t.Errorf("%s: %+v", c.name, s)
		}
	}

	// Active sessions still end after a day.
	created := now
	for i := 0; i < 50; i++ {
		now = now.Add(29 * time.Minute)
		s := Load(dir, now, newID)
		if now.Sub(created) > maxLifetime {
			if s.ID == "b" {
				t.Fatalf("session outlived %s", maxLifetime)
			}
			break
		}
		if s.ID != "b" {
			t.Fatalf("active session replaced after %s", now.Sub(created))
		}
	}
}

func TestTouchAndMalformedFiles(t *testing.T) {
	dir := t.TempDir()
	now := time.UnixMilli(1_700_000_000_000)
	s := Load(dir, now, func() string { return "a" })
	s.Touch(now.Add(time.Minute))
	if again := Load(dir, now.Add(31*time.Minute), func() string { return "new" }); again.ID != "a" {
		t.Errorf("Touch did not extend the session: %+v", again)
	}
	for _, content := range []string{`not json`, `{"id":1,"createdAt":1,"lastSeenAt":1}`, `{"id":"x","createdAt":"1","lastSeenAt":1}`, `{"id":"x"}`} {
		path := filepath.Join(dir, "telemetry-session.json")
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
		if got := Load(dir, now, func() string { return "fresh" }); got.ID != "fresh" {
			t.Errorf("%s: reused %+v", content, got)
		}
	}
	// An unwritable directory still gives an ID.
	if s := Load(filepath.Join(dir, "telemetry-session.json", "sub"), now, func() string { return "id" }); s.ID != "id" {
		t.Errorf("%+v", s)
	}
}
