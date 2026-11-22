// Package whoami is `vercel whoami`.
package whoami

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cli/needs"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// need: logged out is a result, not a login; the linked project's team
// is the active team, as upstream's getScope with resolveLocalScope.
var need = needs.Team(needs.OptionalLogin(), needs.LinkedTeam())

var Command = &cli.Command{
	Name:        "whoami",
	Description: "Shows the username of the currently logged in user.",
	Examples:    []cli.Example{{Name: "Shows the username of the currently logged in user", Value: []string{"vercel whoami"}}},
	HelpSections: []cli.HelpSection{{Title: "Notes", Body: []string{
		"On a terminal it also shows the active team and its plan. When piped, it prints only the username.",
		"",
		"The active team comes from --scope, then the project linked in this directory, then the team saved by `vercel teams switch`, then your default team. It is always a team: there is no personal account.",
		"",
		"Exits with 1 when logged out.",
	}}},
	Related: []string{"login", "teams switch"},
	Needs:   need,
	RunJSON: run,
}

// run makes no requests when logged out.
func run(ctx context.Context, in *cli.Input) (cli.JSONResult, error) {
	s, err := need.From(ctx, in)
	switch {
	case err != nil:
		return nil, err
	case s == nil:
		return loggedOut{}, nil
	}
	return identity{s}, nil
}

type loggedOut struct{}

func (loggedOut) ExitCode() int { return 1 }
func (loggedOut) JSON() any {
	return struct {
		LoggedIn bool `json:"loggedIn"`
	}{}
}

func (loggedOut) Render(_ io.Writer, ui *iostreams.UI) {
	cs := ui.ColorScheme()
	ui.Log("Logged out.")
	ui.Log(fmt.Sprintf("Run %s to create a temporary deployment you can claim later, or %s to log in.",
		cs.Cmd("vercel deploy --temporary"), cs.Cmd("vercel login")))
}

type identity struct{ *cli.Scope }

func (r identity) Render(stdout io.Writer, ui *iostreams.UI) {
	if !ui.IsStdoutTTY() {
		fmt.Fprintln(stdout, r.User.Username)
		return
	}
	cs := ui.ColorScheme()
	ui.Log("Logged in as " + cs.Bold(r.User.Username))
	team := cs.Bold(r.Team.Slug)
	if name := r.Team.NameString(); name != "" && name != r.Team.Slug {
		team += " (" + name + ")"
	}
	ui.Log("Active team: " + team)
	var plan string
	if json.Unmarshal(r.plan(), &plan) == nil && plan != "" {
		ui.Log("Active team plan: " + cs.Bold(formatPlan(plan)))
	}
	if r.localOverride() {
		global := "none" // today "Personal Account"; there is none
		if r.GlobalTeam != nil {
			global = r.GlobalTeam.Slug
		}
		ui.Log(fmt.Sprintf("%s scope is set to %s by the linked project in this directory (globally selected: %s).",
			cs.Yellow("Local override:"), cs.Bold(r.Team.Slug), cs.Bold(global)))
	}
}

// JSON omits absent names and keeps null ones, as upstream.
func (r identity) JSON() any {
	type team struct {
		ID   string          `json:"id"`
		Slug string          `json:"slug"`
		Name json.RawMessage `json:"name,omitempty"`
		Plan json.RawMessage `json:"plan,omitempty"`
	}
	out := struct {
		Team          *team           `json:"team"`
		Plan          json.RawMessage `json:"plan"`
		Username      json.RawMessage `json:"username,omitempty"`
		Email         json.RawMessage `json:"email,omitempty"`
		Name          json.RawMessage `json:"name,omitempty"`
		LocalOverride bool            `json:"localOverride,omitempty"`
		GlobalTeam    **team          `json:"globalTeam,omitempty"` // null when none is selected
	}{Plan: r.plan()}
	t := r.Team
	out.Team = &team{ID: t.ID, Slug: t.Slug, Name: t.Name, Plan: out.Plan}
	if u := r.User; u != nil {
		out.Username, out.Email, out.Name = u.Raw["username"], u.Raw["email"], u.Raw["name"]
	}
	if r.localOverride() {
		var g *team
		if t := r.GlobalTeam; t != nil {
			g = &team{ID: t.ID, Slug: t.Slug, Name: t.Name}
		}
		out.LocalOverride, out.GlobalTeam = true, &g
	}
	return out
}

// localOverride: a linked project, not an explicit scope, set the team.
func (r identity) localOverride() bool {
	return !r.Explicit && (r.GlobalTeam == nil || r.Team.ID != r.GlobalTeam.ID || r.ScopeMismatch)
}

func (r identity) plan() json.RawMessage { return r.Team.Billing.PlanOrNull() }

func formatPlan(plan string) string {
	if strings.ToLower(plan) == "oss" {
		return "OSS"
	}
	return strings.ToUpper(plan[:1]) + plan[1:]
}
