package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

type staticSession struct{}

func (staticSession) Authorize(context.Context) error { return nil }
func (staticSession) Token() string                   { return "tok" }

// Each call sends today's method, path and team, and teams are cached.
func TestCalls(t *testing.T) {
	var got []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.Method+" "+r.URL.RequestURI()+" "+r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v2/user":
			w.Write([]byte(`{"user":{"id":"u"}}`))
		case "/v1/teams", "/v2/teams":
			w.Write([]byte(`{"teams":[],"pagination":{"next":7}}`))
		default:
			w.Write([]byte(`{"id":"team_1","slug":"acme"}`))
		}
	}))
	defer srv.Close()
	ios, _, _ := iostreams.Test()
	c := New(srv.URL, staticSession{}, srv.Client(), ios.UI)
	c.SetTeam("team_saved")
	ctx := context.Background()
	if _, err := c.GetAuthUser(ctx); err != nil {
		t.Fatal(err)
	}
	for _, team := range []string{"", "team_1"} {
		if _, err := c.GetTeam(ctx, "acme", team); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := c.GetTeams(ctx); err != nil {
		t.Fatal(err)
	}
	if _, page, err := c.ListTeams(ctx, 20, 5); err != nil || page.Next != 7 {
		t.Fatalf("page %+v err %v", page, err)
	}
	for _, account := range []string{"", "team_1"} {
		if _, err := c.GetProject(ctx, "web", account); err != nil {
			t.Fatal(err)
		}
	}
	want := []string{
		"GET /v2/user Bearer tok",
		"GET /teams/acme Bearer tok", // the second GetTeam is cached
		"GET /v1/teams Bearer tok",
		"GET /v2/teams?limit=20&next=5 Bearer tok",
		"GET /v9/projects/web?teamId=team_saved Bearer tok", // the client's team
		"GET /v9/projects/web?teamId=team_1 Bearer tok",
	}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("requests:\n%s", strings.Join(got, "\n"))
	}
	if c.CachedTeamSlug("team_1") != "acme" {
		t.Error("team not cached by ID")
	}
}

// A request that does not say which team it sends panics instead of
// sending the client's team.
func TestRequestMustChooseItsTeam(t *testing.T) {
	ios, _, _ := iostreams.Test()
	c := New("https://api.vercel.com", staticSession{}, http.DefaultClient, ios.UI)
	defer func() {
		if r := recover(); r == nil || !strings.Contains(r.(string), "/v1/thing") {
			t.Errorf("recovered %v", r)
		}
	}()
	_, _ = c.url(Request{Path: "/v1/thing"})
}

// A team-scoped request without a team fails before it is sent: it never
// falls back to the user.
func TestCurrentTeamRequiresATeam(t *testing.T) {
	ios, _, _ := iostreams.Test()
	c := New("http://127.0.0.1:0", staticSession{}, http.DefaultClient, ios.UI)
	if _, err := c.GetProject(context.Background(), "web", ""); err != ErrNoTeam {
		t.Errorf("err %v", err)
	}
}
