package root

import (
	"cmp"
	"flag"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// These tests enforce the command pattern in ARCHITECTURE.md. They walk the
// whole command tree, so a new command is checked automatically.

var update = flag.Bool("update", false, "rewrite help golden files")

// entry is a command and the commands above it, from the top level down.
type entry struct{ path []*cli.Command }

func (e entry) cmd() *cli.Command { return e.path[len(e.path)-1] }

func (e entry) parent() *cli.Command {
	if len(e.path) < 2 {
		return nil
	}
	return e.path[len(e.path)-2]
}

func (e entry) String() string {
	names := []string{"vercel"}
	for _, c := range e.path {
		names = append(names, c.Name)
	}
	return strings.Join(names, " ")
}

func commands(root *cli.Command) []entry {
	var all []entry
	var walk func(path []*cli.Command)
	walk = func(path []*cli.Command) {
		for _, c := range path[len(path)-1].Children {
			p := append(append([]*cli.Command{}, path...), c)
			all = append(all, entry{p[1:]}) // without the root
			walk(p)
		}
	}
	walk([]*cli.Command{root})
	return all
}

// Every command has a description. A command runs and has an example; a
// group has children, no Run, and an invalid-subcommand error unless a
// child is its default. Siblings never share a name or alias. --json and
// --format come with RunJSON, never from Flags.
func TestCommandDeclarations(t *testing.T) {
	root := Command
	for _, e := range append(commands(root), entry{[]*cli.Command{root}}) {
		c := e.cmd()
		if c != root && c.Description == "" {
			t.Errorf("%s: missing Description", e)
		}
		if c.IsGroup() {
			defaults := 0
			names := map[string]bool{}
			for _, child := range c.Children {
				if child.Default {
					defaults++
				}
				for _, n := range append([]string{child.Name}, child.Aliases...) {
					if names[n] {
						t.Errorf("%s: two children are named %q", e, n)
					}
					names[n] = true
				}
			}
			if c.Run != nil || c.RunJSON != nil {
				t.Errorf("%s: a group does not Run; its children do", e)
			}
			if c != root && defaults == 0 && c.InvalidSubcommand == "" {
				t.Errorf("%s: set InvalidSubcommand (upstream's error) or mark a Default child", e)
			}
			if defaults > 1 {
				t.Errorf("%s: %d Default children", e, defaults)
			}
			continue
		}
		if slices.Contains(c.Flags, cli.FlagJSON) || slices.Contains(c.Flags, cli.FlagFormat) {
			t.Errorf("%s: set RunJSON instead of listing --json or --format; it adds both and requires a JSON() result", e)
		}
		runs := c.Run != nil || c.RunJSON != nil
		switch {
		case c.NotPorted && (runs || c.Needs != nil):
			t.Errorf("%s: a NotPorted command does not Run or declare Needs", e)
		case c.NotPorted:
		case c.Run != nil && c.RunJSON != nil:
			t.Errorf("%s: set Run or RunJSON, not both", e)
		case !runs:
			t.Errorf("%s: missing Run or RunJSON", e)
		case c.Needs == nil:
			t.Errorf("%s: declare Needs (internal/cli/needs); needs.Nothing() runs without logging in", e)
		case len(c.Examples) == 0:
			t.Errorf("%s: add at least one example", e)
		case !slices.ContainsFunc(c.HelpSections, func(s cli.HelpSection) bool { return s.Title == "Notes" }):
			t.Errorf("%s: add a Notes help section: what it saves, where its output goes, its exit code", e)
		}
	}
}

// Each need belongs to one command, so From reads that command's input,
// and an argument a need reads is one the command declares.
func TestNeeds(t *testing.T) {
	owner := map[cli.Need]string{}
	for _, e := range commands(Command) {
		c := e.cmd()
		if c.Needs == nil {
			continue
		}
		if prev, ok := owner[c.Needs]; ok {
			t.Errorf("%s and %s share a need; declare one per command", prev, e)
		}
		owner[c.Needs] = e.String()
		if i := c.NeedsArg(); i >= len(c.Args) {
			t.Errorf("%s: its need reads argument %d, which Args does not declare", e, i)
		}
	}
}

// Every example parses: it selects its own command, with known flags.
func TestExamples(t *testing.T) {
	root := Command
	for _, e := range commands(root) {
		for _, ex := range e.cmd().Examples {
			for _, v := range ex.Value {
				words := strings.Fields(v)
				if len(words) == 0 || words[0] != "vercel" {
					t.Errorf("%s: example %q must start with \"vercel\"", e, v)
					continue
				}
				inv, err := cli.Parse(root, words[1:])
				if err == nil {
					err = inv.FlagErr
				}
				if err != nil {
					t.Errorf("%s: example %q: %v", e, v, err)
				} else if inv.Command() != e.cmd() {
					t.Errorf("%s: example %q runs a different command", e, v)
				}
			}
		}
	}
}

// Every suggested recovery command parses and runs a ported command, as
// examples do, and its label reads as an instruction.
func TestNext(t *testing.T) {
	root := Command
	next := cli.DeclaredNext()
	if len(next) == 0 {
		t.Fatal("no suggested commands are declared")
	}
	for _, n := range next {
		name := strings.Join(n.Argv, " ")
		inv, err := cli.Parse(root, n.Argv)
		if err == nil {
			err = inv.FlagErr
		}
		switch {
		case err != nil:
			t.Errorf("next %q: %v", name, err)
		case inv.Command() == nil || inv.Command().IsGroup() || inv.Command().NotPorted:
			t.Errorf("next %q does not run a ported command", name)
		case n.Label == "" || strings.HasSuffix(n.Label, ":") || strings.HasSuffix(n.Label, "."):
			t.Errorf("next %q: label %q must be a phrase without a final \":\" or \".\"", name, n.Label)
		}
	}
}

// Related commands are ported commands other than the command itself,
// listed once each, and help sections have a title and a body.
func TestRelated(t *testing.T) {
	root := Command
	for _, e := range commands(root) {
		seen := map[string]bool{}
		for _, path := range e.cmd().Related {
			names := strings.Fields(path)
			found := cli.Find(root, names)
			switch {
			case len(found) != len(names) || found[len(found)-1].NotPorted:
				t.Errorf("%s: related %q is not a ported command", e, path)
			case found[len(found)-1] == e.cmd():
				t.Errorf("%s: related to itself", e)
			case seen[path]:
				t.Errorf("%s: related %q twice", e, path)
			case canonical(found) != path:
				t.Errorf("%s: related %q must be the canonical path %q", e, path, canonical(found))
			}
			seen[path] = true
		}
		for _, s := range e.cmd().HelpSections {
			if s.Title == "" || len(s.Body) == 0 {
				t.Errorf("%s: help section %q needs a title and a body", e, s.Title)
			}
		}
	}
}

// Pagination's default is within its maximum. Its --next and --limit,
// like the other shared flags, are never listed (TestFlagNames).
func TestPagination(t *testing.T) {
	for _, e := range commands(Command) {
		if p := e.cmd().Pagination; p != nil && (p.Default < 1 || p.Default > p.Max) {
			t.Errorf("%s: Pagination default %d is not within 1 and %d", e, p.Default, p.Max)
		}
	}
}

// canonical is a path's command names, without aliases.
func canonical(path []*cli.Command) string {
	names := make([]string, len(path))
	for i, c := range path {
		names[i] = c.Name
	}
	return strings.Join(names, " ")
}

// Every flag is declared in internal/cli/flags.go, so a new name is one
// reviewed line there. The framework adds the shared flags (--format,
// --json, --next, --limit, --project, --all); a command never lists them.
// A name is not a look-alike of another, and a name or shorthand has one
// type and meaning across the whole CLI.
func TestFlagNames(t *testing.T) {
	type meaning struct {
		flag    *cli.Flag
		command string
	}
	seen := map[string]meaning{}
	shorts := map[string]string{}
	declared := map[string]bool{}
	for _, f := range cli.Declared {
		if declared[f.Name] {
			t.Errorf("--%s is declared twice in internal/cli/flags.go", f.Name)
		}
		declared[f.Name] = true
		if use, ok := cli.LookAlikes[f.Name]; ok && !excepted(t, "look-alike", "--"+f.Name) {
			t.Errorf("--%s means what --%s means; use --%s", f.Name, use, use)
		}
	}
	for _, e := range commands(Command) {
		for _, f := range e.cmd().Flags {
			if r, ok := cli.Reserved[f.Name]; ok && !slices.Contains(cli.GlobalFlags, r) {
				t.Errorf("%s lists --%s; the framework adds it (RunJSON, Pagination or the need)", e, f.Name)
			}
		}
	}
	check := func(where string, f *cli.Flag) {
		if !slices.Contains(cli.Declared, f) {
			t.Errorf("%s: declare --%s in internal/cli/flags.go", where, f.Name)
		}
		if r, ok := cli.Reserved[f.Name]; ok && r != f {
			t.Errorf("%s: --%s is reserved; use the flag defined in internal/cli/flags.go", where, f.Name)
		}
		if prev, ok := seen[f.Name]; ok && (prev.flag.Type != f.Type || prev.flag.Description != f.Description) {
			t.Errorf("--%s means %q in %s but %q in %s", f.Name, prev.flag.Description, prev.command, f.Description, where)
		}
		seen[f.Name] = meaning{f, where}
		if f.Short != "" {
			if prev, ok := shorts[f.Short]; ok && prev != f.Name {
				t.Errorf("-%s is --%s and --%s", f.Short, prev, f.Name)
			}
			shorts[f.Short] = f.Name
		}
	}
	for _, f := range cli.GlobalFlags {
		check("vercel", f)
	}
	for _, e := range commands(Command) {
		for _, f := range e.cmd().AllFlags() {
			check(e.String(), f)
		}
	}
}

// Subcommands are named from one reviewed list of verbs, and no command
// is named with a synonym of one: `inspect` shows one item, `list` lists,
// `add` creates and `remove` deletes. Aliases follow upstream.
func TestCommandNames(t *testing.T) {
	verbs := []string{"add", "inspect", "invite", "list", "members", "remove", "request", "sso", "switch"}
	synonyms := map[string]string{
		"get": "inspect", "show": "inspect", "fetch": "inspect", "view": "inspect", "describe": "inspect", "info": "inspect",
		"ls": "list", "delete": "remove", "destroy": "remove", "rm": "remove", "create": "add", "new": "add",
	}
	for _, e := range commands(Command) {
		c := e.cmd()
		if use, ok := synonyms[c.Name]; ok {
			t.Errorf("%s: name it %q (keep %q as an alias if upstream has it)", e, use, c.Name)
		}
		if e.parent() != nil && !slices.Contains(verbs, c.Name) && !excepted(t, "verb", e.String()) {
			t.Errorf("%s: %q is not in the verb list in TestCommandNames; reuse one, or add it there for review", e, c.Name)
		}
	}
}

// Commands write stdout only through Result.Render and stderr only
// through the *iostreams.UI they are given, and never exit, make HTTP
// requests, write terminal control sequences or change the client's team
// themselves. They import only the framework and pure utilities, so what
// startup builds reaches them only through their Input and their need.
func TestCommandsDoNotBypassTheFramework(t *testing.T) {
	problems, err := bypasses("..", func(rule, subject string) bool { return excepted(t, rule, subject) })
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range problems {
		t.Error(p)
	}
}

// The check above sees packages nested in a command's package, and calls
// through a renamed or dot import.
func TestBypassCheckSeesNestedPackagesAndRenamedImports(t *testing.T) {
	dir := t.TempDir()
	files := map[string]string{
		"teams/members/members.go": "package members\n\nimport \"fmt\"\n\nfunc run() { fmt.Println(\"x\") }\n",
		"teams/leak.go":            "package teams\n\nimport f \"fmt\"\n\nfunc run() { f.Println(\"x\") }\n",
		"teams/dot.go":             "package teams\n\nimport . \"os\"\n\nfunc exit() { Exit(1) }\n",
		"teams/client.go":          "package teams\n\nimport web \"net/http\"\n\nvar _ = web.Get\n",
		"teams/team.go":            "package teams\n\nfunc run(in *input) { in.Client.SetTeam(\"x\") }\n",
		"teams/link.go":            "package teams\n\nimport \"github.com/vercel/vercel/packages/cli-go/internal/link\"\n\nvar _ = link.ReadProject\n",
		"teams/relogin.go":         "package teams\n\nfunc run(in *input) { in.Login(nil) }\n",
		"login/login.go":           "package login\n\nfunc run(in *input) { in.Login(nil) }\n",
		"teams/fine.go":            "package teams\n\nimport \"fmt\"\n\nvar _ = fmt.Sprint\n",
		"teams/fine_test.go":       "package teams\n\nimport \"fmt\"\n\nfunc run() { fmt.Println(\"x\") }\n",
		"root/root.go":             "package root\n\nimport \"os\"\n\nfunc exit() { os.Exit(1) }\n",
	}
	for name, src := range files {
		path := filepath.Join(dir, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	problems, err := bypasses(dir, func(rule, subject string) bool { return rule == "login" && subject == "login" })
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Join(problems, "\n")
	for _, want := range []string{"members.go: fmt.Println", "leak.go: fmt.Println", "dot.go imports \"os\" with a dot", "dot.go imports \"os\": ",
		"client.go imports \"net/http\"", "team.go: SetTeam", "link.go imports \"github.com/vercel/vercel/packages/cli-go/internal/link\": declare a need",
		"teams/relogin.go: Login"} {
		if !strings.Contains(got, want) {
			t.Errorf("missed %q in:\n%s", want, got)
		}
	}
	if len(problems) != 8 {
		t.Errorf("want 8 problems, got:\n%s", got)
	}
}

// bypasses checks every non-test Go file under dir, at any depth, except
// in dir/root, which builds the tree. Calls are matched by import path, so
// renaming an import does not hide one. except reports an exception, by
// rule and package directory.
func bypasses(dir string, except func(rule, subject string) bool) ([]string, error) {
	const module = "github.com/vercel/vercel/packages/cli-go/internal/"
	// Allowed imports: the framework and pure utilities. Anything else is
	// a reviewed change to this list.
	allowed := map[string]bool{
		module + "cli": true, module + "cli/needs": true, module + "api": true, module + "iostreams": true,
		"context": true, "encoding/json": true, "errors": true, "fmt": true, "io": true, "strings": true, "strconv": true,
		"slices": true, "maps": true, "sort": true, "cmp": true, "time": true, "math": true, "unicode": true,
		"unicode/utf8": true, "net/url": true, "regexp": true,
	}
	// Why common imports are not allowed.
	why := map[string]string{
		"os": "take input as flags or arguments, write through Result and in.UI, and return errors", "net/http": "use in.Client",
		"log": "use in.UI", "sync": "the framework runs concurrent work", module + "scope": "declare a need",
		module + "link": "declare a need", module + "auth": "declare a need", module + "config": "declare a need",
		module + "loginflow": "only `vercel login` logs in, with in.Login", module + "vercelcmd": "startup runs commands, not the other way around",
	}
	// Calls into allowed packages that bypass the framework.
	forbidden := map[string]string{
		"fmt.Print": "write stdout in Result.Render", "fmt.Println": "write stdout in Result.Render",
		"fmt.Printf": "write stdout in Result.Render", module + "iostreams.System": "use in.UI", module + "iostreams.Test": "use in.UI",
		module + "api.New": "use in.Client",
	}
	var problems []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		switch {
		case err != nil:
			return err
		case d.IsDir() && (path == filepath.Join(dir, "root") || d.Name() == "testdata"):
			return filepath.SkipDir
		case d.IsDir() || filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go"):
			return nil
		}
		file, err := parser.ParseFile(token.NewFileSet(), path, nil, 0)
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(dir, filepath.Dir(path))
		pkg := filepath.ToSlash(rel)
		names := map[string]string{} // the name each import is used by, to its path
		for _, imp := range file.Imports {
			p, _ := strconv.Unquote(imp.Path.Value)
			if !allowed[p] {
				problems = append(problems, fmt.Sprintf("%s imports %q: %s", path, p, cmp.Or(why[p], "command packages import only the framework and pure utilities (allowed in bypasses)")))
			}
			name := p[strings.LastIndex(p, "/")+1:]
			if imp.Name != nil {
				name = imp.Name.Name
			}
			if name == "." {
				problems = append(problems, fmt.Sprintf("%s imports %q with a dot: name the package, so the conventions tests can see what it calls", path, p))
			}
			names[name] = p
		}
		ast.Inspect(file, func(n ast.Node) bool {
			switch n := n.(type) {
			case *ast.BasicLit:
				if s, err := strconv.Unquote(n.Value); err == nil && strings.ContainsAny(s, "\x1b\x07\u009b") {
					problems = append(problems, fmt.Sprintf("%s: %s: write terminal control sequences through in.UI", path, n.Value))
				}
			case *ast.SelectorExpr:
				if n.Sel.Name == "SetTeam" {
					problems = append(problems, fmt.Sprintf("%s: SetTeam: declare a need; it sets the team requests use", path))
				}
				if id, isIdent := n.X.(*ast.Ident); n.Sel.Name == "Login" && !(isIdent && names[id.Name] != "") && !except("login", pkg) {
					problems = append(problems, fmt.Sprintf("%s: Login: only `vercel login` logs in as its action; declare a need that logs in first", path))
				}
				if pkg, ok := n.X.(*ast.Ident); ok && names[pkg.Name] != "" {
					if why, bad := forbidden[names[pkg.Name]+"."+n.Sel.Name]; bad {
						problems = append(problems, fmt.Sprintf("%s: %s.%s: %s", path, names[pkg.Name], n.Sel.Name, why))
					}
				}
			}
			return true
		})
		return nil
	})
	return problems, err
}

// Help output is pinned in testdata, and matches the TypeScript CLI's help
// byte for byte except the added help sections and related commands
// (checked by the e2e suite, HelpAdds). Regenerate with -update.
func TestHelpGolden(t *testing.T) {
	root := Command
	cs := &iostreams.ColorScheme{}
	pages := map[string]string{"vercel": cli.RootHelp(root, 80, cs)}
	for _, e := range commands(root) {
		if !e.cmd().NotPorted {
			pages[strings.ReplaceAll(e.String(), " ", "_")] = cli.CommandHelp(root, e.cmd(), e.parent(), 80, cs)
		}
	}
	for name, got := range pages {
		path := filepath.Join("testdata", name+".help")
		if *update {
			if err := os.MkdirAll("testdata", 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
				t.Fatal(err)
			}
			continue
		}
		want, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("%s: %v (run go test ./internal/cmd/root -update)", name, err)
		}
		if got != string(want) {
			t.Errorf("%s help changed; review, then run go test ./internal/cmd/root -update\n%s", name, got)
		}
	}
}
