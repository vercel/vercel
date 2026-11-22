package cli

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

func TestErrorExitCodes(t *testing.T) {
	for err, want := range map[*Error]int{
		{Message: "x"}:          1, // a printed error never exits 0
		{Message: "x", Exit: 2}: 2,
		Silent(0):               0,
		Silent(1):               1,
	} {
		if got := err.ExitCode(); got != want {
			t.Errorf("%+v: exit %d, want %d", err, got, want)
		}
	}
	if !IsNotAuthorized(fmt.Errorf("wrapped: %w", InvalidToken(""))) || IsNotAuthorized(errors.New("x")) {
		t.Error("IsNotAuthorized")
	}
}

func TestFormatIsValidatedWithTheInput(t *testing.T) {
	for args, wantErr := range map[string]string{
		"whoami":               "",
		"whoami --format=JSON": "",
		"whoami -F xml":        `Invalid output format: "xml". Valid formats: json`,
	} {
		inv, err := Parse(testTree(), strings.Fields(args))
		if err != nil {
			t.Fatal(err)
		}
		if got := inv.Validate(); fmt.Sprint(got) != fmt.Sprint(errOrNil(wantErr)) {
			t.Errorf("%s: %v, want %q", args, got, wantErr)
		}
	}
}

func TestReadingAnUndeclaredFlagPanics(t *testing.T) {
	inv, err := Parse(testTree(), []string{"login"})
	if err != nil {
		t.Fatal(err)
	}
	in := NewInput(inv, nil)
	in.Bool(flagGitHub) // declared
	in.Bool(FlagDebug)  // global
	defer func() {
		if r := recover(); r == nil || !strings.Contains(fmt.Sprint(r), "login reads --json, which it does not declare") {
			t.Errorf("recover() = %v", r)
		}
	}()
	in.Bool(FlagJSON)
}

func render(cmd, parent *Command) string {
	return CommandHelp(nil, cmd, parent, 80, &iostreams.ColorScheme{})
}

func TestGroupHelp(t *testing.T) {
	root := groupTree()
	teams, project := root.Child("teams"), root.Child("project")

	help := render(teams, nil)
	for _, want := range []string{
		"  ▲ vercel teams command\n", // an implicit, required "command" argument
		"  Commands:\n\n",
		"\n  list     ",
		"\n  switch   [name]  ", // optional arguments are bracketed
		"\n  members  ",
	} {
		if !strings.Contains(help, want) {
			t.Errorf("teams help missing %q:\n%s", want, help)
		}
	}
	if strings.Contains(help, "\n  Options:") {
		t.Errorf("teams has no options:\n%s", help)
	}

	if help := render(project, nil); !strings.Contains(help, "▲ vercel project [command]\n") || !strings.Contains(help, "(default)") {
		t.Errorf("project help:\n%s", help)
	}

	// A child's synopsis names its group.
	if help := render(teams.Child("ls"), teams); !strings.HasPrefix(help, "\n  ▲ vercel teams list [options]\n") {
		t.Errorf("teams list help:\n%s", help)
	}
}

// RunJSON adds --json and --format, with --format's check, to the
// command's own flags; Run takes neither.
func TestRunJSONAddsTheJSONFlags(t *testing.T) {
	own := &Flag{Name: "since", Type: String}
	flags := make([]*Flag, 1, 4) // spare capacity AllFlags must not write into
	flags[0] = own
	text := &Command{Name: "login", Flags: flags, Run: noop}
	json := &Command{Name: "whoami", Flags: flags, RunJSON: noopJSON}
	root := &Command{Name: "vercel", Children: []*Command{text, json}}

	if got := json.AllFlags(); len(got) != 3 || got[0] != own || got[1] != FlagFormat || got[2] != FlagJSON {
		t.Errorf("AllFlags() = %v", got)
	}
	if len(text.AllFlags()) != 1 || flags[:cap(flags)][1] != nil {
		t.Error("AllFlags changed the command's Flags")
	}
	for args, wantErr := range map[string]string{
		"whoami --json":           "",
		"whoami -F JSON":          "",
		"whoami --since x --json": "",
		"whoami --format xml":     `Invalid output format: "xml". Valid formats: json`,
		"login --json":            "unknown or unexpected option: --json",
		"login --format=json":     "unknown or unexpected option: --format",
	} {
		inv, err := Parse(root, strings.Fields(args))
		if err == nil {
			err = inv.FlagErr
		}
		if err == nil {
			err = inv.Validate()
		}
		if fmt.Sprint(err) != fmt.Sprint(errOrNil(wantErr)) {
			t.Errorf("%s: %v, want %q", args, err, wantErr)
		}
	}
	if help := render(json, nil); !strings.Contains(help, "--format <FORMAT>") || !strings.Contains(help, "--json ") {
		t.Errorf("whoami help has no JSON flags:\n%s", help)
	}
}
