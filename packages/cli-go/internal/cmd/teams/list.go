package teams

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/cli/needs"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

var listNeed = needs.Login()

var listCommand = &cli.Command{
	Name:        "list",
	Aliases:     []string{"ls"},
	Description: "Show all teams that you're a member of",
	Flags:       []*cli.Flag{cli.FlagSince, cli.FlagUntil, cli.FlagCount}, // deprecated, still accepted
	Examples: []cli.Example{{
		Name:  "Paginate results, where `1584722256178` is the time in milliseconds since the UNIX epoch",
		Value: []string{"vercel teams list --next 1584722256178"},
	}},
	HelpSections: []cli.HelpSection{{Title: "Notes", Body: []string{
		"The current team is marked with ✔ and listed first.",
		"",
		"The table is printed on stderr. Use --json for output a script can read on stdout.",
		"",
		"Shows 20 teams by default. When there are more, it prints the command for the next page.",
	}}},
	Related:    []string{"teams switch", "whoami"},
	Needs:      listNeed,
	Pagination: &cli.Pagination{Default: 20, Max: 100},
	Validate:   validateList,
	RunJSON:    runList,
}

func validateList(in *cli.Input) error {
	cs := in.UI.ColorScheme()
	if len(in.Args) > 0 {
		return &cli.Error{Message: "Invalid number of arguments. Usage: " + cs.Cyan(cs.Cmd("vercel teams ls")), Exit: 2}
	}
	return nil
}

func runList(ctx context.Context, in *cli.Input) (cli.JSONResult, error) {
	ui := in.UI
	next, limit := in.Page()

	ui.StartSpinner("Fetching teams")
	teams, page, err := in.Client.ListTeams(ctx, limit, next)
	if err != nil {
		return nil, forbiddenIsInvalidToken(in, err)
	}
	ui.StartSpinner("Fetching user information")
	user, err := listNeed.From(ctx, in)
	if err != nil {
		return nil, err
	}

	// The current team is the one commands act in: the selected team, else
	// the default team. There is no personal account to list.
	current := listNeed.SelectedTeam(in)
	marked := current != "" // as upstream, a selected team adds the ✔ column even when not listed
	if current == "" {
		current = user.DefaultTeamID
	}
	var rows []teamRow
	for _, t := range teams {
		rows = append(rows, teamRow{id: t.ID, slug: t.Slug, name: t.Raw["name"], plan: t.Billing.PlanOrNull(), current: t.ID == current})
		marked = marked || t.ID == current
	}
	if len(rows) > 0 {
		// Current team first. As upstream's splice(-1, 1), an unlisted
		// current team moves the last row instead.
		i := len(rows) - 1
		for j, r := range rows {
			if r.id == current {
				i = j
				break
			}
		}
		rows = append([]teamRow{rows[i]}, append(rows[:i:i], rows[i+1:]...)...)
	}
	ui.StopSpinner()

	res := &listResult{rows: rows, marked: marked, page: page}
	if page.Next != 0 {
		res.nextCommand = in.NextPage(page.Next)
	}
	return res, nil
}

type teamRow struct {
	id, slug   string
	name, plan json.RawMessage // name may be absent
	current    bool
}

type listResult struct {
	rows        []teamRow
	marked      bool // rows get a ✔ column
	page        api.Page
	nextCommand string
}

func (r *listResult) JSON() any {
	type teamJSON struct {
		ID      string          `json:"id"`
		Slug    string          `json:"slug"`
		Name    json.RawMessage `json:"name,omitempty"`
		Plan    json.RawMessage `json:"plan"`
		Current bool            `json:"current"`
	}
	teams := make([]teamJSON, len(r.rows))
	for i, t := range r.rows {
		teams[i] = teamJSON{t.id, t.slug, t.name, t.plan, t.current}
	}
	return struct {
		Teams      []teamJSON      `json:"teams"`
		Pagination json.RawMessage `json:"pagination,omitempty"`
	}{teams, r.page.Raw}
}

// Render puts the table on stderr and a blank line on stdout, as upstream.
func (r *listResult) Render(stdout io.Writer, ui *iostreams.UI) {
	cs := ui.ColorScheme()
	fmt.Fprint(stdout, "\n")
	cells := [][]string{{cs.Gray("id"), cs.Gray("Team name"), cs.Gray("Plan")}}
	for _, t := range r.rows {
		plan := "-" // plan ?? '-'
		if string(t.plan) != "null" {
			plan = api.RawString(t.plan)
		}
		cells = append(cells, []string{t.slug, api.RawString(t.name), plan})
	}
	table := iostreams.Table(cells, 5)
	if r.marked {
		lines := strings.Split(table, "\n")
		for i, line := range lines {
			prefix := " "
			if i > 0 && r.rows[i-1].current {
				prefix = "✔"
			}
			lines[i] = prefix + " " + line
		}
		table = strings.Join(lines, "\n")
	}
	ui.Print(table + "\n")
	if r.nextCommand != "" {
		fmt.Fprint(stdout, "\n")
		ui.Log("To display the next page run " + cs.Cmd(r.nextCommand))
	}
}
