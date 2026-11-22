package cli

import (
	"slices"
	"strings"
	"testing"
)

func TestContextArgs(t *testing.T) {
	root := &Command{Name: "vercel", Children: []*Command{{Name: "whoami"}}}
	for args, want := range map[string]string{
		"whoami":                                  "",
		"--cwd dir whoami -S acme":                "--cwd dir --scope acme",
		"whoami --scope=acme -Q cfg -A x.json":    "--scope acme --global-config cfg --local-config x.json",
		"--team acme whoami":                      "--scope acme",
		"--team old --scope new whoami":           "--scope new",
		"--token secret --api http://x -d whoami": "--api http://x",
		"whoami --cwd a --cwd b":                  "--cwd b",
		"--non-interactive whoami --cwd a":        "--non-interactive --cwd a",
	} {
		inv, err := Parse(root, strings.Fields(args))
		if err != nil {
			t.Fatal(err)
		}
		if got := join(inv.ContextArgs(true)); got != want {
			t.Errorf("%s: %q, want %q", args, got, want)
		}
	}
	// Startup reads "--non-interactive false" from raw argv.
	inv, _ := Parse(root, []string{"--non-interactive", "whoami"})
	if got := join(inv.ContextArgs(false)); got != "" {
		t.Errorf("explicitly false: %q", got)
	}
}

func join(args [][]string) string {
	var all []string
	for _, a := range args {
		all = append(all, a...)
	}
	return strings.Join(all, " ")
}

func TestNextCommand(t *testing.T) {
	n := &Next{Label: "Switch", Argv: []string{"teams", "switch", "<SLUG>"}}
	if got := n.Command(nil); got != "vercel teams switch <SLUG>" {
		t.Errorf("no context: %q", got)
	}
	if got := n.Command([][]string{{"--cwd", "my dir"}, {"--non-interactive"}, {"--scope", "acme"}}); got != "vercel teams switch <SLUG> --cwd 'my dir' --non-interactive --scope acme" {
		t.Errorf("context: %q", got)
	}
	// A flag the suggestion gives itself is not repeated.
	scoped := &Next{Label: "Link", Argv: []string{"link", "--scope", "<TEAM>"}}
	if got := scoped.Command([][]string{{"--scope", "acme"}}); got != "vercel link --scope <TEAM>" {
		t.Errorf("own flag: %q", got)
	}
	for in, want := range map[string]string{"acme": "acme", "a b": "'a b'", "it's": `'it'\''s'`, "<SLUG>": "<SLUG>", "<slug>": "'<slug>'", "$HOME": "'$HOME'"} {
		if got := quoteArg(in); got != want {
			t.Errorf("quoteArg(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNewNextIsDeclared(t *testing.T) {
	n := NewNext("List teams", "teams", "list")
	t.Cleanup(func() { declaredNext = slices.DeleteFunc(declaredNext, func(d *Next) bool { return d == n }) })
	if !slices.Contains(DeclaredNext(), n) {
		t.Error("NewNext did not declare its command")
	}
}
