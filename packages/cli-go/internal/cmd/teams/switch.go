package teams

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cli/needs"
)

var switchNeed = needs.Login()

var switchCommand = &cli.Command{
	Name:        "switch",
	Aliases:     []string{"change"},
	Description: "Switch to a different team",
	Args:        []cli.Arg{{Name: "name"}},
	Examples: []cli.Example{{
		Name:  "Switch to a team. If your team's url is 'vercel.com/name', then 'name' is the slug. If the slug is omitted, you can choose interactively",
		Value: []string{"vercel teams switch <slug>"},
	}},
	HelpSections: []cli.HelpSection{{Title: "Notes", Body: []string{
		"Saves the team in the global config, so later commands use it until you switch again. --scope overrides it for one command.",
		"",
		"In a directory linked to a project, commands keep using the project's team.",
		"",
		"A scope is always a team: there is no personal account to switch to.",
	}}},
	Related:           []string{"teams list", "whoami"},
	HiddenGlobalFlags: []*cli.Flag{cli.FlagToken},
	Needs:             switchNeed,
	Validate:          validateSwitch,
	Run:               runSwitch,
}

// validateSwitch: without a terminal to pick a team on, the slug is
// required.
func validateSwitch(in *cli.Input) error {
	if len(in.Args) == 0 && in.Mode.NonInteractive {
		return &cli.Error{
			Message: "In non-interactive mode a team slug is required.",
			Next:    []*cli.Next{nextSwitch, nextList},
		}
	}
	return nil
}

var (
	nextList   = cli.NewNext("List the teams you can switch to", "teams", "list")
	nextSwitch = cli.NewNext("Switch to a team by its slug", "teams", "switch", "<SLUG>")
)

// runSwitch has no interactive picker or SSO re-authentication yet.
func runSwitch(ctx context.Context, in *cli.Input) (cli.Result, error) {
	ui, cs := in.UI, in.UI.ColorScheme()
	ui.StartSpinner("Fetching teams information")
	user, err := switchNeed.From(ctx, in)
	if err != nil {
		return nil, err
	}
	teams, err := in.Client.GetTeams(ctx)
	if err != nil {
		return nil, forbiddenIsInvalidToken(in, err)
	}

	currentID := switchNeed.SelectedTeam(in)
	if currentID == "" {
		currentID = user.DefaultTeamID
	}
	current := find(teams, func(t *api.Team) bool { return t.ID == currentID })
	if currentID != "" && current == nil {
		ui.Warn("You are no longer a member of the previously selected team. Choose another scope to continue.")
	}
	slug := ""
	if len(in.Args) > 0 {
		slug = in.Args[0]
	}
	if slug == "" {
		ui.StopSpinner()
		return nil, &cli.Error{Message: "A team slug is required.", Next: []*cli.Next{nextSwitch, nextList}}
	}

	var id, done string
	var raw map[string]json.RawMessage
	switch target := find(teams, func(t *api.Team) bool { return t.Slug == slug }); {
	case slug == user.Username || slug == user.Email:
		// There is no personal account: a scope is always a team.
		return nil, cli.Errorf("You cannot set your Personal Account as the scope.")
	case target == nil:
		return nil, &cli.Error{
			Message: "You do not have permission to access scope " + cs.Bold(slug) + ".",
			Next:    []*cli.Next{nextList},
		}
	case current != nil && target.Slug == current.Slug:
		ui.Log("No changes made")
		return nil, nil
	default:
		id, raw = target.ID, target.Raw
		done = "The team " + cs.Bold(target.NameString()) + " (" + target.Slug + ") is now active!"
	}

	// `limited` means the token needs SSO for this scope.
	var limited bool
	_ = json.Unmarshal(raw["limited"], &limited)
	if limited {
		return nil, cli.Errorf("Switching to %s requires signing in again with SSO, which this CLI does not support yet.", slug)
	}
	if err := switchNeed.SaveTeam(in, id); err != nil {
		return nil, err
	}
	ui.Success(done)
	if linked := switchNeed.LinkedOrg(in); linked != "" && linked != id {
		ui.Warn("This directory is linked to a project under a different team/scope. " +
			"Commands like `deploy` will still use the linked project's team. Run `vc link` to re-link.")
	}
	return nil, nil
}

func find(teams []*api.Team, match func(*api.Team) bool) *api.Team {
	for _, t := range teams {
		if match(t) {
			return t
		}
	}
	return nil
}

// forbiddenIsInvalidToken is getTeams' 403 handling.
func forbiddenIsInvalidToken(in *cli.Input, err error) error {
	var apiErr *api.Error
	if errors.As(err, &apiErr) && apiErr.Status == 403 {
		return in.InvalidToken()
	}
	return err
}
