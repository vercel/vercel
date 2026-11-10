package vercelcmd

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// harness runs the CLI in-process against a mock API, which also serves
// the authorization server. Command behavior is compared with the
// TypeScript CLI in e2e; these tests cover what e2e cannot observe.
type harness struct {
	t        *testing.T
	dir      string
	api      *httptest.Server
	routes   map[string]string // "METHOD /path" -> JSON (status 200)
	statuses map[string]int
	mu       sync.Mutex
	requests []string
	stdout   *bytes.Buffer
	stderr   *bytes.Buffer
	ios      *iostreams.IOStreams
	env      map[string]string
	ctx      context.Context
}

func newHarness(t *testing.T) *harness {
	h := &harness{t: t, dir: t.TempDir(), routes: map[string]string{}, statuses: map[string]int{}, env: map[string]string{}, ctx: context.Background()}
	h.api = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.Method + " " + r.URL.Path
		h.mu.Lock()
		h.requests = append(h.requests, key)
		body, ok := h.routes[key]
		status := h.statuses[key]
		h.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if !ok {
			w.WriteHeader(404)
			fmt.Fprint(w, `{"error":{"code":"not_found","message":"Not found"}}`)
			return
		}
		if status == 0 {
			status = 200
		}
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(h.api.Close)
	for _, d := range []string{"cfg", "work"} {
		if err := os.MkdirAll(filepath.Join(h.dir, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	h.env["VERCEL_TEST_KEYRING_UNAVAILABLE"] = "1"
	h.env["HOME"] = h.dir
	h.ios, h.stdout, h.stderr = iostreams.Test()
	return h
}

func (h *harness) write(name, content string) {
	path := filepath.Join(h.dir, name)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		h.t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) run(args ...string) int {
	h.stdout.Reset()
	h.stderr.Reset()
	return Run(h.ctx, Env{
		IO:          h.ios,
		Args:        append([]string{"--api", h.api.URL, "-Q", filepath.Join(h.dir, "cfg")}, args...),
		Cwd:         filepath.Join(h.dir, "work"),
		LookupEnv:   func(k string) (string, bool) { v, ok := h.env[k]; return v, ok },
		HTTP:        h.api.Client(),
		OpenBrowser: func(string) error { return nil },
		Issuer:      h.api.URL + "/",
	})
}

const (
	user     = `{"user":{"id":"user_1","email":"me@example.com","username":"melkey","name":"Mel","defaultTeamId":"team_acme"}}`
	acme     = `{"id":"team_acme","slug":"acme","name":"Acme"}`
	loggedIn = `{"token":"tok","userId":"user_1"}`
)

func (h *harness) oauth(token string) {
	base := h.api.URL
	h.routes["GET /.well-known/openid-configuration"] = fmt.Sprintf(`{"issuer":%q,"device_authorization_endpoint":"%s/device","token_endpoint":"%s/token","revocation_endpoint":"%s/revoke","jwks_uri":"%s/jwks","introspection_endpoint":"%s/introspect"}`, base+"/", base, base, base, base, base)
	h.routes["POST /device"] = `{"device_code":"dc","user_code":"UC","verification_uri":"https://vercel.com/device","verification_uri_complete":"https://vercel.com/device?user_code=UC","expires_in":600,"interval":0}`
	h.routes["POST /token"] = token
}

const tokens = `{"access_token":"at","token_type":"Bearer","expires_in":3600,"refresh_token":"rt"}`

// Ctrl-C during login ends it quietly, with exit 0, as upstream.
func TestLoginCanceledEndsQuietly(t *testing.T) {
	h := newHarness(t)
	h.oauth(tokens)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	h.ctx = ctx
	if code := h.run("login"); code != 0 || strings.Contains(h.stderr.String(), "Error") {
		t.Errorf("exit %d: %s", code, h.stderr)
	}
}
