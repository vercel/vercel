package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
)

// User keeps every field in Raw, so output can tell absent, null and ""
// apart, as upstream does.
type User struct {
	ID            string   `json:"id"`
	Email         string   `json:"email"`
	Username      string   `json:"username"`
	DefaultTeamID string   `json:"defaultTeamId"`
	Billing       *Billing `json:"billing"`

	Raw map[string]json.RawMessage `json:"-"`
}

type Team struct {
	ID      string          `json:"id"`
	Slug    string          `json:"slug"`
	Name    json.RawMessage `json:"name"`
	Billing *Billing        `json:"billing"`

	Raw map[string]json.RawMessage `json:"-"`
}

// Billing.Plan is raw because null and "" print differently upstream.
type Billing struct {
	Plan json.RawMessage `json:"plan"`
}

// PlanOrNull is billing?.plan ?? null.
func (b *Billing) PlanOrNull() json.RawMessage {
	if b == nil || len(b.Plan) == 0 {
		return json.RawMessage("null")
	}
	return b.Plan
}

// RawString is "" for anything but a JSON string.
func RawString(raw json.RawMessage) string {
	var s string
	_ = json.Unmarshal(raw, &s)
	return s
}

func (u *User) UnmarshalJSON(data []byte) error {
	type plain User
	return unmarshalWithRaw(data, (*plain)(u), &u.Raw)
}

func (t *Team) UnmarshalJSON(data []byte) error {
	type plain Team
	return unmarshalWithRaw(data, (*plain)(t), &t.Raw)
}

func unmarshalWithRaw(data []byte, v any, raw *map[string]json.RawMessage) error {
	if err := json.Unmarshal(data, v); err != nil {
		return err
	}
	return json.Unmarshal(data, raw)
}

func (t *Team) NameString() string { return RawString(t.Name) }

// Project keeps every field in Raw, as User.
type Project struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	AccountID string `json:"accountId"`

	Raw map[string]json.RawMessage `json:"-"`
}

func (p *Project) UnmarshalJSON(data []byte) error {
	type plain Project
	return unmarshalWithRaw(data, (*plain)(p), &p.Raw)
}

// IsNotFound is a 404 from the API.
func IsNotFound(err error) bool {
	var apiErr *Error
	return errors.As(err, &apiErr) && apiErr.Status == 404
}

var ErrMissingUser = errors.New("missing user")

func (c *Client) GetAuthUser(ctx context.Context) (*User, error) {
	var res struct {
		User *User `json:"user"`
	}
	if err := c.Do(ctx, Request{Path: "/v2/user", NoTeam: true}, &res); err != nil {
		return nil, err
	}
	if res.User == nil {
		return nil, ErrMissingUser
	}
	return res.User, nil
}

// GetTeam is the legacy endpoint today's CLI calls. team is sent as
// ?teamId= ("" sends none). Teams are cached.
func (c *Client) GetTeam(ctx context.Context, idOrSlug, team string) (*Team, error) {
	if t, ok := c.teamCache[idOrSlug]; ok {
		return t, nil
	}
	var t Team
	if err := c.Do(ctx, Request{Path: "/teams/" + url.PathEscape(idOrSlug), Team: team, NoTeam: team == ""}, &t); err != nil {
		return nil, err
	}
	c.teamCache[t.ID], c.teamCache[t.Slug] = &t, &t
	return &t, nil
}

// GetTeams is the legacy endpoint today's CLI calls.
func (c *Client) GetTeams(ctx context.Context) ([]*Team, error) {
	var res struct {
		Teams []*Team `json:"teams"`
	}
	if err := c.Do(ctx, Request{Path: "/v1/teams", NoTeam: true}, &res); err != nil {
		return nil, err
	}
	for _, t := range res.Teams {
		c.teamCache[t.ID] = t
	}
	return res.Teams, nil
}

// Page.Next is 0 on the last page; Raw is the API's pagination object.
type Page struct {
	Next int64
	Raw  json.RawMessage
}

// ListTeams is getTeams; next is 0 for the first page.
func (c *Client) ListTeams(ctx context.Context, limit int, next int64) ([]*Team, Page, error) {
	q := url.Values{"limit": {strconv.Itoa(limit)}}
	if next != 0 {
		q.Set("next", strconv.FormatInt(next, 10))
	}
	var res struct {
		Teams      []*Team         `json:"teams"`
		Pagination json.RawMessage `json:"pagination"`
	}
	if err := c.Do(ctx, Request{Path: "/v2/teams?" + q.Encode(), NoTeam: true}, &res); err != nil {
		return nil, Page{}, err
	}
	var p struct{ Next *int64 }
	page := Page{Raw: res.Pagination}
	if json.Unmarshal(res.Pagination, &p) == nil && p.Next != nil {
		page.Next = *p.Next
	}
	return res.Teams, page, nil
}

// CachedTeamSlug makes no request; "" when not loaded.
func (c *Client) CachedTeamSlug(idOrSlug string) string {
	if t, ok := c.teamCache[idOrSlug]; ok {
		return t.Slug
	}
	return ""
}

// GetProject is getProjectByNameOrId's request, in the team accountID
// ("" for the client's team).
func (c *Client) GetProject(ctx context.Context, idOrName, accountID string) (*Project, error) {
	var p Project
	r := ForAccount(Request{Path: "/v9/projects/" + url.PathEscape(idOrName)}, accountID)
	if err := c.Do(ctx, r, &p); err != nil {
		return nil, err
	}
	return &p, nil
}
