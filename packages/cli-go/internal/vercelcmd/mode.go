package vercelcmd

import (
	"cmp"
	"fmt"
	"os"
	"slices"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/cli"
)

// Rules upstream reads from raw argv, which the parser cannot express.

// detectAgent is @vercel/detect-agent; the first match wins.
func detectAgent(getenv func(string) string) string {
	if name := strings.TrimSpace(getenv("AI_AGENT")); name != "" {
		if name == "github-copilot-cli" {
			return "github-copilot"
		}
		return name
	}
	switch {
	case getenv("CURSOR_TRACE_ID") != "":
		return "cursor"
	case getenv("CURSOR_AGENT") != "" || getenv("CURSOR_EXTENSION_HOST_ROLE") == "agent-exec":
		return "cursor-cli"
	case getenv("GEMINI_CLI") != "":
		return "gemini"
	case getenv("CODEX_SANDBOX") != "" || getenv("CODEX_CI") != "" || getenv("CODEX_THREAD_ID") != "":
		return "codex"
	case getenv("ANTIGRAVITY_AGENT") != "":
		return "antigravity"
	case getenv("AUGMENT_AGENT") != "":
		return "augment-cli"
	case getenv("OPENCODE_CLIENT") != "":
		return "opencode"
	case getenv("CLAUDECODE") != "" || getenv("CLAUDE_CODE") != "":
		if getenv("CLAUDE_CODE_IS_COWORK") != "" {
			return "cowork"
		}
		return "claude"
	case getenv("REPL_ID") != "":
		return "replit"
	case getenv("COPILOT_MODEL") != "" || getenv("COPILOT_ALLOW_ALL") != "" || getenv("COPILOT_GITHUB_TOKEN") != "":
		return "github-copilot"
	}
	if _, err := os.Stat("/opt/.devin"); err == nil {
		return "devin"
	}
	return ""
}

// nonInteractive: --non-interactive, or an agent without a terminal on
// stdin; an explicit false wins.
func nonInteractive(argv []string, isAgent, stdinTTY bool) bool {
	flag, explicitFalse := nonInteractiveArgs(argv)
	return !explicitFalse && (flag || isAgent && !stdinTTY)
}

// nonInteractiveArgs reads "--non-interactive false" and
// "--non-interactive=false", which the parser reads as true.
func nonInteractiveArgs(argv []string) (flag, explicitFalse bool) {
	for i, a := range argv {
		switch {
		case a == "--non-interactive=false":
			explicitFalse = true
		case a == "--non-interactive":
			flag = true
			explicitFalse = explicitFalse || i+1 < len(argv) && argv[i+1] == "false"
		}
	}
	return flag, explicitFalse
}

func modeDebug(mode cli.Mode, flag bool, env Env) string {
	name, tty := cmp.Or(mode.AgentName, "none"), "undefined"
	if env.StdinTTY {
		tty = "true"
	}
	_, explicitFalse := nonInteractiveArgs(env.Args)
	return fmt.Sprintf("Agent/TTY/nonInteractive: isAgent=%v agentName=%s stdin.isTTY=%s --non-interactive=%v explicitFalse=%v => nonInteractive=%v",
		mode.AgentName != "", name, tty, flag, explicitFalse, mode.NonInteractive)
}

// printsBanner is shouldPrintVersionBanner: --help shows it; api, --json
// and --format json hide it.
func printsBanner(command string, args []string) bool {
	if slices.Contains(args, "--help") || slices.Contains(args, "-h") {
		return true
	}
	if command == "api" || slices.Contains(args, "--json") {
		return false
	}
	for i, a := range args {
		if strings.ToLower(a) == "--format=json" || a == "--format" && i+1 < len(args) && strings.ToLower(args[i+1]) == "json" {
			return false
		}
	}
	return true
}
