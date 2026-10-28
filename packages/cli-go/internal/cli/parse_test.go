package cli

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func noop(context.Context, *Input) (Result, error) { return nil, nil }

func noopJSON(context.Context, *Input) (JSONResult, error) { return nil, nil }

var flagGitHub = &Flag{Name: "github", Type: Bool, Deprecated: true}

// testTree has a command with JSON output (like whoami) and one with a
// deprecated boolean flag (like login).
func testTree() *Command {
	return &Command{Name: "vercel", Children: []*Command{
		{Name: "whoami", Aliases: []string{"me"}, RunJSON: noopJSON},
		{Name: "login", Flags: []*Flag{flagGitHub}, Run: noop},
	}}
}

func TestParseTopLevel(t *testing.T) {
	cases := []struct {
		args       []string
		name       string
		command    string // "" when none
		rest       []string
		flagErr    string
		err        string
		help, json bool
		scope      string
		changed    []string
	}{
		{args: nil},
		{args: []string{"whoami"}, name: "whoami", command: "whoami"},
		{args: []string{"me"}, name: "me", command: "whoami"},
		{args: []string{"whoami", "--json", "extra"}, name: "whoami", command: "whoami", rest: []string{"extra"}, json: true, changed: []string{"json"}},
		{args: []string{"--scope", "acme", "whoami"}, name: "whoami", command: "whoami", scope: "acme", changed: []string{"scope"}},
		{args: []string{"-dS", "acme", "whoami"}, name: "whoami", command: "whoami", scope: "acme", changed: []string{"debug", "scope"}},
		// Before the command only global flags are known; an unknown one
		// is taken as the command name, as upstream does.
		{args: []string{"--json", "whoami"}, name: "--json", rest: []string{"whoami"}},
		// A command flag error is kept and later global flags still apply.
		{args: []string{"whoami", "--jsn", "--help"}, name: "whoami", command: "whoami", flagErr: "unknown or unexpected option: --jsn", help: true, changed: []string{"help"}},
		{args: []string{"whoami", "--format", "--help"}, name: "whoami", command: "whoami", flagErr: "option requires argument: --format", help: true, changed: []string{"help"}},
		{args: []string{"login", "--json"}, name: "login", command: "login", flagErr: "unknown or unexpected option: --json"},
		// A global flag error ends parsing.
		{args: []string{"whoami", "--jsn", "--scope"}, err: "option requires argument: --scope"},
		{args: []string{"-Sd", "x"}, err: "option requires argument (but was followed by another short argument): -S"},
		// "--" ends parsing; the command may follow it.
		{args: []string{"--", "whoami", "--json"}, name: "whoami", command: "whoami", rest: []string{"--json"}},
		{args: []string{"whoami", "--", "--scope"}, name: "whoami", command: "whoami", rest: []string{"--scope"}},
		// The command name used as a flag value: the command is the token
		// at its position, not the first token equal to its name.
		{args: []string{"-S", "login", "login"}, name: "login", command: "login", scope: "login", changed: []string{"scope"}},
		{args: []string{"--scope", "whoami", "--", "whoami"}, name: "whoami", command: "whoami", scope: "whoami", changed: []string{"scope"}},
		// help is not a command; everything after it is parsed globally.
		{args: []string{"help", "whoami", "--json"}, name: "help", rest: []string{"whoami", "--json"}},
	}
	for _, c := range cases {
		t.Run(strings.Join(c.args, " "), func(t *testing.T) {
			inv, err := Parse(testTree(), c.args)
			if fmt.Sprint(err) != fmt.Sprint(errOrNil(c.err)) {
				t.Fatalf("err %v, want %q", err, c.err)
			}
			if err != nil {
				return
			}
			got := ""
			if inv.Command() != nil {
				got = inv.Command().Name
			}
			if inv.Name != c.name || got != c.command || (c.flagErr == "" && fmt.Sprint(inv.Args) != fmt.Sprint(c.rest)) {
				t.Errorf("name %q command %q args %q", inv.Name, got, inv.Args)
			}
			if fmt.Sprint(inv.FlagErr) != fmt.Sprint(errOrNil(c.flagErr)) {
				t.Errorf("FlagErr %v, want %q", inv.FlagErr, c.flagErr)
			}
			if inv.Bool(FlagHelp) != c.help || inv.Bool(FlagJSON) != c.json || inv.String(FlagScope) != c.scope {
				t.Errorf("help %v json %v scope %q", inv.Bool(FlagHelp), inv.Bool(FlagJSON), inv.String(FlagScope))
			}
			var changed []string
			for _, f := range inv.order {
				changed = append(changed, f.Name)
			}
			if fmt.Sprint(changed) != fmt.Sprint(c.changed) {
				t.Errorf("changed %v, want %v", changed, c.changed)
			}
		})
	}
}

func errOrNil(msg string) error {
	if msg == "" {
		return nil
	}
	return fmt.Errorf("%s", msg)
}

var flagNext = &Flag{Name: "next", Type: Number, Argument: "MS"}

// groupTree has groups shaped like upstream's teams (no default child, a
// `switch` shortcut, a nested group) and project (a default child).
func groupTree() *Command {
	return &Command{Name: "vercel", Children: []*Command{
		{
			Name: "teams", Aliases: []string{"switch", "team"}, Shortcuts: map[string]Shortcut{"switch": {Child: "switch", NoToken: true}},
			InvalidSubcommand: "Please specify a valid subcommand: ls | switch | members",
			Children: []*Command{
				{Name: "list", Aliases: []string{"ls"}, Flags: []*Flag{flagNext}, RunJSON: noopJSON},
				{Name: "switch", Aliases: []string{"change"}, Args: []Arg{{Name: "name"}}, Run: noop},
				{Name: "members", Children: []*Command{{Name: "invite", Run: noop}}},
			},
		},
		{
			Name: "project",
			Children: []*Command{
				{Name: "list", Aliases: []string{"ls"}, Default: true, RunJSON: noopJSON},
				{Name: "add", Args: []Arg{{Name: "name", Required: true}}, Run: noop},
			},
		},
	}}
}

func names(path []*Command) string {
	var s []string
	for _, c := range path {
		s = append(s, c.Name)
	}
	return strings.Join(s, " ")
}

func TestParseGroups(t *testing.T) {
	cases := []struct {
		args     []string
		path     string
		helpPath string // when it differs from path
		rest     []string
		flagErr  string
		json     bool
		next     string
	}{
		{args: []string{"teams", "ls"}, path: "teams list"},
		{args: []string{"team", "ls", "--json"}, path: "teams list", json: true},
		{args: []string{"teams", "list", "x", "--next", "-1"}, path: "teams list", rest: []string{"x"}, next: "-1"},
		{args: []string{"teams", "--scope", "acme", "ls"}, path: "teams list"},
		{args: []string{"teams", "-", "-", "ls"}, path: "teams", rest: []string{"-", "-", "ls"}},
		{args: []string{"teams", "--", "ls"}, path: "teams list"},
		// A group without a matching child stops at the group; startup
		// reports its invalid-subcommand error.
		{args: []string{"teams"}, path: "teams"},
		{args: []string{"teams", "bogus"}, path: "teams", rest: []string{"bogus"}},
		// An unknown flag before the child's name is taken as the name.
		{args: []string{"teams", "--json", "ls"}, path: "teams", rest: []string{"--json", "ls"}},
		// A child's flags are strict, and other levels' flags are unknown.
		{args: []string{"teams", "ls", "--bogus"}, path: "teams list", flagErr: "unknown or unexpected option: --bogus"},
		{args: []string{"teams", "switch", "--json"}, path: "teams switch", flagErr: "unknown or unexpected option: --json"},
		// Three levels.
		{args: []string{"teams", "members", "invite", "a@example.com"}, path: "teams members invite", rest: []string{"a@example.com"}},
		// A shortcut alias also selects its child; help ignores it.
		{args: []string{"switch", "acme"}, path: "teams switch", helpPath: "teams", rest: []string{"acme"}},
		{args: []string{"teams", "switch", "acme"}, path: "teams switch", rest: []string{"acme"}},
		// A default child gets every argument after the group's name.
		{args: []string{"project"}, path: "project list"},
		{args: []string{"project", "foo"}, path: "project list", rest: []string{"foo"}},
		{args: []string{"project", "--json"}, path: "project list", json: true},
		{args: []string{"project", "--json", "ls"}, path: "project list", rest: []string{"ls"}, json: true},
		{args: []string{"project", "-d", "foo", "--json"}, path: "project list", rest: []string{"foo"}, json: true},
		{args: []string{"project", "--bogus"}, path: "project list", flagErr: "unknown or unexpected option: --bogus"},
		{args: []string{"project", "add", "web"}, path: "project add", rest: []string{"web"}},
	}
	for _, c := range cases {
		t.Run(strings.Join(c.args, " "), func(t *testing.T) {
			inv, err := Parse(groupTree(), c.args)
			if err != nil {
				t.Fatal(err)
			}
			if got := names(inv.Path); got != c.path {
				t.Errorf("path %q, want %q", got, c.path)
			}
			wantHelp := c.helpPath
			if wantHelp == "" {
				wantHelp = c.path
			}
			if got := names(inv.HelpPath()); got != wantHelp {
				t.Errorf("help path %q, want %q", got, wantHelp)
			}
			if c.flagErr == "" && fmt.Sprint(inv.Args) != fmt.Sprint(c.rest) {
				t.Errorf("args %q, want %q", inv.Args, c.rest)
			}
			if fmt.Sprint(inv.FlagErr) != fmt.Sprint(errOrNil(c.flagErr)) {
				t.Errorf("FlagErr %v, want %q", inv.FlagErr, c.flagErr)
			}
			if inv.Bool(FlagJSON) != c.json || inv.String(flagNext) != c.next {
				t.Errorf("json %v next %q", inv.Bool(FlagJSON), inv.String(flagNext))
			}
		})
	}
}

func TestFind(t *testing.T) {
	root := groupTree()
	for in, want := range map[string]string{
		"teams switch":         "teams switch",
		"team ls extra":        "teams list",
		"teams bogus":          "teams",
		"switch":               "teams", // shortcuts do not apply to help
		"teams members invite": "teams members invite",
		"nope":                 "",
	} {
		if got := names(Find(root, strings.Fields(in))); got != want {
			t.Errorf("Find(%q) = %q, want %q", in, got, want)
		}
	}
}
