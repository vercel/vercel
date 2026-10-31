// Package login is `vercel login`: the device login, then a receipt.
package login

import (
	"context"
	"fmt"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cli/needs"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

var deprecatedFlags = []*cli.Flag{cli.FlagGitHub, cli.FlagOOB, cli.FlagGitLab, cli.FlagBitbucket, cli.FlagFuture}

// need: none. Logging in is this command's action, not a state it needs.
var need = needs.Nothing()

var Command = &cli.Command{
	Name:        "login",
	Description: "Sign in to your Vercel account.",
	Basic:       true,
	Args:        []cli.Arg{{Name: "email or team id"}}, // deprecated: only warns
	Flags:       deprecatedFlags,
	Examples:    []cli.Example{{Name: "Sign in to your Vercel account.", Value: []string{"vercel login"}}},
	HelpSections: []cli.HelpSection{{Title: "Notes", Body: []string{
		"Shows a URL to sign in at, and opens it in your browser when it can (not in CI).",
		"",
		"Saves the login in the global `.vercel` directory (see --global-config), or the system keyring when configured.",
		"",
		"Keeps the saved team if you can still access it; otherwise uses your default team.",
	}}},
	Related:           []string{"whoami", "teams list"},
	HiddenGlobalFlags: []*cli.Flag{cli.FlagToken},
	Needs:             need,
	Validate:          validate,
	Run:               run,
}

// validate: the login is what this command makes, so it takes no --token.
func validate(in *cli.Input) error {
	if in.String(cli.FlagToken) != "" {
		return &cli.Error{Message: "`--token` may not be used with the \"login\" command", Exit: 2}
	}
	return nil
}

func run(ctx context.Context, in *cli.Input) (cli.Result, error) {
	ui, cs := in.UI, in.UI.ColorScheme()
	var flags, args []string
	for _, f := range deprecatedFlags {
		if in.Bool(f) {
			flags = append(flags, cs.Bold("--"+f.Name))
		}
	}
	for _, a := range in.Args {
		args = append(args, cs.Bold(a))
	}
	if len(flags) > 0 {
		ui.Warn("The following flags are deprecated: " + strings.Join(flags, ", "))
	}
	if len(args) > 0 {
		ui.Warn("The following arguments are deprecated: " + strings.Join(args, ", "))
	}
	if len(flags) > 0 || len(args) > 0 {
		ui.Print("Read more in our " + ui.Link("changelog", "https://vercel.com/changelog/new-vercel-cli-login-flow", nil, true) + ".\n")
	}
	if err := in.Login(ctx); err != nil {
		return nil, err
	}
	git := ui.Link("vercel.link/git", "https://vercel.link/git", nil, false)
	ui.Print(fmt.Sprintf(`
  %s You are now signed in.

  To deploy something, run %s.
  To set up the Vercel plugin and connect your coding agents to the AI Gateway, run %s.

  %s To deploy every commit automatically,
  connect a Git Repository (%s).
`, cs.Cyan("Congratulations!"), cs.Cmd("vercel"), cs.Cmd("vercel setup"), iostreams.Emoji["tip"], cs.Bold(git)))
	return nil, nil
}
