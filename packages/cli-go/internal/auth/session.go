// Package auth is the invocation's login: its source, storage and refresh.
package auth

import (
	"context"
	"fmt"
	"time"

	"github.com/vercel/vercel/packages/cli-go/internal/config"
	"github.com/vercel/vercel/packages/cli-go/internal/iostreams"
	"github.com/vercel/vercel/packages/cli-go/internal/oauth"
)

type Source string

const (
	FromStore Source = ""
	FromFlag  Source = "flag"
	FromEnv   Source = "env"
)

type Session struct {
	Creds     *config.Object // auth.json, in stored order
	Source    Source
	Store     *Store
	OAuth     *oauth.Server
	Global    *config.Object // config.json
	GlobalDir string
	UI        *iostreams.UI
	Now       func() time.Time // for tests

	loggedValid bool
}

// Explicit tokens (--token, VERCEL_TOKEN) are never saved or refreshed.
func (s *Session) Explicit() bool { return s.Source != FromStore }

func (s *Session) Token() string {
	t, _ := s.Creds.String("token")
	return t
}

// Authorize is ensureAuthorized. A failed refresh empties the login, so
// the request is sent without credentials.
func (s *Session) Authorize(ctx context.Context) error {
	if s.valid() {
		if !s.loggedValid {
			s.loggedValid = true
			switch s.Source {
			case FromFlag:
				s.UI.Debug("Using token from `--token` argument, skipping token refresh.")
			case FromEnv:
				s.UI.Debug("Using token from VERCEL_TOKEN environment variable, skipping token refresh.")
			default:
				s.UI.Debug("Valid access token, skipping token refresh.")
			}
		}
		return nil
	}
	refreshToken, ok := s.Creds.String("refreshToken")
	if !ok {
		s.UI.Debug("No refresh token found, emptying auth config.")
		s.Creds = &config.Object{}
		return s.Persist()
	}
	// Not ported: upstream starts a new login when an interactive refresh
	// fails with invalid_grant.
	tokens, err := s.OAuth.Refresh(ctx, refreshToken)
	if err != nil {
		s.UI.Debug("Error refreshing token, emptying auth config.")
		s.Creds = &config.Object{}
		return s.Persist()
	}
	s.Creds.Set("token", tokens.AccessToken)
	s.Creds.Set("expiresAt", s.now().Unix()+tokens.ExpiresIn)
	if tokens.RefreshToken != "" {
		s.Creds.Set("refreshToken", tokens.RefreshToken)
	}
	if err := s.Persist(); err != nil {
		return err
	}
	if err := s.SaveGlobal(); err != nil {
		return err
	}
	s.UI.Debug("Tokens refreshed successfully.")
	return nil
}

// valid is isValidAccessToken.
func (s *Session) valid() bool {
	expiresAt, ok := s.Creds.Number("expiresAt")
	return s.Token() != "" && (!ok || int64(expiresAt) >= s.now().Unix())
}

func (s *Session) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

func (s *Session) Persist() error {
	if s.Explicit() {
		return nil
	}
	if err := s.Store.Persist(s.Creds); err != nil {
		return fmt.Errorf("Not able to create %s (%s).", s.Store.Path, err)
	}
	return nil
}

func (s *Session) SaveGlobal() error {
	return config.WriteGlobal(config.GlobalFile(s.GlobalDir), s.Global)
}
