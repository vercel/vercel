package vercelcmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// A command's own checks run before startup writes config.json, logs in,
// resolves --scope or makes any request.
func TestCommandChecksRunBeforeAnyWork(t *testing.T) {
	for name, env := range map[string]map[string]string{
		"logged out":       {},
		"logged out agent": {"AI_AGENT": "codex"}, // would start the login flow
	} {
		t.Run(name, func(t *testing.T) {
			h := newHarness(t)
			for k, v := range env {
				h.env[k] = v
			}
			if code := h.run("--scope", "acme", "teams", "ls", "--limit", "0"); code != 1 {
				t.Errorf("exit %d", code)
			}
			if want := "Error: Please provide an integer from 1 to 100 for option --limit\n"; !strings.HasSuffix(h.stderr.String(), want) {
				t.Errorf("stderr %q", h.stderr)
			}
			if strings.Contains(h.stderr.String(), "credentials") {
				t.Errorf("started the login flow: %q", h.stderr)
			}
			if len(h.requests) != 0 {
				t.Errorf("requests %v", h.requests)
			}
			if _, err := os.Stat(filepath.Join(h.dir, "cfg", "config.json")); !os.IsNotExist(err) {
				t.Errorf("config.json was written: %v", err)
			}
		})
	}
}
