// Package needs is what a command declares in Command.Needs: the state it
// needs before Run (logged in, a team, a project), which startup gets to
// first. Keep the need in a variable so Run can ask it what it resolved:
//
//	var need = needs.ProjectOrTeam()
//	var listCommand = &cli.Command{Needs: need, RunJSON: runList, ...}
//
//	func runList(ctx context.Context, in *cli.Input) (cli.JSONResult, error) {
//		team, project, err := need.From(ctx, in) // project is nil with --all
//		...
//	}
//
// The needs, what startup does first, and what Run reads:
//
//	needs.Nothing()              nothing      (nothing; --scope is not resolved)
//	needs.Login()                log in       need.From: the user
//	needs.Team()                 log in       need.From: the scope, always a team
//	needs.Project()              log in       need.From: the team and project (adds --project)
//	needs.Project(needs.Arg(0))  log in       the same; the argument names the project
//	needs.ProjectOrTeam()        log in       the same, or a nil project with --all
//	                                          (adds --project and --all/-a)
//	needs.EnsureLink()           log in       need.From: the team and linked project (adds --project)
//
// A need is state, never an action or an explicit argument: logging in is
// what `vercel login` does in Run, and a deployment is the command's own
// argument. There are no personal accounts: a team is always a team, and
// nothing falls back to the user. Every need but Nothing resolves --scope,
// --team and the local config's scope before Run, as upstream. The rest
// resolves when Run asks, so requests keep upstream's order. The list is
// closed: a command cannot declare anything else.
package needs

import "github.com/vercel/vercel/packages/cli-go/internal/cli"

type (
	NothingNeed       = cli.NothingNeed
	LoginNeed         = cli.LoginNeed
	TeamNeed          = cli.TeamNeed
	ProjectNeed       = cli.ProjectNeed
	ProjectOrTeamNeed = cli.ProjectOrTeamNeed
	LinkNeed          = cli.LinkNeed

	TeamOption    = cli.TeamOption
	ProjectOption = cli.ProjectOption
)

// Nothing needs no state: no login first, no team, and --scope is not
// resolved. `vercel login` declares it.
func Nothing() NothingNeed { return cli.NeedNothing() }

// Login logs in first: --token, VERCEL_TOKEN or the saved login, else the
// device login on a terminal or for an agent, else an error. need.From is
// the user; SelectedTeam and SaveTeam read and save the team `teams
// switch` selects.
func Login() LoginNeed { return cli.NeedLogin() }

// Team logs in first and resolves the team: --scope, the saved team, else
// the account's default team. Without one it fails; there is no personal
// account to fall back to. need.From is the scope.
func Team(opts ...TeamOption) TeamNeed { return cli.NeedTeam(opts...) }

// OptionalLogin: no login first; need.From is nil when logged out.
func OptionalLogin() TeamOption { return cli.OptionalLogin() }

// LinkedTeam: the linked project's team wins over the saved team unless
// the scope is explicit, as `whoami`.
func LinkedTeam() TeamOption { return cli.LinkedTeam() }

// Project is one project and its team: --project (or the Arg), else
// VERCEL_ORG_ID and VERCEL_PROJECT_ID, .vercel/project.json, then
// .vercel/repo.json. Its team becomes the team of later requests.
func Project(opts ...ProjectOption) ProjectNeed { return cli.NeedProject(opts...) }

// Arg makes positional argument i (from 0) name the project. It must be
// within the command's Args.
func Arg(i int) cli.ArgIndex { return cli.ArgIndex(i) }

// ProjectOrTeam is Project, or with --all the whole team.
func ProjectOrTeam() ProjectOrTeamNeed { return cli.NeedProjectOrTeam() }

// EnsureLink is the project this directory is linked to. Linking an
// unlinked directory is not ported yet: it fails, pointing at `vercel
// link`.
func EnsureLink() LinkNeed { return cli.NeedLink() }
