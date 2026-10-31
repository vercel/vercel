//go:build e2e

package e2e

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"
)

// oauthServer is vercel.com (OIDC discovery, device authorization, token)
// and api.vercel.com (user, teams), reached through the HTTPS interceptor.
type oauthServer struct {
	mu        sync.Mutex
	device    string   // device authorization response
	discovery string   // discovery response
	tokens    []string // token responses, in order; the last repeats
	user      string
	teams     string
	polls     int
}

func (s *oauthServer) Reset() { s.mu.Lock(); s.polls = 0; s.mu.Unlock() }

func (s *oauthServer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mu.Lock()
	defer s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	write := func(status int, body string) {
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}
	status := func(body string) int {
		if strings.Contains(body, `"error"`) {
			return 400
		}
		return 200
	}
	switch r.Host + r.URL.Path {
	case "vercel.com/.well-known/openid-configuration":
		write(200, s.discovery)
	case "vercel.com/oauth/device":
		write(status(s.device), s.device)
	case "vercel.com/oauth/token":
		body := s.tokens[min(s.polls, len(s.tokens)-1)]
		s.polls++
		write(status(body), body)
	case "api.vercel.com/v2/user":
		write(200, s.user)
	case "api.vercel.com/v1/teams":
		write(200, s.teams)
	default:
		write(404, `{"error":{"code":"not_found","message":"Not found"}}`)
	}
}

const (
	discoveryOK = `{"issuer":"https://vercel.com","device_authorization_endpoint":"https://vercel.com/oauth/device","token_endpoint":"https://vercel.com/oauth/token","revocation_endpoint":"https://vercel.com/oauth/revoke","jwks_uri":"https://vercel.com/.well-known/jwks","introspection_endpoint":"https://vercel.com/oauth/introspect"}`
	deviceOK    = `{"device_code":"dev_1","user_code":"ABCD-EFGH","verification_uri":"https://vercel.com/device","verification_uri_complete":"https://vercel.com/device?user_code=ABCD-EFGH","expires_in":600,"interval":0}`
	tokenOK     = `{"access_token":"at_new","token_type":"Bearer","expires_in":3600,"refresh_token":"rt_new","scope":"openid offline_access"}`
	pending     = `{"error":"authorization_pending"}`
)

func login(mod func(*oauthServer)) *oauthServer {
	s := &oauthServer{discovery: discoveryOK, device: deviceOK, tokens: []string{tokenOK}, user: personalUser, teams: `{"teams":[` + teamAcme + `]}`}
	if mod != nil {
		mod(s)
	}
	return s
}

func TestLogin(t *testing.T) {
	cases := []Case{
		{Name: "personal account", Args: []string{"login"}, HTTPS: login(nil)},
		{Name: "northstar selects default team", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.user = northstarUser })},
		{Name: "keeps accessible saved team", Args: []string{"login"}, Files: map[string]string{"cfg/config.json": `{"currentTeam":"team_acme"}`}, HTTPS: login(nil)},
		{Name: "replaces inaccessible saved team", Args: []string{"login"}, Files: map[string]string{"cfg/config.json": `{"currentTeam":"team_gone"}`}, HTTPS: login(func(s *oauthServer) { s.user = northstarUser })},
		{Name: "replaces existing login", Args: []string{"login"}, Files: map[string]string{"cfg/auth.json": `{"token":"old","userId":"user_old","refreshToken":"rt_old","expiresAt":1}`}, HTTPS: login(nil)},
		{Name: "no refresh token", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) {
			s.tokens = []string{`{"access_token":"at_new","token_type":"Bearer","expires_in":3600}`}
		})},
		{Name: "pending then approved", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.tokens = []string{pending, pending, tokenOK} })},
		{Name: "slow down", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.tokens = []string{`{"error":"slow_down"}`, tokenOK} })},
		{Name: "access denied", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) {
			s.tokens = []string{`{"error":"access_denied","error_description":"The user denied the request"}`}
		})},
		{Name: "expired code", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.device = strings.Replace(deviceOK, `"expires_in":600`, `"expires_in":0`, 1) })},
		{Name: "device authorization error", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.device = `{"error":"invalid_client","error_description":"Unknown client"}` })},
		{Name: "malformed device response", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.device = `{"device_code":"d"}` })},
		{Name: "malformed token response", Args: []string{"login"}, HTTPS: login(func(s *oauthServer) { s.tokens = []string{`{"access_token":"a","token_type":"mac","expires_in":1}`} })},
		{Name: "issuer mismatch", Args: []string{"login"}, TelemetryLookups: 1, HTTPS: login(func(s *oauthServer) {
			s.discovery = strings.Replace(discoveryOK, `"issuer":"https://vercel.com"`, `"issuer":"https://evil.example"`, 1)
		})},
		{Name: "deprecated flags and arguments", Args: []string{"login", "--github", "--oob", "me@example.com"}, HTTPS: login(nil)},
		{Name: "no browser in CI", Args: []string{"login"}, Env: map[string]string{"CI": "1"}, HTTPS: login(nil)},
		{Name: "cursor opens browser in CI", Args: []string{"login"}, Env: map[string]string{"CI": "1", "CURSOR_AGENT": "1"}, HTTPS: login(nil)},
		{Name: "agent", Args: []string{"login"}, Env: map[string]string{"AI_AGENT": "codex"}, HTTPS: login(nil)},
		{Name: "VERCEL_TOKEN is not saved", Args: []string{"login"}, Env: map[string]string{"VERCEL_TOKEN": "tokenv"}, TelemetryLookups: 1, HTTPS: login(nil)},
		{Name: "token flag is rejected", Args: []string{"login", "--token", "abc"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "unknown flag", Args: []string{"login", "--bogus"}, Differs: []Difference{InputCheckedFirst}},
		{Name: "help", Args: []string{"login", "--help"}, Differs: []Difference{InputCheckedFirst, HelpAdds("vercel_login")}},
		{Name: "agent unknown flag", Args: []string{"login", "--bogus"}, Env: agentEnv, Differs: []Difference{InputCheckedFirst}},
		{Name: "debug", Args: []string{"login", "--debug"}, HTTPS: login(nil)},
		{Name: "terminal", Args: []string{"login"}, HTTPS: login(nil), PTY: true},
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) { compare(t, c) })
	}
}
