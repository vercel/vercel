package cli

import (
	"fmt"
	"strings"
	"testing"
)

func pageTree() *Command {
	since := &Flag{Name: "since", Type: String}
	ls := &Command{Name: "list", Aliases: []string{"ls"}, Flags: []*Flag{since},
		Pagination: &Pagination{Default: 20, Max: 100}, RunJSON: noopJSON}
	return &Command{Name: "vercel", Children: []*Command{{Name: "teams", Children: []*Command{ls}}}}
}

// The next page keeps the command's flags except --next and --format, and
// the context flags, never --token, under the command's canonical path.
func TestNextPage(t *testing.T) {
	for args, want := range map[string]string{
		"teams ls": "vercel teams list --next 42",
		"teams ls --limit 5 --json --since 'a b'":          "vercel teams list --limit 5 --json --since 'a b' --next 42",
		"--scope acme teams ls --next 9 -F json -t secret": "vercel teams list --next 42 --scope acme",
		"teams ls --cwd dir --limit 0x10":                  "vercel teams list --limit 16 --next 42 --cwd dir",
	} {
		inv, err := Parse(pageTree(), fields(args))
		if err != nil || inv.FlagErr != nil {
			t.Fatal(args, err, inv.FlagErr)
		}
		in := NewInput(inv, nil)
		in.Context = inv.ContextArgs(false)
		if got := in.NextPage(42); got != want {
			t.Errorf("%s:\n got %s\nwant %s", args, got, want)
		}
	}
}

// fields splits like a shell for single-quoted values.
func fields(s string) []string {
	var out []string
	for i, part := range strings.Split(s, "'") {
		if i%2 == 1 {
			out = append(out, part)
		} else {
			out = append(out, strings.Fields(part)...)
		}
	}
	return out
}

func TestPage(t *testing.T) {
	inv, _ := Parse(pageTree(), []string{"teams", "ls", "--next", "7", "--limit", "3"})
	if next, limit := NewInput(inv, nil).Page(); next != 7 || limit != 3 {
		t.Errorf("next %d, limit %d", next, limit)
	}
	if err := inv.ValidatePage(); err != nil {
		t.Error(err)
	}
	inv, _ = Parse(pageTree(), []string{"teams", "ls", "--limit", "101"})
	if err := inv.ValidatePage(); fmt.Sprint(err) != "Please provide an integer from 1 to 100 for option --limit" {
		t.Errorf("%v", err)
	}
	// Reading a page without declaring Pagination is a programming error.
	plain := &Command{Name: "vercel", Children: []*Command{{Name: "whoami", Flags: []*Flag{FlagNext, FlagLimit}}}}
	inv, _ = Parse(plain, []string{"whoami"})
	defer func() {
		if r := recover(); r == nil || !strings.Contains(fmt.Sprint(r), "without declaring Pagination") {
			t.Errorf("recover() = %v", r)
		}
	}()
	NewInput(inv, nil).Page()
}
