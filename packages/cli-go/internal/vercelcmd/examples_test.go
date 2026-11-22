package vercelcmd

import (
	"bytes"
	"encoding/json"
	"regexp"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cmd/root"
)

// exampleValues fill the placeholders in examples, from the fixture.
var exampleValues = map[string]string{"<slug>": "acme"}

var examplePlaceholder = regexp.MustCompile(`<[^>]+>`)

// Every example runs against the fake API, logged in, and with --json too
// when the command prints JSON: it exits 0, prints something, calls only
// what the fixture serves, and --json prints one JSON value on stdout.
func TestExamplesRun(t *testing.T) {
	var walk func(c *cli.Command)
	walk = func(c *cli.Command) {
		for _, child := range c.Children {
			walk(child)
		}
		if c.NotPorted || c.IsGroup() {
			return
		}
		for _, ex := range c.Examples {
			for _, line := range ex.Value {
				args := strings.Fields(line)[1:] // after "vercel"
				for i, a := range args {
					args[i] = examplePlaceholder.ReplaceAllStringFunc(a, func(p string) string {
						v, ok := exampleValues[p]
						if !ok {
							t.Fatalf("%s: add a value for %s to exampleValues", line, p)
						}
						return v
					})
				}
				runs := [][]string{args}
				if c.RunJSON != nil {
					runs = append(runs, append(append([]string{}, args...), "--json"))
				}
				for _, args := range runs {
					t.Run(strings.Join(args, " "), func(t *testing.T) { runExample(t, args) })
				}
			}
		}
	}
	walk(root.Command)
}

func runExample(t *testing.T, args []string) {
	h := newHarness(t)
	h.write("cfg/auth.json", loggedIn)
	h.oauth(tokens)
	h.routes["GET /v2/user"] = user
	h.routes["GET /v1/teams"] = `{"teams":[` + acme + `]}`
	h.routes["GET /v2/teams"] = `{"teams":[` + acme + `],"pagination":{"count":1,"next":null,"prev":null}}`
	h.routes["GET /teams/team_acme"] = acme
	h.routes["GET /teams/acme"] = acme
	if code := h.run(args...); code != 0 {
		t.Fatalf("exit %d\nstdout: %s\nstderr: %s", code, h.stdout, h.stderr)
	}
	if h.stdout.Len()+h.stderr.Len() == 0 {
		t.Error("printed nothing")
	}
	for _, r := range h.requests {
		if _, ok := h.routes[r]; !ok {
			t.Errorf("requested %s, which the fixture does not serve", r)
		}
	}
	if args[len(args)-1] != "--json" {
		return
	}
	dec := json.NewDecoder(bytes.NewReader(h.stdout.Bytes()))
	var v any
	if err := dec.Decode(&v); err != nil || dec.More() {
		t.Errorf("--json stdout is not one JSON value (%v): %s", err, h.stdout)
	}
}
