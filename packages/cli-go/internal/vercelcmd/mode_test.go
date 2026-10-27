package vercelcmd

import (
	"os"
	"testing"
)

func TestDetect(t *testing.T) {
	if _, err := os.Stat("/opt/.devin"); err == nil {
		t.Skip("/opt/.devin exists on this machine")
	}
	cases := []struct {
		env  map[string]string
		want string
	}{
		{nil, ""},
		{map[string]string{"AI_AGENT": " my-agent "}, "my-agent"},
		{map[string]string{"AI_AGENT": "github-copilot-cli"}, "github-copilot"},
		// AI_AGENT wins over every other marker.
		{map[string]string{"AI_AGENT": "custom", "CLAUDECODE": "1"}, "custom"},
		{map[string]string{"CURSOR_TRACE_ID": "x"}, "cursor"},
		{map[string]string{"CURSOR_EXTENSION_HOST_ROLE": "agent-exec"}, "cursor-cli"},
		{map[string]string{"CODEX_THREAD_ID": "t"}, "codex"},
		{map[string]string{"CLAUDECODE": "1"}, "claude"},
		{map[string]string{"CLAUDE_CODE": "1", "CLAUDE_CODE_IS_COWORK": "1"}, "cowork"},
		{map[string]string{"COPILOT_MODEL": "x"}, "github-copilot"},
	}
	for _, c := range cases {
		if got := detectAgent(func(k string) string { return c.env[k] }); got != c.want {
			t.Errorf("%v: detectAgent = %q, want %q", c.env, got, c.want)
		}
	}
}

func TestNonInteractive(t *testing.T) {
	cases := []struct {
		argv     []string
		agent    bool
		stdinTTY bool
		want     bool
	}{
		{nil, false, false, false},
		{[]string{"--non-interactive"}, false, true, true},
		{nil, true, false, true}, // an agent without a terminal
		{nil, true, true, false}, // an agent on a terminal
		{[]string{"--non-interactive=false"}, true, false, false},
		{[]string{"--non-interactive", "false"}, true, false, false},
		// Upstream matches only the bare flag, so "=true" does not count.
		{[]string{"--non-interactive=true"}, false, true, false},
	}
	for _, c := range cases {
		if got := nonInteractive(c.argv, c.agent, c.stdinTTY); got != c.want {
			t.Errorf("%v agent=%v tty=%v: %v, want %v", c.argv, c.agent, c.stdinTTY, got, c.want)
		}
	}
}
