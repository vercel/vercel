//go:build e2e

package e2e

import (
	"slices"
	"strings"
	"testing"
	"time"
)

const (
	authSaved     = `{"token":"tok_saved","userId":"user_1"}`
	authNoUserID  = `{"token":"tok_saved"}`
	personalUser  = `{"user":{"id":"user_1","email":"me@example.com","username":"melkey","name":"Mel","billing":{"plan":"hobby"}}}`
	northstarUser = `{"user":{"id":"user_1","email":"me@example.com","username":"melkey","name":"Mel","version":"northstar","defaultTeamId":"team_default"}}`
	teamAcme      = `{"id":"team_acme","slug":"acme","name":"Acme Inc","billing":{"plan":"pro"}}`
	teamDefault   = `{"id":"team_default","slug":"melkeys-projects","name":"melkeys-projects","billing":{"plan":"oss"}}`
	teamLinked    = `{"id":"team_linked","slug":"linked","name":null,"billing":{"plan":"enterprise"}}`
)

// whoamiAPI's user works in a team, as every account does: there is no
// personal account. The cases for a legacy personal user declare what
// changed for it.
func whoamiAPI(extra jsonHandler) jsonHandler {
	h := jsonHandler{
		"GET /v2/user":            {Body: northstarUser},
		"GET /teams/team_acme":    {Body: teamAcme},
		"GET /teams/acme":         {Body: teamAcme},
		"GET /teams/team_default": {Body: teamDefault},
		"GET /teams/team_linked":  {Body: teamLinked},
		"GET /v1/teams":           {Body: `{"teams":[` + teamAcme + `]}`},
	}
	for k, v := range extra {
		h[k] = v
	}
	return h
}

// noTeam is the error for a command that needs a team when none is
// selected and the account has no default team.
const noTeam = "Error: No team selected. Pass --scope <team-slug>, or save a team with `vercel teams switch`.\n\n" +
	"  Switch to a team by its slug:\n    vercel teams switch <SLUG> " + e2eContext + "\n" +
	"  List the teams you can switch to:\n    vercel teams list " + e2eContext + "\n"

func TestWhoami(t *testing.T) {
	cases := []Case{
		// Output modes.
		{Name: "piped prints the username", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "json default team", Args: []string{"whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "format json", Args: []string{"whoami", "--format", "json"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "format JSON uppercase", Args: []string{"whoami", "--format=JSON"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "terminal default team", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil), PTY: true},
		// A legacy personal account without a team: today the personal
		// account is the scope; here there is none to fall back to.
		{Name: "legacy personal account", Args: []string{"whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Body: personalUser}}),
			Differs: []Difference{Changed("there is no personal account to fall back to", 1, "", noTeam, "GET api/v2/user auth=Bearer tok_saved session=new")}},
		{Name: "extra arguments are ignored", Args: []string{"whoami", "extra"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},

		// Team resolution: saved team, default team, linked projects.
		{Name: "saved team json", Args: []string{"whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`}, API: whoamiAPI(nil)},
		{Name: "saved team terminal", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`}, API: whoamiAPI(nil), PTY: true},
		{Name: "northstar default team", Args: []string{"whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Body: northstarUser}})},
		{Name: "northstar default team terminal", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Body: northstarUser}}), PTY: true},
		{Name: "linked project overrides saved team", Args: []string{"whoami", "--json"},
			Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`}, API: whoamiAPI(nil)},
		{Name: "linked project override terminal", Args: []string{"whoami"},
			Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`}, API: whoamiAPI(nil), PTY: true},
		// No selected or default team: the linked project's team is active.
		{Name: "linked team without a selected team", Args: []string{"whoami", "--json"},
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`},
			API:   whoamiAPI(jsonHandler{"GET /v2/user": {Body: personalUser}})},
		{Name: "linked team without a selected team terminal", Args: []string{"whoami"}, PTY: true,
			Files:   map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`},
			API:     whoamiAPI(jsonHandler{"GET /v2/user": {Body: personalUser}}),
			Differs: []Difference{Replaced("nothing is selected globally: there is no personal account", "globally selected: \x1b[1mPersonal Account", "globally selected: \x1b[1mnone")}},
		{Name: "personal link with saved team", Args: []string{"whoami", "--json"},
			Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"user_1"}`}, API: whoamiAPI(nil),
			Differs: []Difference{Changed("a link outside a team is an error, not the personal account", 1, "",
				"Error: This directory is linked to a project outside a team (user_1). Run `vercel link` to link it to a team's project.\n",
				"GET api/v2/user auth=Bearer tok_saved session=new", "GET api/teams/team_acme?teamId=team_acme auth=Bearer tok_saved session=new")}},
		{Name: "repo link single match", Args: []string{"whoami", "--json"}, Cwd: "work/apps/web",
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/repo.json": `{"orgId":"team_linked","projects":[{"id":"p1","name":"web","directory":"apps/web"},{"id":"p2","name":"api","directory":"apps/api"}]}`, "work/apps/web/x": ""}, API: whoamiAPI(nil)},
		{Name: "cross team repo warns", Args: []string{"whoami"},
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/repo.json": `{"orgId":"team_linked","projects":[{"id":"p1","name":"web","directory":"apps/web","orgId":"team_acme"},{"id":"p2","name":"api","directory":"apps/api"}]}`}, API: whoamiAPI(nil)},
		{Name: "invalid project json is ignored", Args: []string{"whoami", "--json"},
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{not json`}, API: whoamiAPI(nil)},

		// Explicit scope, resolved before the command.
		{Name: "scope team slug", Args: []string{"whoami", "--json", "--scope", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "scope cached", Args: []string{"whoami", "--json", "--scope", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"cachedTeamIds":{"acme":"team_acme"}}`}, API: whoamiAPI(nil)},
		{Name: "scope with link is explicit", Args: []string{"whoami", "--json", "-S", "acme"},
			Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`}, API: whoamiAPI(nil)},
		{Name: "scope matching the user", Args: []string{"whoami", "--json", "--scope", "melkey"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "scope personal for northstar", Args: []string{"whoami", "--scope", "melkey"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Body: northstarUser}})},
		{Name: "scope does not exist", Args: []string{"whoami", "--scope", "nope"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "deprecated team flag", Args: []string{"whoami", "--team", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "local config scope", Args: []string{"whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved, "work/vercel.json": `{"scope":"acme"}`}, API: whoamiAPI(nil)},
		{Name: "local config parse error", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "work/vercel.json": `{`}, API: whoamiAPI(nil)},
		{Name: "local config with BOM", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "work/vercel.json": "\ufeff{}"}, API: whoamiAPI(nil)},
		{Name: "local config missing path", Args: []string{"whoami", "-A", "missing.json"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "now json is deprecated", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "work/now.json": `{}`}, API: whoamiAPI(nil)},

		// Credentials.
		{Name: "logged out", Args: []string{"whoami"}},
		{Name: "logged out json", Args: []string{"whoami", "--json"}},
		{Name: "token flag", Args: []string{"whoami", "--json", "--token", "tokflag"}, API: whoamiAPI(nil)},
		{Name: "token env", Args: []string{"whoami", "--json"}, Env: map[string]string{"VERCEL_TOKEN": "tokenv"}, API: whoamiAPI(nil)},
		{Name: "token flag ignores saved team", Args: []string{"whoami", "--json", "-t", "tokflag"}, Files: map[string]string{"cfg/config.json": `{"currentTeam":"team_acme"}`}, API: whoamiAPI(nil)},
		{Name: "invalid token characters", Args: []string{"whoami", "-t", "bad token!"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "empty token", Args: []string{"whoami", "--token="}, Differs: []Difference{InputCheckedFirst}},
		{Name: "saves user id", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authNoUserID}, API: whoamiAPI(nil)},
		{Name: "403 saved token", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Status: 403, Body: `{"error":{"code":"forbidden","message":"Not authorized"}}`}})},
		{Name: "403 flag token", Args: []string{"whoami", "-t", "tokflag"}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Status: 403, Body: `{"error":{"code":"forbidden","message":"Not authorized"}}`}})},
		{Name: "403 env token", Args: []string{"whoami"}, Env: map[string]string{"VERCEL_TOKEN": "tokenv"}, API: whoamiAPI(jsonHandler{"GET /v2/user": {Status: 403, Body: `{"error":{"code":"forbidden","message":"Not authorized"}}`}})},
		{Name: "team 404", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_gone"}`}, API: whoamiAPI(nil)},
		{Name: "keyring unavailable", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"credStorage":"keyring"}`}, API: whoamiAPI(nil)},
		{Name: "invalid cred storage", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"credStorage":"vault"}`}, API: whoamiAPI(nil)},
		{Name: "auth json with BOM", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": "\ufeff" + authSaved}, API: whoamiAPI(nil)},

		// Agents.
		{Name: "agent team 403", Args: []string{"whoami"}, Env: map[string]string{"AI_AGENT": "codex"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"currentTeam":"team_acme"}`},
			API: whoamiAPI(jsonHandler{"GET /teams/team_acme": {Status: 403, Body: `{"error":{"code":"forbidden","message":"You don't have access"}}`}}),
			Differs: []Difference{AgentText("Error: You don't have access\n" +
				"  Check that the selected team is correct. If it is, ask a team owner to grant the required access. Retry only after the team or access changes.\n")}},
		{Name: "agent piped identity", Args: []string{"whoami"}, Env: map[string]string{"CODEX_THREAD_ID": "t1"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},

		// The CLI session groups invocations less than 30 minutes apart, for
		// at most a day.
		{Name: "session reused", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/telemetry-session.json": savedSession(time.Hour, 10*time.Minute)}, API: whoamiAPI(nil)},
		{Name: "session idle too long", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/telemetry-session.json": savedSession(time.Hour, 31*time.Minute)}, API: whoamiAPI(nil)},
		{Name: "session too old", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/telemetry-session.json": savedSession(25*time.Hour, time.Minute)}, API: whoamiAPI(nil)},
		{Name: "session malformed", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/telemetry-session.json": `{"id":42}`}, API: whoamiAPI(nil)},

		// Arguments and help.
		{Name: "unknown flag", Args: []string{"whoami", "--bogus"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "unknown flag suggestion", Args: []string{"whoami", "--jsn"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "agent unknown flag", Args: []string{"whoami", "--jsn"}, Env: agentEnv, Differs: []Difference{InputCheckedFirst}},
		{Name: "invalid format", Args: []string{"whoami", "--format", "xml"}, Files: map[string]string{"cfg/auth.json": authSaved}, Differs: []Difference{InputCheckedFirst}},
		{Name: "missing format value", Args: []string{"whoami", "-F"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "short flag followed by short", Args: []string{"whoami", "-Fjson"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "help", Args: []string{"whoami", "--help"}, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_whoami")}},
		{Name: "help subcommand", Args: []string{"help", "whoami"}, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_whoami")}},
		{Name: "help wins over bad flags", Args: []string{"whoami", "--bogus", "-h"}, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_whoami")}},
		{Name: "version after command runs command", Args: []string{"whoami", "--version"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "no color flag", Args: []string{"whoami", "--no-color"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "no color terminal", Args: []string{"whoami", "--no-color"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil), PTY: true},
		{Name: "force color off terminal", Args: []string{"whoami"}, Env: map[string]string{"FORCE_COLOR": "0"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil), PTY: true},

		// Debug output.
		{Name: "debug default team", Args: []string{"whoami", "--debug"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "debug linked scope", Args: []string{"-d", "whoami", "--json"}, Files: map[string]string{"cfg/auth.json": authSaved, "work/.vercel/project.json": `{"projectId":"prj_1","orgId":"team_linked"}`}, API: whoamiAPI(nil)},
		{Name: "debug explicit scope", Args: []string{"whoami", "-d", "--scope", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},
		{Name: "debug agent", Args: []string{"whoami", "-d"}, Env: map[string]string{"AI_AGENT": "claude"}, Files: map[string]string{"cfg/auth.json": authSaved}, API: whoamiAPI(nil)},

		// Config validation.
		{Name: "config wrong type", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"api":5,"currentTeam":7}`}},
		{Name: "config nested wrong type", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"updates":{"auto":"yes"}}`}},
		{Name: "config not an object", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `[]`}},
		{Name: "auth wrong type", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": `{"token":5}`}},
		{Name: "config unknown keys survive", Args: []string{"whoami", "--scope", "acme"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"custom":{"b":1,"a":2},"currentTeam":"team_default"}`}, API: whoamiAPI(nil)},
		{Name: "api from config", Args: []string{"whoami"}, Files: map[string]string{"cfg/auth.json": authSaved, "cfg/config.json": `{"api":"not a url"}`}},
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) { compare(t, c) })
	}
}

func TestRoot(t *testing.T) {
	for _, args := range [][]string{{"--version"}, {"-v"}, {"login", "--help"}, {"help", "login"}, {"-d", "whoami", "--help"}} {
		c := Case{Name: args[0], Args: args}
		if slices.Contains(args, "--help") || args[0] == "help" {
			command := "" // the command whose help is shown
			for _, a := range args {
				if a != "help" && !strings.HasPrefix(a, "-") {
					command = a
				}
			}
			c.Differs = []Difference{InputCheckedFirst, HelpAdds("vercel_" + command)}
		}
		t.Run(sanitize(joinArgs(args)), func(t *testing.T) { compare(t, c) })
	}
}

func joinArgs(a []string) string {
	s := ""
	for _, x := range a {
		s += x + " "
	}
	return s
}
