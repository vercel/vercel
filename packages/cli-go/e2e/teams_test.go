//go:build e2e

package e2e

import (
	"net/http"
	"slices"
	"testing"
)

const (
	teamOther = `{"id":"team_other","slug":"other","name":"Other Co","billing":{"plan":"hobby"}}`
	teamsPage = `{"teams":[` + teamAcme + `,` + teamOther + `],"pagination":{"count":2,"next":null,"prev":null}}`
	nextPage  = `{"teams":[` + teamAcme + `],"pagination":{"count":1,"next":1584722256178,"prev":null}}`
)

// teamsAPI's user works in a team, as whoamiAPI's.
func teamsAPI(extra jsonHandler) jsonHandler {
	h := jsonHandler{
		"GET /v2/user":         {Body: northstarUser},
		"GET /v2/teams":        {Body: teamsPage},
		"GET /v1/teams":        {Body: `{"teams":[` + teamAcme + `,` + teamOther + `]}`},
		"GET /teams/acme":      {Body: teamAcme},
		"GET /teams/team_acme": {Body: teamAcme},
	}
	for k, v := range extra {
		h[k] = v
	}
	return h
}

// withTeamsPage serves GET api.vercel.com/v2/teams in front of the login
// server, for a logged-out `teams ls` that logs in first.
type withTeamsPage struct{ *oauthServer }

func (s withTeamsPage) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Host == "api.vercel.com" && r.URL.Path == "/v2/teams" {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(teamsPage))
		return
	}
	s.oauthServer.ServeHTTP(w, r)
}

// noCredentials is the error for a command that needs a login, run
// without one outside a terminal.
const noCredentials = "Error: No existing credentials found. Please run `vercel login` or pass \"--token\"\n" +
	"Learn More: https://err.sh/vercel/no-credentials-found\n"

// agentEnv makes both CLIs detect an AI agent; without a terminal on
// stdin, they run non-interactively.
var agentEnv = map[string]string{"AI_AGENT": "codex"}

// The e2e context flags: the mock API and the case's config directory.
const e2eContext = "--api http://127.0.0.1:<port> --global-config <root>/cfg"

// The text errors of teams switch for agents, with their recovery commands.
const (
	nextList    = "  List the teams you can switch to:\n    vercel teams list " + e2eContext + "\n"
	nextSwitch  = "  Switch to a team by its slug:\n    vercel teams switch <SLUG> " + e2eContext + "\n" + nextList
	unknownNope = "Error: You do not have permission to access scope nope.\n\n"
	missingSlug = "Error: In non-interactive mode a team slug is required.\n\n"
)

func TestTeams(t *testing.T) {
	auth := map[string]string{"cfg/auth.json": authSaved}
	onTeam := map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`}
	northstar := jsonHandler{"GET /v2/user": {Body: northstarUser}}
	personal := jsonHandler{"GET /v2/user": {Body: personalUser}}
	cases := []Case{
		// teams ls
		{Name: "ls default team", Args: []string{"teams", "ls"}, Files: auth, API: teamsAPI(nil)},
		// Today the legacy personal account is listed, and current.
		{Name: "ls legacy personal account", Args: []string{"teams", "ls"}, Files: auth, API: teamsAPI(personal),
			Differs: []Difference{Changed("there is no personal account to list", 0, "\n", banner+"Fetching teams\nFetching user information\n"+
				"id        Team name     Plan      \nother     Other Co      hobby     \nacme      Acme Inc      pro       \n",
				"GET api/v2/teams?limit=20 auth=Bearer tok_saved session=new", "GET api/v2/user auth=Bearer tok_saved session=new")}},
		{Name: "ls json", Args: []string{"teams", "ls", "--json"}, Files: auth, API: teamsAPI(nil)},
		{Name: "ls saved team", Args: []string{"teams", "ls"}, Files: onTeam, API: teamsAPI(nil)},
		{Name: "ls saved team json", Args: []string{"teams", "ls", "--format", "json"}, Files: onTeam, API: teamsAPI(nil)},
		{Name: "ls northstar", Args: []string{"teams", "ls"}, Files: auth, API: teamsAPI(northstar)},
		{Name: "ls scope", Args: []string{"--scope", "acme", "teams", "ls"}, Files: auth, API: teamsAPI(nil)},
		{Name: "ls next page", Args: []string{"teams", "ls", "--limit", "1", "--since", "x"}, Files: auth, API: teamsAPI(jsonHandler{"GET /v2/teams": {Body: nextPage}}),
			Differs: []Difference{NextPage("vercel teams ls --limit 1 --since x --next 1584722256178", "vercel teams list --limit 1 --since x --next 1584722256178 "+e2eContext)}},
		{Name: "ls next page json", Args: []string{"--scope", "acme", "teams", "list", "--json", "--limit", "1"}, Files: auth, API: teamsAPI(jsonHandler{"GET /v2/teams": {Body: nextPage}})},
		{Name: "ls next page keeps scope, drops token", Args: []string{"--scope", "acme", "teams", "list", "--limit", "1", "--token", "tok_saved"}, API: teamsAPI(jsonHandler{"GET /v2/teams": {Body: nextPage}}),
			Differs: []Difference{NextPage("vercel teams ls --limit 1 --next 1584722256178", "vercel teams list --limit 1 --next 1584722256178 "+e2eContext+" --scope acme")}},
		{Name: "ls with next", Args: []string{"teams", "ls", "--next", "1584722256178"}, Files: auth, API: teamsAPI(nil)},
		{Name: "ls invalid next", Args: []string{"teams", "ls", "--next", "abc"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{CheckedBeforeWork("", "")}},
		{Name: "ls invalid limit", Args: []string{"teams", "ls", "--limit", "101"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{CheckedBeforeWork("", "")}},
		{Name: "ls extra argument", Args: []string{"teams", "ls", "extra"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{CheckedBeforeWork("", "")}},
		{Name: "ls invalid limit with scope", Args: []string{"--scope", "acme", "teams", "ls", "--limit", "0"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{CheckedBeforeWork("", "")}},
		{Name: "ls invalid limit with saved team", Args: []string{"teams", "ls", "--limit", "0"}, Files: onTeam, API: teamsAPI(nil)},
		{Name: "ls invalid limit logged out", Args: []string{"teams", "ls", "--limit", "0"}, API: teamsAPI(nil),
			Differs: []Difference{CheckedBeforeWork(noCredentials, "Error: Please provide an integer from 1 to 100 for option --limit\n")}},
		{Name: "ls 403", Args: []string{"teams", "ls"}, Files: auth, API: teamsAPI(jsonHandler{"GET /v2/teams": {Status: 403, Body: `{"error":{"code":"forbidden","message":"Not authorized"}}`}})},
		{Name: "ls logged out", Args: []string{"teams", "ls"}, API: teamsAPI(nil)},
		{Name: "ls logged out in CI", Args: []string{"teams", "ls"}, Env: map[string]string{"CI": "1"}, API: teamsAPI(nil)},
		{Name: "ls logged out agent logs in first", Args: []string{"teams", "ls"}, Env: map[string]string{"AI_AGENT": "codex"}, HTTPS: withTeamsPage{login(func(s *oauthServer) { s.user = northstarUser })}},
		{Name: "team list alias", Args: []string{"team", "list"}, Files: auth, API: teamsAPI(nil)},

		// teams switch
		{Name: "switch to team", Args: []string{"teams", "switch", "acme"}, Files: auth, API: teamsAPI(nil)},
		{Name: "switch same team", Args: []string{"teams", "switch", "acme"}, Files: onTeam, API: teamsAPI(nil)},
		// Today a legacy personal account can be the scope.
		{Name: "switch to legacy personal account", Args: []string{"teams", "switch", "melkey"}, Files: onTeam, API: teamsAPI(personal),
			Differs: []Difference{Changed("a scope is always a team", 1, "", banner+"Fetching teams information\nError: You cannot set your Personal Account as the scope.\n",
				"GET api/v2/user auth=Bearer tok_saved session=new", "GET api/v1/teams auth=Bearer tok_saved session=new"), KeepsFile("cfg/config.json")}},
		{Name: "switch personal northstar", Args: []string{"teams", "switch", "melkey"}, Files: auth, API: teamsAPI(northstar)},
		{Name: "switch unknown", Args: []string{"teams", "switch", "nope"}, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{Recovery("Error: You do not have permission to access scope nope.",
				"List the teams you can switch to", "vercel teams list --api http://127.0.0.1:<port> --global-config <root>/cfg")}},
		{Name: "switch unknown keeps context flags", Args: []string{"--cwd", "sub dir", "teams", "switch", "nope", "--token", "tok", "-S", "acme"},
			Files: map[string]string{"work/sub dir/.keep": ""}, API: teamsAPI(nil),
			Differs: []Difference{Recovery("Error: You do not have permission to access scope nope.",
				"List the teams you can switch to", "vercel teams list --api http://127.0.0.1:<port> --global-config <root>/cfg --cwd 'sub dir' --scope acme")}},
		{Name: "switch from stale team", Args: []string{"teams", "switch", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_gone"}`}, API: teamsAPI(nil)},
		{Name: "switch with other link", Args: []string{"teams", "switch", "acme"},
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`}, API: teamsAPI(nil)},
		{Name: "switch shortcut", Args: []string{"switch", "acme"}, Files: auth, API: teamsAPI(nil)},
		{Name: "switch shortcut rejects token", Args: []string{"switch", "--token", "abc", "acme"}, API: teamsAPI(nil), Differs: []Difference{InputCheckedFirst}},
		{Name: "change alias", Args: []string{"teams", "change", "other"}, Files: onTeam, API: teamsAPI(nil)},
		{Name: "switch logged out", Args: []string{"teams", "switch", "acme"}, API: teamsAPI(nil)},

		// Agents, in non-interactive mode, get text errors.
		{Name: "agent switch unknown", Args: []string{"teams", "switch", "nope"}, Env: agentEnv, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{AgentText(unknownNope + nextList)}},
		{Name: "agent switch unknown on team", Args: []string{"teams", "switch", "nope"}, Env: agentEnv, Files: onTeam, API: teamsAPI(nil),
			Differs: []Difference{AgentText(unknownNope + nextList)}},
		{Name: "non-interactive switch unknown", Args: []string{"teams", "switch", "nope", "--non-interactive"}, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{AgentText(unknownNope + "  List the teams you can switch to:\n    vercel teams list " + e2eContext + " --non-interactive\n")}},
		{Name: "agent switch personal northstar", Args: []string{"teams", "switch", "melkey"}, Env: agentEnv, Files: auth, API: teamsAPI(northstar),
			Differs: []Difference{AgentText("Error: You cannot set your Personal Account as the scope.\n")}},
		{Name: "agent switch without slug", Args: []string{"teams", "switch"}, Env: agentEnv, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{AgentText(missingSlug + nextSwitch), CheckedBeforeWork("", "")}},
		{Name: "agent switch without slug on stale team", Args: []string{"teams", "switch"}, Env: agentEnv, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_gone"}`}, API: teamsAPI(nil),
			Differs: []Difference{AgentText(missingSlug + nextSwitch)}},
		{Name: "agent ls unknown flag", Args: []string{"teams", "ls", "--bogus"}, Env: agentEnv, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{InputCheckedFirst, AgentText("✗ unknown or unexpected option: --bogus\n  Vercel CLI 61.1.0 accepts: --api, --count, --cwd, --debug, --format, --global-config, --help, --json, --limit, --local-config, --next, --no-color, --non-interactive, --scope, --since, --team, --token, --until, --version.\n")}},
		{Name: "agent ls missing flag value", Args: []string{"teams", "ls", "--limit"}, Env: agentEnv, Files: auth, API: teamsAPI(nil),
			Differs: []Difference{InputCheckedFirst, AgentText("Error: option requires argument: --limit\n")}},
		{Name: "agent ls invalid limit", Args: []string{"teams", "ls", "--limit", "0"}, Env: agentEnv, Files: auth, API: teamsAPI(nil), Differs: []Difference{CheckedBeforeWork("", "")}},

		// The group.
		{Name: "no subcommand", Args: []string{"teams"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{InputCheckedFirst}},
		{Name: "unknown subcommand", Args: []string{"teams", "bogus"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{InputCheckedFirst}},
		{Name: "unknown flag before subcommand", Args: []string{"teams", "--json", "ls"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{InputCheckedFirst}},
		{Name: "unknown ls flag", Args: []string{"teams", "ls", "--bogus"}, Files: auth, API: teamsAPI(nil), Differs: []Difference{InputCheckedFirst}},
		{Name: "help", Args: []string{"teams", "--help"}, Files: auth, Differs: []Difference{InputCheckedFirst}},
		{Name: "ls help", Args: []string{"teams", "ls", "--help"}, Files: auth, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_teams_list")}},
		{Name: "help switch", Args: []string{"help", "teams", "switch"}, Files: auth, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_teams_switch")}},
		{Name: "shortcut help is the group's", Args: []string{"switch", "--help"}, Files: auth, Differs: []Difference{InputCheckedFirst}},
	}
	for _, c := range cases {
		// switch fetches the user and the teams concurrently.
		c.UnorderedRequests = slices.Contains(c.Args, "switch") || slices.Contains(c.Args, "change")
		t.Run(c.Name, func(t *testing.T) { compare(t, c) })
	}
}
