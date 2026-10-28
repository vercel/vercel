// Package loginflow is the OAuth device login. Startup runs it for needs
// that log in first and for `vercel login` (Input.Login), so startup
// imports no command.
package loginflow

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/api"
	"github.com/vercel/vercel/packages/cli-go/internal/auth"
	"github.com/vercel/vercel/packages/cli-go/internal/cli"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/oauth"
)

// Flow is what a login needs.
type Flow struct {
	UI          *iostreams.UI
	Mode        cli.Mode
	OAuth       *oauth.Server
	OpenBrowser func(url string) error
	Session     *auth.Session
	Client      *api.Client
	User        func(context.Context) (*api.User, error)
}

// Run is login without the receipt.
func (f *Flow) Run(ctx context.Context) error {
	tokens, err := f.deviceFlow(ctx)
	if errors.Is(err, context.Canceled) {
		return cli.Silent(0) // Ctrl-C ends the login quietly, as upstream
	}
	if err != nil {
		return err
	}
	return f.save(ctx, tokens)
}

// deviceFlow is performDeviceCodeFlow.
func (f *Flow) deviceFlow(ctx context.Context) (*oauth.Tokens, error) {
	ui, cs := f.UI, f.UI.ColorScheme()
	device, err := f.OAuth.StartDevice(ctx)
	var discovery *oauth.DiscoveryError
	if errors.As(err, &discovery) {
		return nil, discovery.Err // upstream does not catch these either
	}
	if err != nil {
		return nil, loginError(err)
	}

	visit := ui.Link(strings.Replace(device.VerificationURI, "https://", "", 1), device.VerificationURIComplete,
		func() string { return device.VerificationURIComplete }, false)
	code := ""
	if ui.SupportsHyperlink() {
		code = " and enter " + cs.Bold(device.UserCode)
	}
	ui.Log("\n  Visit " + cs.Bold(visit) + code + "\n")

	if !f.Mode.CI || f.Mode.AgentName == "cursor" || f.Mode.AgentName == "cursor-cli" {
		if err := f.OpenBrowser(device.VerificationURIComplete); err != nil {
			ui.Debug(fmt.Sprintf("Failed to open browser: %s", err))
		}
	}

	ui.StartSpinner("Waiting for authentication...")
	defer ui.StopSpinner()
	for interval := device.Interval; time.Now().Before(device.ExpiresAt); {
		tokens, err := f.OAuth.PollDevice(ctx, device.DeviceCode)
		var oauthErr *oauth.Error
		switch {
		case err == nil:
			ui.EraseLines(2)
			return tokens, nil
		case ctx.Err() != nil:
			return nil, ctx.Err()
		case errors.As(err, &oauthErr) && oauthErr.Code == "authorization_pending":
		case errors.As(err, &oauthErr) && oauthErr.Code == "slow_down":
			interval += 5 * time.Second
			ui.Debug(fmt.Sprintf("Authorization server requests to slow down. Polling every %gs...", interval.Seconds()))
		case strings.Contains(err.Error(), "timeout"):
			interval *= 2
			ui.Debug(fmt.Sprintf("Connection timeout. Slowing down, polling every %gs...", interval.Seconds()))
		default:
			return nil, loginError(err)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(interval):
		}
	}
	// Upstream's "Timed out" message is unreachable: its polling loop
	// returns no error when the code expires, so it exits 1 silently.
	return nil, cli.Silent(1)
}

// loginError prints like printError(OAuthError ? cause : error).
func loginError(err error) error {
	var oauthErr *oauth.Error
	if errors.As(err, &oauthErr) {
		return &cli.Error{Message: oauthErr.Cause}
	}
	return &cli.Error{Message: err.Error()}
}

// save is saveDeviceCodeTokens: it keeps the saved team while accessible.
func (f *Flow) save(ctx context.Context, tokens *oauth.Tokens) error {
	s := f.Session
	s.Creds.Set("token", tokens.AccessToken)
	s.Creds.Delete("userId")
	s.Creds.Set("expiresAt", time.Now().Unix()+tokens.ExpiresIn)
	if tokens.RefreshToken != "" {
		s.Creds.Set("refreshToken", tokens.RefreshToken)
	} else {
		s.Creds.Delete("refreshToken")
	}

	keep := false
	if previous, _ := s.Global.String("currentTeam"); previous != "" {
		// A failed lookup keeps the team.
		teams, err := f.Client.GetTeams(ctx)
		keep = err != nil || slices.ContainsFunc(teams, func(t *api.Team) bool { return t.ID == previous })
		if !keep {
			f.UI.Warn("Your previously selected team is no longer accessible; switching to your default scope.")
		}
	}
	if !keep {
		s.Global.Delete("currentTeam")
		user, err := f.User(ctx)
		switch {
		case err != nil:
			f.UI.Error("Failed to fetch the logged in user. Please try again.", "", "")
		case user.DefaultTeamID != "":
			s.Global.Set("currentTeam", user.DefaultTeamID)
		}
	}
	if err := s.Persist(); err != nil {
		return err
	}
	if err := s.SaveGlobal(); err != nil {
		return err
	}
	f.UI.Debug(fmt.Sprintf("Saved credentials in %q", s.GlobalDir))
	return nil
}
