package auth

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/oauth"
)

var now = time.Unix(1_800_000_000, 0)

// newSession returns a session over a temporary global directory and a
// mock token endpoint answering tokenStatus/tokenBody. The OS keyring is
// reported unavailable, so it is never touched.
func newSession(t *testing.T, creds string, tokenStatus int, tokenBody string) (*Session, *int32) {
	t.Helper()
	var refreshes int32
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			fmt.Fprintf(w, `{"issuer":"%[1]s/","device_authorization_endpoint":"%[1]s/device","token_endpoint":"%[1]s/token","revocation_endpoint":"%[1]s/revoke","jwks_uri":"%[1]s/jwks","introspection_endpoint":"%[1]s/introspect"}`, srv.URL)
		case "/token":
			atomic.AddInt32(&refreshes, 1)
			w.WriteHeader(tokenStatus)
			fmt.Fprint(w, tokenBody)
		}
	}))
	t.Cleanup(srv.Close)
	server := oauth.New(srv.Client(), "test")
	server.Issuer = srv.URL + "/"

	dir := t.TempDir()
	global := config.DefaultGlobal()
	lookup := func(k string) (string, bool) {
		if k == "VERCEL_TEST_KEYRING_UNAVAILABLE" {
			return "1", true
		}
		return "", false
	}
	store, err := Open(dir, global, lookup)
	if err != nil {
		t.Fatal(err)
	}
	c := &config.Object{}
	if err := c.UnmarshalJSON([]byte(creds)); err != nil {
		t.Fatal(err)
	}
	if err := config.WriteAuth(store.Path, c); err != nil {
		t.Fatal(err)
	}
	ios, _, _ := iostreams.Test()
	return &Session{Creds: c, UI: ios.UI, Store: store, OAuth: server, GlobalDir: dir, Global: global, Now: func() time.Time { return now }}, &refreshes
}

func readAuth(t *testing.T, s *Session) *config.Object {
	t.Helper()
	o, err := config.ReadAuth(s.Store.Path)
	if err != nil {
		t.Fatal(err)
	}
	return o
}

func TestValidTokenIsNotRefreshed(t *testing.T) {
	s, refreshes := newSession(t, fmt.Sprintf(`{"token":"tok","expiresAt":%d}`, now.Unix()+60), 500, "")
	if err := s.Authorize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if *refreshes != 0 || s.Token() != "tok" {
		t.Errorf("refreshes %d token %q", *refreshes, s.Token())
	}
}

func TestExpiredTokenIsRefreshedAndSaved(t *testing.T) {
	s, refreshes := newSession(t, fmt.Sprintf(`{"token":"old","refreshToken":"rt","expiresAt":%d}`, now.Unix()-1), 200,
		`{"access_token":"new","token_type":"Bearer","expires_in":3600,"refresh_token":"rt2"}`)
	if err := s.Authorize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if *refreshes != 1 || s.Token() != "new" {
		t.Fatalf("refreshes %d token %q", *refreshes, s.Token())
	}
	saved := readAuth(t, s)
	token, _ := saved.String("token")
	refresh, _ := saved.String("refreshToken")
	expires, _ := saved.Number("expiresAt")
	if token != "new" || refresh != "rt2" || int64(expires) != now.Unix()+3600 {
		t.Errorf("auth.json token %q refresh %q expiresAt %v", token, refresh, expires)
	}
	if _, err := os.Stat(filepath.Join(s.GlobalDir, "config.json")); err != nil {
		t.Errorf("config.json not written after refresh: %v", err)
	}
	// The next request uses the new token without refreshing again.
	if err := s.Authorize(context.Background()); err != nil || *refreshes != 1 {
		t.Errorf("second Authorize: %v, refreshes %d", err, *refreshes)
	}
}

func TestExpiredTokenWithoutRefreshTokenEmptiesTheLogin(t *testing.T) {
	s, refreshes := newSession(t, fmt.Sprintf(`{"token":"old","expiresAt":%d}`, now.Unix()-1), 500, "")
	if err := s.Authorize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if *refreshes != 0 || s.Token() != "" {
		t.Errorf("refreshes %d token %q", *refreshes, s.Token())
	}
	if _, err := os.Stat(s.Store.Path); !os.IsNotExist(err) {
		t.Error("auth.json kept for an emptied login")
	}
}

func TestFailedRefreshEmptiesTheLogin(t *testing.T) {
	s, refreshes := newSession(t, fmt.Sprintf(`{"token":"old","refreshToken":"rt","expiresAt":%d}`, now.Unix()-1), 400,
		`{"error":"invalid_grant"}`)
	if err := s.Authorize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if *refreshes != 1 || s.Token() != "" {
		t.Errorf("refreshes %d token %q", *refreshes, s.Token())
	}
}

func TestExplicitTokensAreNeverSaved(t *testing.T) {
	s, _ := newSession(t, `{"token":"stored"}`, 500, "")
	s.Source = FromFlag
	s.Creds = &config.Object{}
	s.Creds.Set("token", "flag-token")
	if err := s.Authorize(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := s.Persist(); err != nil {
		t.Fatal(err)
	}
	if token, _ := readAuth(t, s).String("token"); token != "stored" {
		t.Errorf("auth.json token %q; an explicit token was written", token)
	}
}
