package vercelcmd

import (
	"path/filepath"
	"strings"
	"testing"
)

// Errors are the same text for people and agents, on stderr, with their
// recovery commands. Those keep the failed command's context flags, quoted
// for the shell, but never --token.
func TestErrorsPrintRecoveryCommands(t *testing.T) {
	h := newHarness(t)
	h.write("cfg/auth.json", loggedIn)
	h.routes["GET /v2/user"] = user
	h.routes["GET /v1/teams"] = `{"teams":[` + acme + `]}`
	ctx := " --api " + h.api.URL + " --global-config " + filepath.Join(h.dir, "cfg")
	list := "  List the teams you can switch to:\n    vercel teams list" + ctx
	switchTo := "  Switch to a team by its slug:\n    vercel teams switch <SLUG>" + ctx + "\n"

	for _, c := range []struct {
		agent bool
		args  []string
		want  string
	}{
		{false, []string{"teams", "switch", "nope", "--cwd", "my dir", "--token", "secret"},
			"Error: You do not have permission to access scope nope.\n\n" + list + " --cwd 'my dir'\n"},
		{false, []string{"teams", "switch"}, "Error: A team slug is required.\n\n" + switchTo + list + "\n"},
		{true, []string{"teams", "switch"}, "Error: In non-interactive mode a team slug is required.\n\n" + switchTo + list + "\n"},
		{true, []string{"teams", "switch", "nope"}, "Error: You do not have permission to access scope nope.\n\n" + list + "\n"},
		{true, []string{"whoami", "--jsn"}, "✗ unknown or unexpected option: --jsn\n" +
			"  Vercel CLI 0.0.0-dev accepts: --api, --cwd, --debug, --format, --global-config, --help, --json, --local-config, --no-color, --non-interactive, --scope, --team, --token, --version. Did you mean --json?\n"},
		{true, []string{"teams", "ls", "--limit", "0"}, "Error: Please provide an integer from 1 to 100 for option --limit\n"},
	} {
		delete(h.env, "AI_AGENT")
		if c.agent {
			h.env["AI_AGENT"] = "codex"
		}
		if code := h.run(c.args...); code == 0 {
			t.Errorf("%v: exit 0", c.args)
		}
		if h.stdout.Len() != 0 {
			t.Errorf("%v: stdout %q", c.args, h.stdout)
		}
		if !strings.HasSuffix(h.stderr.String(), c.want) {
			t.Errorf("%v: stderr:\n%s\nwant it to end with\n%s", c.args, h.stderr, c.want)
		}
	}
}

// In non-interactive mode, an API error also says what to do next.
func TestAgentAPIErrorsSayWhatToDo(t *testing.T) {
	h := newHarness(t)
	h.write("cfg/auth.json", loggedIn)
	h.env["AI_AGENT"] = "codex"
	h.statuses["GET /v2/user"] = 402
	h.routes["GET /v2/user"] = `{"error":{"code":"payment_required","message":"Your subscription has ended"}}`
	if code := h.run("whoami"); code != 1 {
		t.Fatalf("exit %d", code)
	}
	want := "Error: Your subscription has ended\n" +
		"  Ask a team owner to confirm the required plan or subscription before changing billing. Retry after access is enabled.\n"
	if h.stdout.Len() != 0 || !strings.HasSuffix(h.stderr.String(), want) {
		t.Errorf("stdout %q\nstderr:\n%s\nwant it to end with\n%s", h.stdout, h.stderr, want)
	}
}
