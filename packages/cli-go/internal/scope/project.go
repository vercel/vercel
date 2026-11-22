package scope

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/link"
)

// projectLink is upstream's ProjectLink: where a project is linked.
type projectLink struct {
	OrgID, ProjectID, ProjectName, RepoRoot string
}

// Project is resolveProjectContext: getLinkedProject for nameOrID ("" for
// the linked project), with the project-not-found error for an explicit
// one, and requireProjectContext's team: the project's team becomes the
// client's. A nil project is not linked.
func (r *Resolver) Project(ctx context.Context, nameOrID string) (*api.Team, *api.Project, error) {
	team, project, orgID, err := r.linkedProject(ctx, nameOrID)
	switch {
	case err != nil:
		return nil, nil, err
	case project == nil && nameOrID != "":
		return nil, nil, r.projectNotFound(ctx, nameOrID, orgID)
	case project == nil:
		return nil, nil, nil
	}
	r.Client.SetTeam(team.ID)
	return team, project, nil
}

// linkedProject is getLinkedProject. orgID is the org that was searched,
// for errors; a nil project is not linked. Not ported: services detection
// (resolveProjectCwd), the remote and owner lookup options, and the
// repo.json project picker, which acts as without a terminal. A project
// is always a team's: a link outside a team is an error, not the user.
func (r *Resolver) linkedProject(ctx context.Context, name string) (*api.Team, *api.Project, string, error) {
	envOrg, err := platformEnv(r.Getenv, "ORG_ID")
	if err != nil {
		return nil, nil, "", err
	}
	envProject, err := platformEnv(r.Getenv, "PROJECT_ID")
	if err != nil {
		return nil, nil, "", err
	}
	useEnv := envOrg != "" && envProject != ""
	explicit := name != ""
	if !explicit && (envOrg != "" || envProject != "") && !useEnv {
		given, missing := "`VERCEL_ORG_ID`", "`VERCEL_PROJECT_ID`"
		if envOrg == "" {
			given, missing = missing, given
		}
		return nil, nil, "", cli.Errorf("You specified %s but you forgot to specify %s. You need to specify both to deploy to a custom project.\n", given, missing)
	}

	var lk *projectLink
	var resolved *api.Project
	var orgID string
	if explicit {
		var local *projectLink
		if !r.Explicit && !useEnv {
			if local, err = r.projectLink(r.Cwd, name, true); err != nil {
				return nil, nil, "", err
			}
		}
		lookup := r.Client.Team()
		switch {
		case r.Explicit:
		case useEnv:
			lookup = envOrg
		case local != nil:
			lookup = local.OrgID
		}
		if lookup == "" {
			// No team selected: the default team, never the user.
			s, err := r.Scope(ctx, false)
			if err != nil {
				return nil, nil, "", err
			}
			lookup = s.TeamID
		}
		orgID = lookup
		resolved, err = r.Client.GetProject(ctx, name, lookup)
		switch {
		case api.IsNotFound(err):
			resolved = nil
		case err != nil:
			return nil, nil, "", err
		default:
			localOrg := ""
			if local != nil {
				localOrg = local.OrgID
			}
			resolvedOrg := cmp.Or(resolved.AccountID, lookup, localOrg)
			if local == nil || local.ProjectID != resolved.ID {
				if local, err = r.projectLink(r.Cwd, resolved.ID, true); err != nil {
					r.UI.Debug(fmt.Sprintf("Ignoring local project metadata after explicit project resolution: %s", err))
					local = nil
				}
			}
			if resolvedOrg != "" {
				lk = &projectLink{ProjectID: resolved.ID, OrgID: resolvedOrg}
				if local != nil && local.ProjectID == resolved.ID && local.OrgID == resolvedOrg {
					lk = local
				}
			}
		}
	} else {
		if useEnv {
			lk = &projectLink{OrgID: envOrg, ProjectID: envProject}
		} else if lk, err = r.projectLink(r.Cwd, "", false); err != nil {
			return nil, nil, "", err
		}
		if lk != nil {
			orgID = lk.OrgID
		}
	}
	if lk == nil {
		return nil, nil, orgID, nil
	}
	if !strings.HasPrefix(lk.OrgID, "team_") {
		return nil, nil, "", linkedOutsideTeam(lk.OrgID)
	}

	// Upstream looks up the owner and the project at once.
	r.UI.StartSpinner("Retrieving project…")
	team, err := r.teamByID(ctx, lk.OrgID)
	project := resolved
	if err == nil && project == nil {
		project, err = r.Client.GetProject(ctx, lk.ProjectID, lk.OrgID)
		if api.IsNotFound(err) {
			project, err = nil, nil
		}
	}
	r.UI.StopSpinner()
	var apiErr *api.Error
	switch {
	case err == nil:
	case errors.As(err, &apiErr) && apiErr.Status == 403 && (apiErr.MissingToken || apiErr.InvalidToken):
		return nil, nil, "", cli.InvalidToken(r.Session.Source)
	case errors.As(err, &apiErr) && apiErr.Status == 403 && (apiErr.Code == "forbidden" || apiErr.Code == "team_unauthorized"):
		cs := r.UI.ColorScheme()
		return nil, nil, "", &cli.Error{
			Message: "Could not retrieve Project Settings. To link your Project, remove the " + cs.Gray("`") + cs.Bold(".vercel") + cs.Gray("`") + " directory and deploy again.",
			Link:    "https://vercel.link/cannot-load-project-settings",
		}
	default:
		return nil, nil, "", err
	}
	if team == nil || project == nil {
		if useEnv && !explicit {
			project, _ := json.Marshal(envProject)
			org, _ := json.Marshal(envOrg)
			return nil, nil, orgID, cli.Errorf("Project not found ({\"VERCEL_PROJECT_ID\":%s,\"VERCEL_ORG_ID\":%s})\n", project, org)
		}
		msg := "Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore.\n"
		if r.UI.IsStdoutTTY() {
			msg = iostreams.Emoji["warning"] + "  " + msg
		}
		r.UI.Print(msg)
		return nil, nil, lk.OrgID, nil
	}
	return team, project, lk.OrgID, nil
}

// projectLink is getProjectLink: project.json, unless an explicit name
// does not match it, then repo.json.
func (r *Resolver) projectLink(dir, name string, explicit bool) (*projectLink, error) {
	p, err := link.ReadProject(dir)
	if err != nil {
		return nil, cli.Errorf("%s", err)
	}
	if p != nil && (!explicit || name == "" || p.ProjectID == name || p.ProjectName == name) {
		return &projectLink{OrgID: p.OrgID, ProjectID: p.ProjectID, ProjectName: p.ProjectName}, nil
	}
	return r.repoProjectLink(dir, name, explicit)
}

// repoProjectLink is getProjectLinkFromRepoLink.
func (r *Resolver) repoProjectLink(dir, name string, explicit bool) (*projectLink, error) {
	repo, err := link.ReadRepo(dir, r.UI.Debug)
	if err != nil {
		return nil, cli.Errorf("%s", err)
	}
	if repo == nil || repo.Config == nil {
		return nil, nil
	}
	rel, err := filepath.Rel(repo.Root, dir)
	if err != nil {
		return nil, nil
	}
	all := repo.Config.Projects
	here := link.ProjectsForPath(all, rel)
	named := func(projects []link.RepoProject) *link.RepoProject {
		for i, p := range projects {
			if p.ID == name || p.Name == name {
				return &projects[i]
			}
		}
		return nil
	}
	var p *link.RepoProject
	switch {
	case explicit && name != "":
		p = named(all)
	case len(here) == 1:
		p = &here[0]
	default:
		selectable := here
		if len(selectable) == 0 {
			selectable = all
		}
		if name != "" {
			p = named(selectable)
		}
		// The picker is not ported: as without a terminal.
		if p == nil && len(selectable) == 1 {
			p = &selectable[0]
		}
	}
	if p == nil {
		return nil, nil
	}
	orgID := cmp.Or(p.OrgID, repo.Config.OrgID)
	if orgID == "" {
		var info []string
		if p.Name != "" {
			info = append(info, `name: "`+p.Name+`"`)
		}
		if p.Directory != "" {
			info = append(info, `directory: "`+p.Directory+`"`)
		}
		details := ""
		if len(info) > 0 {
			details = " Project: { " + strings.Join(info, ", ") + " }."
		}
		return nil, cli.Errorf("Could not determine org ID from repo.json config at \"%s\".%s Please re-link the repository.", repo.ConfigPath(), details)
	}
	return &projectLink{OrgID: orgID, ProjectID: p.ID, ProjectName: p.Name, RepoRoot: repo.Root}, nil
}

// teamByID is getOrgById for a team: nil when it is not found.
func (r *Resolver) teamByID(ctx context.Context, id string) (*api.Team, error) {
	t, err := r.Client.GetTeam(ctx, id, r.Client.Team())
	var apiErr *api.Error
	if errors.As(err, &apiErr) && (apiErr.Status == 404 || apiErr.Code == "not_found") {
		return nil, nil
	}
	return t, err
}

// projectNotFound is printProjectNotFoundError, which names the scope
// searched.
func (r *Resolver) projectNotFound(ctx context.Context, name, orgID string) error {
	contextName := orgID
	if strings.HasPrefix(orgID, "team_") {
		if t, err := r.teamByID(ctx, orgID); err != nil {
			r.UI.Debug(fmt.Sprintf("Scope lookup failed during error reporting: %s", errorToString(err)))
		} else if t != nil {
			contextName = t.Slug
		}
	} else if s, err := r.Scope(ctx, false); err != nil {
		r.UI.Debug(fmt.Sprintf("Scope lookup failed during error reporting: %s", errorToString(err)))
	} else {
		contextName = s.Team.Slug
	}
	clause := ""
	if contextName != "" {
		clause = " (" + contextName + ")"
	}
	return cli.Errorf("Project \"%s\" was not found in the current scope%s.\n\n"+
		"If it lives in a different team or account:\n"+
		"  • Retry with `--scope <team-slug|your-username>`, or\n"+
		"  • Run `vercel switch <team-slug|your-username>` to change scope.\n\n"+
		"List accessible teams with `vercel teams ls`.", name, clause)
}

// platformEnv is getPlatformEnv: VERCEL_<name>, else the deprecated
// NOW_<name>, not both.
func platformEnv(getenv func(string) string, name string) (string, error) {
	v, n := getenv("VERCEL_"+name), getenv("NOW_"+name)
	if v != "" && n != "" {
		return "", &cli.Error{
			Message: fmt.Sprintf("Both \"VERCEL_%s\" and \"NOW_%s\" env vars are defined. Please only define the \"VERCEL_%s\" env var.", name, name, name),
			Link:    "https://vercel.link/combining-old-and-new-config",
		}
	}
	return cmp.Or(v, n), nil
}
