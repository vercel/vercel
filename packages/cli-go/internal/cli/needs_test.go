package cli

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// fakeResolver records what needs ask for.
type fakeResolver struct {
	loggedIn bool
	scope    *Scope
	project  *api.Project // nil: not linked
	calls    []string
}

func (f *fakeResolver) LoggedIn() bool           { return f.loggedIn }
func (f *fakeResolver) TokenSource() auth.Source { return auth.FromFlag }
func (f *fakeResolver) User(context.Context) (*api.User, error) {
	f.calls = append(f.calls, "user")
	return f.scope.User, nil
}
func (f *fakeResolver) Scope(_ context.Context, linked bool) (*Scope, error) {
	f.calls = append(f.calls, fmt.Sprintf("scope linked=%t", linked))
	return f.scope, nil
}
func (f *fakeResolver) Project(_ context.Context, nameOrID string) (*api.Team, *api.Project, error) {
	f.calls = append(f.calls, fmt.Sprintf("project %q", nameOrID))
	if f.project == nil {
		return nil, nil, nil
	}
	return acme.Team, f.project, nil
}
func (f *fakeResolver) SelectedTeam() string     { return "team_1" }
func (f *fakeResolver) SaveTeam(id string) error { f.calls = append(f.calls, "save "+id); return nil }
func (f *fakeResolver) LinkedOrg() string        { return "" }
func (f *fakeResolver) Login(context.Context) error {
	f.calls = append(f.calls, "login")
	return nil
}

var acme = &Scope{User: &api.User{ID: "user_1", Username: "mel"}, Team: &api.Team{ID: "team_1", Slug: "acme"}}

// run parses args against a tree with cmd, and gives Run's Input to read.
func run(t *testing.T, cmd *Command, r Resolver, args ...string) *Input {
	t.Helper()
	cmd.Name, cmd.Run = "thing", noop
	inv, err := Parse(&Command{Name: "vercel", Children: []*Command{cmd}}, append([]string{"thing"}, args...))
	if err == nil {
		err = inv.FlagErr
	}
	if err != nil {
		t.Fatal(err)
	}
	in := NewInput(inv, r)
	ios, _, _ := iostreams.Test()
	in.UI = ios.UI
	return in
}

// What startup does for each need, and the flags each adds.
func TestNeedsStartupAndFlags(t *testing.T) {
	for _, c := range []struct {
		need           Need
		login, noScope bool
		flags          string
	}{
		{need: NeedNothing(), noScope: true},
		{need: NeedLogin(), login: true},
		{need: NeedTeam(), login: true},
		{need: NeedTeam(OptionalLogin())},
		{need: NeedProject(), login: true, flags: "project"},
		{need: NeedProject(ArgIndex(0)), login: true},
		{need: NeedProjectOrTeam(), login: true, flags: "project all"},
		{need: NeedLink(), login: true, flags: "project"},
	} {
		cmd := &Command{Needs: c.need}
		var flags []string
		for _, f := range cmd.AllFlags() {
			flags = append(flags, f.Name)
		}
		got := fmt.Sprint(cmd.LogsInFirst(), cmd.IgnoresScope(), strings.Join(flags, " "))
		if want := fmt.Sprint(c.login, c.noScope, c.flags); got != want {
			t.Errorf("%T: %s, want %s", c.need, got, want)
		}
	}
}

// Each From asks the resolver for exactly what its need resolves.
func TestNeedsFrom(t *testing.T) {
	ctx := context.Background()

	team := NeedTeam(OptionalLogin(), LinkedTeam())
	r := &fakeResolver{scope: acme}
	if s, err := team.From(ctx, run(t, &Command{Needs: team}, r)); s != nil || err != nil || len(r.calls) != 0 {
		t.Errorf("logged out: %+v %v %v", s, err, r.calls)
	}
	r.loggedIn = true
	if s, _ := team.From(ctx, run(t, &Command{Needs: team}, r)); s != acme || fmt.Sprint(r.calls) != "[scope linked=true]" {
		t.Errorf("logged in: %+v %v", s, r.calls)
	}

	project := NeedProject()
	r = &fakeResolver{project: &api.Project{ID: "prj_1"}}
	if tm, p, err := project.From(ctx, run(t, &Command{Needs: project}, r, "--project", "web")); err != nil || p.ID != "prj_1" || tm.Slug != "acme" || fmt.Sprint(r.calls) != `[project "web"]` {
		t.Errorf("--project: %+v %+v %v %v", tm, p, err, r.calls)
	}
	byArg := NeedProject(ArgIndex(0))
	r = &fakeResolver{}
	_, _, err := byArg.From(ctx, run(t, &Command{Needs: byArg, Args: []Arg{{Name: "name"}}}, r, "web"))
	if !strings.HasPrefix(fmt.Sprint(err), "Your codebase isn't linked to a project on Vercel.") || fmt.Sprint(r.calls) != `[project "web"]` {
		t.Errorf("argument: %v %v", err, r.calls)
	}

	either := NeedProjectOrTeam()
	r = &fakeResolver{scope: acme}
	if tm, p, err := either.From(ctx, run(t, &Command{Needs: either}, r, "--all")); err != nil || p != nil || tm.Slug != "acme" {
		t.Errorf("--all: %+v %+v %v", tm, p, err)
	}
	_, _, err = either.From(ctx, run(t, &Command{Needs: either}, &fakeResolver{}))
	if !strings.HasSuffix(fmt.Sprint(err), "or use --project <name> or --all.") {
		t.Errorf("not linked: %v", err)
	}

	login := NeedLogin()
	r = &fakeResolver{scope: acme}
	in := run(t, &Command{Needs: login}, r)
	if u, _ := login.From(ctx, in); u != acme.User || login.SelectedTeam(in) != "team_1" {
		t.Errorf("login: %+v", u)
	}
	_ = login.SaveTeam(in, "team_2")
	_ = run(t, &Command{Needs: NeedNothing()}, r).Login(ctx)
	if fmt.Sprint(r.calls) != "[user save team_2 login]" {
		t.Errorf("calls %v", r.calls)
	}
}

// A need is read only in Run, and only by the command that declares it.
func TestNeedsReadOutsideTheirCommandPanic(t *testing.T) {
	login, other := NeedLogin(), NeedLogin()
	for name, in := range map[string]*Input{
		"thing reads its need outside Run":       run(t, &Command{Needs: login}, nil),
		"thing reads a need it does not declare": run(t, &Command{Needs: other}, &fakeResolver{}),
	} {
		func() {
			defer func() {
				if r := recover(); !strings.Contains(fmt.Sprint(r), name) {
					t.Errorf("recover() = %v, want %q", r, name)
				}
			}()
			login.SelectedTeam(in)
		}()
	}
}
