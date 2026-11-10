package scope

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// fixture is a Resolver against a fake API, in a directory of its own.
type fixture struct {
	t        *testing.T
	r        *Resolver
	dir      string
	env      map[string]string
	routes   map[string]string // "/path" -> JSON; others are 404
	statuses map[string]int
	requests []string
	stderr   *bytes.Buffer
}

func newFixture(t *testing.T) *fixture {
	f := &fixture{t: t, dir: t.TempDir(), env: map[string]string{}, statuses: map[string]int{}, routes: map[string]string{
		"/v2/user":           `{"user":{"id":"user_1","username":"mel","email":"mel@example.com"}}`,
		"/teams/team_1":      `{"id":"team_1","slug":"acme"}`,
		"/teams/team_2":      `{"id":"team_2","slug":"other"}`,
		"/v9/projects/web":   `{"id":"prj_1","name":"web","accountId":"team_1"}`,
		"/v9/projects/prj_1": `{"id":"prj_1","name":"web","accountId":"team_1"}`,
	}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.requests = append(f.requests, r.URL.RequestURI())
		body, ok := f.routes[r.URL.Path]
		status := f.statuses[r.URL.Path]
		switch {
		case status != 0:
		case ok:
			status = 200
		default:
			status, body = 404, `{"error":{"code":"not_found","message":"Not Found"}}`
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(srv.Close)
	ios, _, stderr := iostreams.Test()
	f.stderr = stderr
	creds := &config.Object{}
	creds.Set("token", "tok")
	session := &auth.Session{Creds: creds, Source: auth.FromFlag, Global: config.DefaultGlobal(), GlobalDir: t.TempDir(), UI: ios.UI}
	f.r = &Resolver{Client: api.New(srv.URL, session, srv.Client(), ios.UI), Session: session, UI: ios.UI, Cwd: f.dir,
		Getenv: func(k string) string { return f.env[k] }}
	return f
}

func (f *fixture) write(name, content string) {
	path := filepath.Join(f.dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		f.t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		f.t.Fatal(err)
	}
}

// A linked directory resolves its project and owner, and the project's
// team becomes the client's.
func TestProjectFromLink(t *testing.T) {
	f := newFixture(t)
	f.write(".vercel/project.json", `{"projectId":"prj_1","orgId":"team_1"}`)
	team, project, err := f.r.Project(context.Background(), "")
	if err != nil || project == nil || project.Name != "web" || team.Slug != "acme" {
		t.Fatalf("team %+v project %+v err %v", team, project, err)
	}
	if f.r.Client.Team() != "team_1" {
		t.Errorf("client team %q", f.r.Client.Team())
	}
	want := "/teams/team_1\n/v9/projects/prj_1?teamId=team_1"
	if got := strings.Join(f.requests, "\n"); got != want {
		t.Errorf("requests:\n%s", got)
	}
}

// Without a link, the project is nil and nothing is requested.
func TestProjectNotLinked(t *testing.T) {
	f := newFixture(t)
	if team, project, err := f.r.Project(context.Background(), ""); team != nil || project != nil || err != nil {
		t.Errorf("team %+v project %+v err %v", team, project, err)
	}
	if len(f.requests) != 0 {
		t.Errorf("requests %v", f.requests)
	}
}

// VERCEL_ORG_ID and VERCEL_PROJECT_ID link together; one alone is an
// error.
func TestProjectFromEnv(t *testing.T) {
	f := newFixture(t)
	f.env["VERCEL_ORG_ID"], f.env["VERCEL_PROJECT_ID"] = "team_1", "prj_1"
	if _, project, err := f.r.Project(context.Background(), ""); err != nil || project == nil {
		t.Fatalf("project %+v err %v", project, err)
	}
	f = newFixture(t)
	f.env["VERCEL_PROJECT_ID"] = "prj_1"
	_, _, err := f.r.Project(context.Background(), "")
	want := "You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`. You need to specify both to deploy to a custom project.\n"
	if err == nil || err.Error() != want {
		t.Errorf("err %q", err)
	}
	f = newFixture(t)
	f.env["VERCEL_ORG_ID"], f.env["VERCEL_PROJECT_ID"] = "team_1", "prj_1"
	delete(f.routes, "/v9/projects/prj_1")
	_, _, err = f.r.Project(context.Background(), "")
	if want := `Project not found ({"VERCEL_PROJECT_ID":"prj_1","VERCEL_ORG_ID":"team_1"})` + "\n"; err == nil || err.Error() != want {
		t.Errorf("err %q", err)
	}
}

// An explicit project is looked up in the saved team, and one that is not
// found names the scope searched.
func TestExplicitProject(t *testing.T) {
	f := newFixture(t)
	f.r.Client.SetTeam("team_1")
	team, project, err := f.r.Project(context.Background(), "web")
	if err != nil || project.ID != "prj_1" || team.ID != "team_1" {
		t.Fatalf("team %+v project %+v err %v", team, project, err)
	}
	if f.requests[0] != "/v9/projects/web?teamId=team_1" {
		t.Errorf("requests %v", f.requests)
	}
	_, _, err = f.r.Project(context.Background(), "missing")
	if err == nil || !strings.HasPrefix(err.Error(), `Project "missing" was not found in the current scope (acme).`) {
		t.Errorf("err %v", err)
	}
}

// repo.json links the one project at this path; with several, none (the
// picker is not ported), unless --project names one.
func TestProjectFromRepo(t *testing.T) {
	f := newFixture(t)
	if err := os.Mkdir(filepath.Join(f.dir, ".git"), 0o755); err != nil {
		t.Fatal(err)
	}
	f.write(".vercel/repo.json", `{"orgId":"team_1","projects":[{"id":"prj_1","name":"web","directory":"apps/web"},{"id":"prj_2","name":"api","directory":"apps/api"}]}`)
	f.write("apps/web/index.html", "")
	f.r.Cwd = filepath.Join(f.dir, "apps", "web")
	if _, project, err := f.r.Project(context.Background(), ""); err != nil || project == nil || project.ID != "prj_1" {
		t.Fatalf("project %+v err %v", project, err)
	}
	f.r.Cwd = f.dir
	if _, project, err := f.r.Project(context.Background(), ""); err != nil || project != nil {
		t.Errorf("several projects: project %+v err %v", project, err)
	}
}

// A linked project that is gone is not linked, with today's warning; a
// forbidden one is today's error.
func TestLinkedProjectGoneOrForbidden(t *testing.T) {
	f := newFixture(t)
	f.write(".vercel/project.json", `{"projectId":"prj_gone","orgId":"team_1"}`)
	if _, project, err := f.r.Project(context.Background(), ""); err != nil || project != nil {
		t.Fatalf("project %+v err %v", project, err)
	}
	if !strings.Contains(f.stderr.String(), "Your Project was either deleted, transferred to a new Team, or you don’t have access to it anymore.") {
		t.Errorf("stderr %q", f.stderr.String())
	}
	f = newFixture(t)
	f.write(".vercel/project.json", `{"projectId":"prj_1","orgId":"team_1"}`)
	f.statuses["/teams/team_1"], f.routes["/teams/team_1"] = 403, `{"error":{"code":"forbidden","message":"Not allowed"}}`
	_, _, err := f.r.Project(context.Background(), "")
	if err == nil || !strings.HasPrefix(err.Error(), "Could not retrieve Project Settings.") {
		t.Errorf("err %v", err)
	}
}

// The basic scope ignores the linked project; the linked one uses its
// team.
func TestScopeLinked(t *testing.T) {
	f := newFixture(t)
	f.r.Client.SetTeam("team_1")
	f.write(".vercel/project.json", `{"projectId":"prj_2","orgId":"team_2"}`)
	basic, err := f.r.Scope(context.Background(), false)
	if err != nil || basic.Team.Slug != "acme" {
		t.Fatalf("basic %+v err %v", basic, err)
	}
	linked, err := f.r.Scope(context.Background(), true)
	if err != nil || linked.Team.Slug != "other" || !linked.ScopeMismatch {
		t.Errorf("linked %+v err %v", linked, err)
	}
}

// There is no personal account: without a team the scope fails, the
// default team is used before that, and a link outside a team is an
// error, never the user.
func TestNoPersonalAccount(t *testing.T) {
	ctx := context.Background()
	f := newFixture(t)
	if _, err := f.r.Scope(ctx, false); err == nil || !strings.HasPrefix(err.Error(), "No team selected.") {
		t.Errorf("no team: %v", err)
	}

	f = newFixture(t)
	f.routes["/v2/user"] = `{"user":{"id":"user_1","username":"mel","defaultTeamId":"team_1"}}`
	if s, err := f.r.Scope(ctx, false); err != nil || s.Team.Slug != "acme" {
		t.Errorf("default team: %+v %v", s, err)
	}
	f = newFixture(t)
	f.routes["/v2/user"] = `{"user":{"id":"user_1","username":"mel","defaultTeamId":"team_1"}}`
	if _, project, err := f.r.Project(ctx, "web"); err != nil || project == nil || !slices.Contains(f.requests, "/v9/projects/web?teamId=team_1") {
		t.Errorf("a named project without a saved team is looked up in the default team: %+v %v %v", project, err, f.requests)
	}

	// A linked team's project names the team even when none is selected.
	f = newFixture(t)
	f.write(".vercel/project.json", `{"projectId":"prj_1","orgId":"team_1"}`)
	if _, err := f.r.Scope(ctx, false); err == nil || !strings.HasPrefix(err.Error(), "No team selected.") {
		t.Errorf("the basic scope ignores the link: %v", err)
	}
	if s, err := f.r.Scope(ctx, true); err != nil || s.Team.Slug != "acme" || s.GlobalTeam != nil {
		t.Errorf("linked team without a selected one: %+v %v", s, err)
	}

	f = newFixture(t)
	f.write(".vercel/project.json", `{"projectId":"prj_1","orgId":"user_1"}`)
	want := "This directory is linked to a project outside a team (user_1). Run `vercel link` to link it to a team's project."
	if _, _, err := f.r.Project(ctx, ""); err == nil || err.Error() != want {
		t.Errorf("project linked outside a team: %v", err)
	}
	f.r.Client.SetTeam("team_1")
	if _, err := f.r.Scope(ctx, true); err == nil || err.Error() != want {
		t.Errorf("scope linked outside a team: %v", err)
	}
}
