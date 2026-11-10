// Package scope resolves the team an invocation acts in. The first match
// wins: --scope, --team or the local config's scope; the linked project;
// the saved currentTeam; the account's default team. There is no personal
// account to fall back to: without a team, resolution fails.
package scope

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/link"
)

// Resolver resolves what commands' needs ask for (cli.Resolver, with the
// login startup adds).
type Resolver struct {
	Client   *api.Client
	Session  *auth.Session
	UI       *iostreams.UI
	Cwd      string
	Explicit bool // --scope, --team or the local config's scope
	Getenv   func(string) string

	user   *api.User
	scopes [2]*cli.Scope // by linked
}

func (r *Resolver) LoggedIn() bool           { return r.Session.Token() != "" }
func (r *Resolver) TokenSource() auth.Source { return r.Session.Source }

// SelectedTeam is client.config.currentTeam: --scope or the saved team.
func (r *Resolver) SelectedTeam() string { return r.Client.Team() }

// SaveTeam is `teams switch` saving currentTeam.
func (r *Resolver) SaveTeam(teamID string) error {
	if teamID == "" {
		r.Session.Global.Delete("currentTeam")
	} else {
		r.Session.Global.Set("currentTeam", teamID)
	}
	return r.Session.SaveGlobal()
}

// LinkedOrg is project.json's orgId; a link that cannot be read is none,
// as `teams switch` reads it upstream.
func (r *Resolver) LinkedOrg() string {
	if p, err := link.ReadProject(r.Cwd); err == nil && p != nil {
		return p.OrgID
	}
	return ""
}

// User is get-user.ts, once per invocation: it saves a changed userId and
// turns a 403 into InvalidToken.
func (r *Resolver) User(ctx context.Context) (*api.User, error) {
	if r.user != nil {
		return r.user, nil
	}
	user, err := r.Client.GetAuthUser(ctx)
	var apiErr *api.Error
	if errors.As(err, &apiErr) && apiErr.Status == 403 {
		if r.Session.Creds.Has("userId") {
			r.Session.Creds.Delete("userId")
			r.persist()
		}
		return nil, cli.InvalidToken(r.Session.Source)
	}
	if errors.Is(err, api.ErrMissingUser) {
		return nil, cli.Errorf("Not able to load user, missing from response")
	}
	if err != nil {
		return nil, err
	}
	if id, _ := r.Session.Creds.String("userId"); id != user.ID {
		r.Session.Creds.Set("userId", user.ID)
		r.persist()
	}
	r.user = user
	return user, nil
}

func (r *Resolver) persist() {
	if r.Session.Persist() != nil {
		r.UI.Debug("Failed to persist cached userId to auth config.")
	}
}

// CachedUser makes no request.
func (r *Resolver) CachedUser() *api.User { return r.user }

// ResolveExplicit returns the scope's team ID, cached in config.json's
// cachedTeamIds.
func (r *Resolver) ResolveExplicit(ctx context.Context, scope string) (string, error) {
	if cached := cachedTeamID(r.Session.Global, scope); cached != "" {
		return cached, nil
	}
	user, err := r.User(ctx)
	if err != nil {
		if cli.IsNotAuthorized(err) {
			return "", &cli.Error{Message: "You do not have access to the specified account", Link: "https://err.sh/vercel/scope-not-accessible"}
		}
		return "", cli.Errorf("Not able to load user because of unexpected error: %s", errorToString(err))
	}
	matchesUser := user.ID == scope || user.Email == scope || user.Username == scope

	related, err := r.Client.GetTeam(ctx, scope, "")
	if err != nil {
		r.UI.Debug(`Direct team lookup for scope "` + scope + `" failed: ` + errorToString(err))
		related = nil
		teams, err := r.Client.GetTeams(ctx)
		var apiErr *api.Error
		switch {
		case err == nil:
			for _, t := range teams {
				if t.ID == scope || t.Slug == scope {
					related = t
					break
				}
			}
		case matchesUser:
			r.UI.Debug("Ignoring failure to load teams; scope matches the current user's identity")
		case errors.As(err, &apiErr) && apiErr.Status == 403:
			// getTeams turns a 403 into InvalidToken, whose code is not the
			// lowercase not_authorized checked upstream.
			return "", cli.Errorf("Not able to load teams")
		case errors.As(err, &apiErr) && apiErr.Code == "not_authorized":
			return "", &cli.Error{Message: "You do not have access to the specified team", Link: "https://err.sh/vercel/scope-not-accessible"}
		case errors.As(err, &apiErr) && apiErr.Code == "rate_limited":
			return "", &cli.Error{Message: "Rate limited. Too many requests to the same endpoint: /teams"}
		default:
			return "", cli.Errorf("Not able to load teams")
		}
	}

	switch {
	case related != nil:
		r.cache(scope, related.ID)
		return related.ID, nil
	case matchesUser:
		// There is no personal account: a scope is always a team.
		return "", cli.Errorf("You cannot set your Personal Account as the scope.")
	default:
		return "", &cli.Error{Message: "The specified scope does not exist", Link: "https://err.sh/vercel/scope-not-existent"}
	}
}

func cachedTeamID(global *config.Object, scope string) string {
	raw, ok := global.Raw("cachedTeamIds")
	if !ok {
		return ""
	}
	var cache map[string]json.RawMessage
	if json.Unmarshal(raw, &cache) != nil {
		return ""
	}
	var id string
	_ = json.Unmarshal(cache[scope], &id)
	return id
}

func (r *Resolver) cache(scope, teamID string) {
	global := r.Session.Global
	if cachedTeamID(global, scope) == teamID {
		return
	}
	cache := &config.Object{}
	if raw, ok := global.Raw("cachedTeamIds"); ok {
		_ = json.Unmarshal(raw, cache)
	}
	cache.Set(scope, teamID)
	global.Set("cachedTeamIds", cache)
	if err := r.Session.SaveGlobal(); err != nil {
		r.UI.Debug("Failed to write scope cache: " + err.Error())
	}
}

// Scope is getScope, once per invocation; linked is resolveLocalScope.
// Its team becomes the team of later requests even when resolution
// fails, so errors name the team whose lookup failed, as upstream.
func (r *Resolver) Scope(ctx context.Context, linked bool) (*cli.Scope, error) {
	i := 0
	if linked {
		i = 1
	}
	if r.scopes[i] != nil {
		return r.scopes[i], nil
	}
	s, err := r.resolve(ctx, r.Client.Team(), linked)
	r.Client.SetTeam(s.TeamID)
	if err != nil {
		return nil, err
	}
	r.scopes[i] = s
	return s, nil
}

// resolve never returns a nil Scope; on error only TeamID is set.
func (r *Resolver) resolve(ctx context.Context, team string, linked bool) (*cli.Scope, error) {
	s := &cli.Scope{TeamID: team}
	user, err := r.User(ctx)
	if err != nil {
		return s, err
	}
	if s.TeamID == "" {
		s.TeamID = user.DefaultTeamID
	}
	var global *api.Team
	if s.TeamID != "" {
		if global, err = r.Client.GetTeam(ctx, s.TeamID, s.TeamID); err != nil {
			return s, err
		}
	}
	s.User, s.Team, s.GlobalTeam, s.Explicit = user, global, global, r.Explicit
	if linked {
		localOrg, crossTeam := r.localOrg()
		s.ScopeMismatch = localOrg != "" && s.TeamID != "" && s.TeamID != localOrg
		if !s.Explicit && localOrg == "" && crossTeam {
			r.UI.Warn("This repository has projects across multiple teams. Use `--scope` to specify which team, or `cd` into a project directory.")
		}
		if !s.Explicit && localOrg != "" {
			if !strings.HasPrefix(localOrg, "team_") {
				return s, linkedOutsideTeam(localOrg)
			}
			s.TeamID = localOrg
			if s.Team, err = r.Client.GetTeam(ctx, localOrg, localOrg); err != nil {
				return s, err
			}
		}
	}
	// Only now: a linked project names a team even when none is selected.
	if s.Team == nil {
		return s, noTeam
	}
	return s, nil
}

var (
	nextSwitch = cli.NewNext("Switch to a team by its slug", "teams", "switch", "<SLUG>")
	nextList   = cli.NewNext("List the teams you can switch to", "teams", "list")
	// noTeam: a command that needs a team never falls back to the user;
	// there is no personal account.
	noTeam = &cli.Error{Message: "No team selected. Pass --scope <team-slug>, or save a team with `vercel teams switch`.", Next: []*cli.Next{nextSwitch, nextList}}
)

// linkedOutsideTeam: a link to a project that is not a team's, which a
// personal account once owned.
func linkedOutsideTeam(org string) error {
	return cli.Errorf("This directory is linked to a project outside a team (%s). Run `vercel link` to link it to a team's project.", org)
}

// localOrg is project.json's owner, else the single owner of the repo.json
// projects containing Cwd. Read errors mean "not linked", as upstream.
func (r *Resolver) localOrg() (org string, crossTeam bool) {
	project, _ := link.ReadProject(r.Cwd)
	repo, _ := link.ReadRepo(r.Cwd, r.UI.Debug)
	var cfg *link.Repo
	if repo != nil {
		cfg = repo.Config
	}
	if cfg != nil && len(cfg.Projects) > 1 {
		all := owners(cfg, cfg.Projects)
		delete(all, "")
		crossTeam = len(all) > 1
	}
	switch {
	case project != nil:
		return project.OrgID, crossTeam
	case cfg == nil:
		return "", crossTeam
	}
	rel, err := filepath.Rel(repo.Root, r.Cwd)
	if err != nil {
		return "", crossTeam
	}
	if here := owners(cfg, link.ProjectsForPath(cfg.Projects, rel)); len(here) == 1 {
		for o := range here {
			org = o
		}
	}
	return org, crossTeam
}

func owners(cfg *link.Repo, projects []link.RepoProject) map[string]bool {
	orgs := map[string]bool{}
	for _, p := range projects {
		orgs[cmp.Or(p.OrgID, cfg.OrgID)] = true
	}
	return orgs
}

func errorToString(err error) string {
	var apiErr *api.Error
	if errors.As(err, &apiErr) {
		return apiErr.Message
	}
	return err.Error()
}
