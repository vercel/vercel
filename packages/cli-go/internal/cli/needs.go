package cli

import (
	"context"
	"fmt"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
)

// Need is the state a command needs before Run: logged in, a team, a
// project. Startup gets there first, adds the flags that name the
// project, and Run reads the result back with the need's From. Actions
// (logging in) and explicit arguments (a deployment) are the command's
// own. Commands declare one with the constructors in internal/cli/needs.
// The method is unexported, so the list of needs is closed.
type Need interface{ base() *need }

type needKind int

const (
	needNothing needKind = iota + 1
	needLogin
	needTeam
	needProject
	needProjectOrTeam
	needLink
)

type need struct {
	kind          needKind
	arg           int  // ArgIndex: the positional naming the project; -1 for none
	optionalLogin bool // OptionalLogin
	linkedTeam    bool // LinkedTeam
}

func newNeed(k needKind) *need { return &need{kind: k, arg: -1} }

// Each need is its own type, so From returns exactly what it resolves.
type (
	// NothingNeed is no state: no login first, and --scope, --team and
	// the local config's scope are not resolved.
	NothingNeed struct{ n *need }
	// LoginNeed logs in first (or fails in CI and without a terminal).
	LoginNeed struct{ n *need }
	// TeamNeed logs in first and resolves the team. It is always a team:
	// there is no personal account to fall back to.
	TeamNeed struct{ n *need }
	// ProjectNeed is one project, and the team it belongs to.
	ProjectNeed struct{ n *need }
	// ProjectOrTeamNeed is one project, or with --all the whole team.
	ProjectOrTeamNeed struct{ n *need }
	// LinkNeed is the project this directory is linked to.
	LinkNeed struct{ n *need }
)

func (x NothingNeed) base() *need       { return x.n }
func (x LoginNeed) base() *need         { return x.n }
func (x TeamNeed) base() *need          { return x.n }
func (x ProjectNeed) base() *need       { return x.n }
func (x ProjectOrTeamNeed) base() *need { return x.n }
func (x LinkNeed) base() *need          { return x.n }

// Options are typed per need, so an option that does not apply to a need
// does not compile.
type (
	TeamOption    interface{ teamOption(*need) }
	ProjectOption interface{ projectOption(*need) }
)

// ArgIndex is a positional argument, from 0, that names the project. It
// must be within the command's Args (TestNeeds).
type ArgIndex int

func (a ArgIndex) projectOption(n *need) { n.arg = int(a) }

type teamOptionFunc func(*need)

func (o teamOptionFunc) teamOption(n *need) { o(n) }

func NeedNothing() NothingNeed             { return NothingNeed{newNeed(needNothing)} }
func NeedLogin() LoginNeed                 { return LoginNeed{newNeed(needLogin)} }
func NeedProjectOrTeam() ProjectOrTeamNeed { return ProjectOrTeamNeed{newNeed(needProjectOrTeam)} }
func NeedLink() LinkNeed                   { return LinkNeed{newNeed(needLink)} }

func NeedTeam(opts ...TeamOption) TeamNeed {
	n := newNeed(needTeam)
	for _, o := range opts {
		o.teamOption(n)
	}
	return TeamNeed{n}
}

func NeedProject(opts ...ProjectOption) ProjectNeed {
	n := newNeed(needProject)
	for _, o := range opts {
		o.projectOption(n)
	}
	return ProjectNeed{n}
}

// OptionalLogin: no login first; From returns nil when logged out.
func OptionalLogin() TeamOption { return teamOptionFunc(func(n *need) { n.optionalLogin = true }) }

// LinkedTeam: the team of the project linked in this directory wins over
// the saved team, unless the scope is explicit (getScope's
// resolveLocalScope).
func LinkedTeam() TeamOption { return teamOptionFunc(func(n *need) { n.linkedTeam = true }) }

// NeedsArg is the positional argument the need reads, -1 for none.
func (c *Command) NeedsArg() int {
	if c.Needs == nil {
		return -1
	}
	return c.Needs.base().arg
}

// LogsInFirst: without a token, startup logs in before Run, or fails in
// CI and without a terminal.
func (c *Command) LogsInFirst() bool {
	if c.Needs == nil {
		return false
	}
	switch n := c.Needs.base(); n.kind {
	case needNothing:
		return false
	case needTeam:
		return !n.optionalLogin
	}
	return true
}

// IgnoresScope: startup does not resolve --scope, --team or the local
// config's scope, which a command that needs nothing has no use for.
func (c *Command) IgnoresScope() bool {
	return c.Needs != nil && c.Needs.base().kind == needNothing
}

// flags are the options a need adds.
func (n *need) flags() []*Flag {
	switch {
	case n.kind == needProjectOrTeam:
		return []*Flag{FlagProject, FlagAll}
	case n.kind == needLink, n.kind == needProject && n.arg < 0:
		return []*Flag{FlagProject}
	}
	return nil
}

// Resolver is what needs resolve with. Startup builds it from
// internal/scope and the device login; commands reach it only through
// their need, and `login` through Input.Login.
type Resolver interface {
	LoggedIn() bool
	TokenSource() auth.Source
	// User is the logged-in user, requested once.
	User(context.Context) (*api.User, error)
	// Scope is getScope; linked applies the linked project's team. Its
	// Team is never nil: without one it fails.
	Scope(ctx context.Context, linked bool) (*Scope, error)
	// Project is getLinkedProject for nameOrID ("" for the linked
	// project), and its team; nil when not linked. It makes the project's
	// team the client's.
	Project(ctx context.Context, nameOrID string) (*api.Team, *api.Project, error)
	// SelectedTeam is the team --scope or `teams switch` selected, "" for
	// none.
	SelectedTeam() string
	// SaveTeam saves the selected team.
	SaveTeam(teamID string) error
	// LinkedOrg is the owner of .vercel/project.json, "" when not linked.
	LinkedOrg() string
	// Login runs the device login and saves it.
	Login(context.Context) error
}

// resolver is the Input's, for the need the command declared.
func (n *need) resolver(in *Input) Resolver {
	cmd := in.inv.Command()
	switch {
	case in.resolver == nil:
		panic("cli: " + cmd.Name + " reads its need outside Run; Validate runs before login and scope")
	case cmd.Needs == nil || cmd.Needs.base() != n:
		panic("cli: " + cmd.Name + " reads a need it does not declare")
	}
	return in.resolver
}

// From is the logged-in user.
func (x LoginNeed) From(ctx context.Context, in *Input) (*api.User, error) {
	return x.n.resolver(in).User(ctx)
}

// SelectedTeam is the team --scope or `teams switch` selected, "" for
// none. Unlike TeamNeed it makes no request and ignores the linked
// project.
func (x LoginNeed) SelectedTeam(in *Input) string { return x.n.resolver(in).SelectedTeam() }

// SaveTeam saves the team later commands use, as `teams switch`.
func (x LoginNeed) SaveTeam(in *Input, teamID string) error {
	return x.n.resolver(in).SaveTeam(teamID)
}

// LinkedOrg is the owner of the project linked in this directory, "" when
// not linked.
func (x LoginNeed) LinkedOrg(in *Input) string { return x.n.resolver(in).LinkedOrg() }

// From is the scope, whose Team is never nil. With OptionalLogin it is
// nil when logged out, and no request is made.
func (x TeamNeed) From(ctx context.Context, in *Input) (*Scope, error) {
	r := x.n.resolver(in)
	if x.n.optionalLogin && !r.LoggedIn() {
		return nil, nil
	}
	return r.Scope(ctx, x.n.linkedTeam)
}

// From is the project named by the need's argument or --project, else
// the linked one (VERCEL_ORG_ID and VERCEL_PROJECT_ID, .vercel/project.json,
// .vercel/repo.json), and its team.
func (x ProjectNeed) From(ctx context.Context, in *Input) (*api.Team, *api.Project, error) {
	return x.n.project(ctx, in, notLinked(in))
}

// From is the project, as ProjectNeed, or with --all the scope's team and
// a nil project.
func (x ProjectOrTeamNeed) From(ctx context.Context, in *Input) (*api.Team, *api.Project, error) {
	r := x.n.resolver(in)
	if in.inv.Bool(FlagAll) {
		s, err := r.Scope(ctx, false)
		if err != nil {
			return nil, nil, err
		}
		return s.Team, nil, nil
	}
	return x.n.project(ctx, in, Errorf("No linked project found. Run `vercel link` to link a project, or use --project <name> or --all."))
}

// From is the linked project, as ProjectNeed. Linking an unlinked
// directory at a terminal is not ported: it fails, as without one.
func (x LinkNeed) From(ctx context.Context, in *Input) (*api.Team, *api.Project, error) {
	return x.n.project(ctx, in, notLinked(in))
}

func (n *need) project(ctx context.Context, in *Input, notLinked error) (*api.Team, *api.Project, error) {
	name := ""
	switch {
	case n.arg >= 0 && len(in.Args) > n.arg:
		name = in.Args[n.arg]
	case n.arg < 0:
		name = in.inv.String(FlagProject)
	}
	team, project, err := n.resolver(in).Project(ctx, name)
	if err != nil {
		return nil, nil, err
	}
	if project == nil {
		return nil, nil, notLinked
	}
	return team, project, nil
}

// notLinked is requireProjectContext's error.
func notLinked(in *Input) error {
	return Errorf("Your codebase isn't linked to a project on Vercel. Run %s to begin.", in.UI.ColorScheme().Cmd("vercel link"))
}

// Login runs the device login and saves it. Only `vercel login` logs in
// as its action (TestCommandsDoNotBypassTheFramework); other commands
// declare a need that logs in first.
func (in *Input) Login(ctx context.Context) error { return in.runResolver().Login(ctx) }

// InvalidToken is getTeams' 403: errors-ts.ts InvalidToken for the token
// in use.
func (in *Input) InvalidToken() *Error { return InvalidToken(in.runResolver().TokenSource()) }

func (in *Input) runResolver() Resolver {
	if in.resolver == nil {
		panic(fmt.Sprintf("cli: %s calls Run's input in Validate", in.inv.Command().Name))
	}
	return in.resolver
}
