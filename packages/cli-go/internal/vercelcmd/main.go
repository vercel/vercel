// Package vercelcmd is the entry point: startup as a fixed list of steps,
// and the only place errors become output and exit codes.
package vercelcmd

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"golang.org/x/term"

	"github.com/vercel/vercel/packages/cli-go/internal/cmd/root"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

func Main() int {
	ios := iostreams.System()
	if os.Getenv("CLAUDECODE") != "" {
		fmt.Fprint(os.Stderr, "<claude-code-hint v=\"1\" type=\"plugin\" value=\"vercel@claude-plugins-official\" />\n")
	}
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Error: The current working directory does not exist.")
		return 1
	}
	ctx := notifySignals(context.Background())
	code := Run(ctx, Env{
		IO:          ios,
		Args:        os.Args[1:],
		Cwd:         cwd,
		LookupEnv:   os.LookupEnv,
		HTTP:        httpClient(ios),
		OpenBrowser: openBrowser,
		StdinTTY:    term.IsTerminal(int(os.Stdin.Fd())),
	})
	return signalExit(code, received(ctx))
}

// Env is the process boundary, replaceable in tests.
type Env struct {
	IO          *iostreams.IOStreams
	Args        []string
	Cwd         string
	LookupEnv   func(string) (string, bool)
	HTTP        *http.Client
	OpenBrowser func(string) error
	StdinTTY    bool
	Issuer      string // OAuth issuer override, for tests
}

// Run is Main without process globals. The steps follow upstream's order,
// except that input is checked before any write or request.
func Run(ctx context.Context, env Env) int {
	s := &startup{env: env, ios: env.IO, root: root.Command, invocationID: uuid()}
	defer func() {
		if s.cliSession != nil {
			s.cliSession.Touch(time.Now())
		}
	}()
	for _, step := range []func(context.Context) error{
		s.parseCommandLine,     // flags and arguments, parsed once
		s.readLocalConfig,      // the local vercel.json, for its scope
		s.printEarly,           // the version banner, --version, root help
		s.detectMode,           // agent, CI and interactivity
		s.selectCommand,        // the command, or the error for an unknown one
		s.printCommandHelp,     // <command> --help and help <command>
		s.validateInput,        // subcommand, flags, --format, --token
		s.loadGlobalConfig,     // config.json, created when missing (first write)
		s.loadCredentials,      // the token and where it came from
		s.connect,              // the API and OAuth clients, the saved team, the CLI session
		s.requireLogin,         // Needs.Login without a token: log in first
		s.resolveExplicitScope, // --scope, --team, local scope (first request)
		s.runCommand,           // the command's Input, Run, and its Result
	} {
		if err := step(ctx); err != nil {
			return s.report(err)
		}
	}
	return 0
}
