// Package api is the Vercel REST client. HTTP policy (team, headers, token
// refresh, retries, errors, debug lines) lives here and only here.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"regexp"
	"runtime"
	"strings"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/build"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
)

// Session.Authorize runs before every request and refreshes an expired
// token.
type Session interface {
	Authorize(ctx context.Context) error
	Token() string
}

type Client struct {
	BaseURL      string
	Session      Session
	HTTP         *http.Client
	UI           *iostreams.UI
	AgentName    string
	SessionID    string
	InvocationID string

	team      string // sent as ?teamId= unless a request says otherwise
	requestID int
	teamCache map[string]*Team // by ID and slug
}

func (c *Client) SetTeam(id string) { c.team = id }

func (c *Client) Team() string { return c.team }

func New(baseURL string, session Session, httpClient *http.Client, ui *iostreams.UI) *Client {
	return &Client{BaseURL: baseURL, Session: session, HTTP: httpClient, UI: ui, teamCache: map[string]*Team{}, requestID: 1}
}

// UserAgent is upstream's, with Go as the runtime.
func UserAgent() string {
	return fmt.Sprintf("vercel %s go-%s %s (%s)", build.Version, runtime.Version(), runtime.GOOS, runtime.GOARCH)
}

type Request struct {
	Method string // GET when empty
	Path   string // may include a query
	Body   any    // sent as JSON
	// Every request says which team it sends as ?teamId=: Team, the
	// client's team (CurrentTeam), or none (NoTeam). Do panics when a
	// request says none of them, so no call scopes itself by accident.
	Team        string
	CurrentTeam bool
	NoTeam      bool
}

// ForAccount is upstream's fetch accountId: the team, or "" for the
// client's team. There is no personal account, so it is always a team.
func ForAccount(r Request, accountID string) Request {
	if accountID == "" {
		r.CurrentTeam = true
	} else {
		r.Team = accountID
	}
	return r
}

// ErrNoTeam: a team-scoped request with no team. Needs resolve one before
// such requests, so this means a command skipped its need.
var ErrNoTeam = errors.New("no team selected for a team-scoped request")

var domainsPath = regexp.MustCompile(`^/v\d+/(domains|registrar)(/|$)`)

// Do retries network errors and 5xx three times with backoff, waits for
// Retry-After on 429 and 503, and returns other 4xx at once.
func (c *Client) Do(ctx context.Context, r Request, out any) error {
	if r.CurrentTeam && c.team == "" {
		return ErrNoTeam
	}
	const retries = 3
	var lastErr error
	for attempt := 0; attempt <= retries; attempt++ {
		if attempt > 0 {
			// async-retry: factor 2, minTimeout 1s, randomized by [1, 2).
			delay := time.Duration(float64(time.Second) * float64(int(1)<<(attempt-1)) * (1 + rand.Float64()))
			if err := sleep(ctx, delay); err != nil {
				return err
			}
		}
		res, err := c.send(ctx, r)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			lastErr = err
			continue
		}
		c.printIndications(res)
		if res.StatusCode >= 200 && res.StatusCode < 300 {
			return decode(res, out)
		}
		apiErr := responseError(res)
		lastErr = apiErr
		switch {
		case apiErr.RetryAfterMs != nil:
			if attempt == retries {
				return apiErr
			}
			skew := time.Duration(rand.Float64() * float64(30*time.Second))
			if err := sleep(ctx, time.Duration(*apiErr.RetryAfterMs)*time.Millisecond+skew); err != nil {
				return err
			}
		case res.StatusCode >= 400 && res.StatusCode < 500:
			return apiErr
		}
	}
	return lastErr
}

func (c *Client) send(ctx context.Context, r Request) (*http.Response, error) {
	u, err := c.url(r)
	if err != nil {
		return nil, err
	}
	var body io.Reader
	header := http.Header{}
	if r.Body != nil {
		data, err := json.Marshal(r.Body)
		if err != nil {
			return nil, err
		}
		body = bytes.NewReader(data)
		header.Set("content-type", "application/json; charset=utf-8")
	}
	header.Set("user-agent", UserAgent())
	if domainsPath.MatchString(u.Path) {
		header.Set("x-vercel-cli-version", build.Version)
	}
	if c.AgentName != "" {
		header.Set("x-ai-agent", c.AgentName)
	}
	header.Set("x-vercel-cli-session-id", c.SessionID)
	header.Set("x-vercel-cli-invocation-id", c.InvocationID)
	if err := c.Session.Authorize(ctx); err != nil {
		return nil, err
	}
	if token := c.Session.Token(); token != "" {
		header.Set("authorization", "Bearer "+token)
	}
	method := r.Method
	if method == "" {
		method = http.MethodGet
	}
	req, err := http.NewRequestWithContext(ctx, method, u.String(), body)
	if err != nil {
		return nil, err
	}
	req.Header = header

	id := c.requestID
	c.requestID++
	c.UI.Debug(fmt.Sprintf("#%d → %s %s", id, method, u.String()))
	start := time.Now()
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	vercelID := "null" // Headers.get returns null for a missing header
	if v := res.Header.Values("x-vercel-id"); len(v) > 0 {
		vercelID = strings.Join(v, ", ")
	}
	c.UI.Debug(fmt.Sprintf("#%d ← %d %s: %s %s", id, res.StatusCode, http.StatusText(res.StatusCode),
		vercelID, c.UI.ColorScheme().Gray("["+elapsed(time.Since(start))+"]")))
	return res, nil
}

func (c *Client) url(r Request) (*url.URL, error) {
	base, err := url.Parse(c.BaseURL)
	if err != nil {
		return nil, err
	}
	ref, err := url.Parse(r.Path)
	if err != nil {
		return nil, err
	}
	u := base.ResolveReference(ref)
	var team string
	switch {
	case r.NoTeam:
		return u, nil
	case r.Team != "":
		team = r.Team
	case r.CurrentTeam:
		team = c.team
	default:
		panic("api: " + r.Path + " does not say which team it sends: set Team, CurrentTeam or NoTeam")
	}
	q := u.Query()
	if team != "" && !q.Has("teamId") {
		q.Set("teamId", team)
	}
	u.RawQuery = q.Encode()
	return u, nil
}

func decode(res *http.Response, out any) error {
	defer res.Body.Close()
	if out == nil || !strings.Contains(res.Header.Get("content-type"), "application/json") {
		_, _ = io.Copy(io.Discard, res.Body)
		return nil
	}
	return json.NewDecoder(res.Body).Decode(out)
}

var indicationRe = regexp.MustCompile(`^x-(?:vercel|now)-(warning|notice|tip)-(.*)$`)

func (c *Client) printIndications(res *http.Response) {
	cs := c.UI.ColorScheme()
	for name, values := range res.Header {
		m := indicationRe.FindStringSubmatch(strings.ToLower(name))
		if m == nil {
			continue
		}
		message := cs.Dim(values[0])
		if c.UI.IsStdoutTTY() {
			message = iostreams.Emoji[m[1]] + "  " + message
		}
		message += "\n"
		if link := res.Header.Get("x-vercel-link-" + m[2]); link != "" {
			action := res.Header.Get("x-vercel-action-" + m[2])
			if action == "" {
				action = "Learn More"
			}
			message += cs.Dim(action+": "+cs.Cyan(cs.Underline(link))) + "\n"
		}
		c.UI.Print(message)
	}
}

func elapsed(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	return fmt.Sprintf("%.2fs", d.Seconds())
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
