// Package oauth is util/oauth.ts: discovery, device authorization and
// refresh, with the same validation and errors.
package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const ClientID = "cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp"

type Server struct {
	Issuer    string
	HTTP      *http.Client
	UserAgent string
	Debug     func(string)

	once sync.Once
	meta *metadata
	err  error
}

func New(httpClient *http.Client, cliUserAgent string) *Server {
	host, _ := os.Hostname()
	return &Server{Issuer: "https://vercel.com/", HTTP: httpClient, UserAgent: host + " @ " + cliUserAgent}
}

type metadata struct{ deviceAuthorization, token string }

// DiscoveryError is reported differently from OAuth response errors.
type DiscoveryError struct{ Err error }

func (e *DiscoveryError) Error() string { return e.Err.Error() }
func (e *DiscoveryError) Unwrap() error { return e.Err }

func (s *Server) discover(ctx context.Context) (*metadata, error) {
	s.once.Do(func() {
		var body map[string]any
		status, _, err := s.request(ctx, http.MethodGet, s.Issuer+".well-known/openid-configuration", nil, &body)
		if err != nil {
			s.err = err
			return
		}
		if status < 200 || status >= 300 {
			s.err = errors.New("Discovery endpoint request failed")
			return
		}
		fields := []string{"issuer", "device_authorization_endpoint", "token_endpoint", "revocation_endpoint", "jwks_uri", "introspection_endpoint"}
		for _, f := range fields {
			if !isURL(body[f]) {
				s.err = errors.New("Invalid discovery response")
				return
			}
		}
		if issuer, _ := url.Parse(body["issuer"].(string)); issuer.String() != s.Issuer && issuer.String()+"/" != s.Issuer {
			s.err = errors.New("Issuer mismatch")
			return
		}
		s.meta = &metadata{deviceAuthorization: body["device_authorization_endpoint"].(string), token: body["token_endpoint"].(string)}
	})
	if s.err != nil {
		return nil, &DiscoveryError{s.err}
	}
	return s.meta, nil
}

type DeviceAuthorization struct {
	DeviceCode              string
	UserCode                string
	VerificationURI         string
	VerificationURIComplete string
	ExpiresAt               time.Time
	Interval                time.Duration
}

func (s *Server) StartDevice(ctx context.Context) (*DeviceAuthorization, error) {
	meta, err := s.discover(ctx)
	if err != nil {
		return nil, err
	}
	form := url.Values{"client_id": {ClientID}, "scope": {"openid offline_access"}}
	var body map[string]any
	status, raw, err := s.request(ctx, http.MethodPost, meta.deviceAuthorization, form, &body)
	if err != nil {
		return nil, err
	}
	s.debug("'Device Authorization response:', " + raw)
	if status < 200 || status >= 300 {
		return nil, newError("Device authorization request failed", body)
	}
	for _, f := range []struct {
		name string
		ok   func(any) bool
		want string
	}{
		{"device_code", isString, "a string"},
		{"user_code", isString, "a string"},
		{"verification_uri", isURL, "a string"},
		{"verification_uri_complete", isURL, "a string"},
		{"expires_in", isNumber, "a number"},
		{"interval", isNumber, "a number"},
	} {
		if !f.ok(body[f.name]) {
			return nil, fmt.Errorf("Expected `%s` to be %s", f.name, f.want)
		}
	}
	seconds := func(k string) time.Duration { return time.Duration(body[k].(float64) * float64(time.Second)) }
	return &DeviceAuthorization{
		DeviceCode:              body["device_code"].(string),
		UserCode:                body["user_code"].(string),
		VerificationURI:         body["verification_uri"].(string),
		VerificationURIComplete: body["verification_uri_complete"].(string),
		ExpiresAt:               time.Now().Add(seconds("expires_in")),
		Interval:                seconds("interval"),
	}, nil
}

type Tokens struct {
	AccessToken  string
	ExpiresIn    int64
	RefreshToken string
}

// PollDevice times out after 10s, as upstream; the error mentions
// "timeout".
func (s *Server) PollDevice(ctx context.Context, deviceCode string) (*Tokens, error) {
	meta, err := s.discover(ctx)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	form := url.Values{"client_id": {ClientID}, "grant_type": {"urn:ietf:params:oauth:grant-type:device_code"}, "device_code": {deviceCode}}
	return s.tokenRequest(ctx, meta.token, form, "Device access token request failed", "'Device Access Token response:', ")
}

func (s *Server) Refresh(ctx context.Context, refreshToken string) (*Tokens, error) {
	meta, err := s.discover(ctx)
	if err != nil {
		return nil, err
	}
	form := url.Values{"client_id": {ClientID}, "grant_type": {"refresh_token"}, "refresh_token": {refreshToken}}
	return s.tokenRequest(ctx, meta.token, form, "Device access token request failed", "")
}

func (s *Server) tokenRequest(ctx context.Context, endpoint string, form url.Values, failure, debugPrefix string) (*Tokens, error) {
	var body map[string]any
	status, raw, err := s.request(ctx, http.MethodPost, endpoint, form, &body)
	if err != nil {
		return nil, err
	}
	if debugPrefix != "" {
		s.debug(debugPrefix + raw)
	}
	if status < 200 || status >= 300 {
		return nil, newError(failure, body)
	}
	access, ok := body["access_token"].(string)
	if !ok {
		return nil, errors.New("Expected `access_token` to be a string")
	}
	if body["token_type"] != "Bearer" {
		return nil, errors.New("Expected `token_type` to be \"Bearer\"")
	}
	expiresIn, ok := body["expires_in"].(float64)
	if !ok {
		return nil, errors.New("Expected `expires_in` to be a number")
	}
	t := &Tokens{AccessToken: access, ExpiresIn: int64(expiresIn)}
	if raw, present := body["refresh_token"]; present {
		if t.RefreshToken, ok = raw.(string); !ok || t.RefreshToken == "" {
			return nil, errors.New("Expected `refresh_token` to be a string")
		}
	}
	if raw, present := body["scope"]; present {
		if _, ok := raw.(string); !ok {
			return nil, errors.New("Expected `scope` to be a string")
		}
	}
	return t, nil
}

func (s *Server) request(ctx context.Context, method, endpoint string, form url.Values, out any) (int, string, error) {
	body, contentType := io.Reader(nil), "application/json"
	if form != nil {
		body, contentType = strings.NewReader(form.Encode()), "application/x-www-form-urlencoded"
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("user-agent", s.UserAgent)
	res, err := s.HTTP.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return 0, "", fmt.Errorf("The operation was aborted due to timeout")
		}
		return 0, "", err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return 0, "", err
	}
	if err := json.Unmarshal(data, out); err != nil {
		return 0, "", err
	}
	return res.StatusCode, string(data), nil
}

func (s *Server) debug(msg string) {
	if s.Debug != nil {
		s.Debug(msg)
	}
}

type Error struct {
	Message string
	Code    string
	Cause   string // "<code>: <description> (<uri>)"
}

func (e *Error) Error() string { return e.Message }

func newError(message string, body map[string]any) *Error {
	code, ok := body["error"].(string)
	desc, descOK := body["error_description"]
	uri, uriOK := body["error_uri"]
	_, descStr := desc.(string)
	_, uriStr := uri.(string)
	if !ok || (descOK && !descStr) || (uriOK && !uriStr) {
		raw, _ := json.Marshal(body)
		msg := "Unexpected server response: " + string(raw)
		return &Error{Message: msg, Code: "server_error", Cause: msg}
	}
	cause := code
	if d, _ := desc.(string); d != "" {
		cause += ": " + d
	}
	if u, _ := uri.(string); u != "" {
		cause += " (" + u + ")"
	}
	return &Error{Message: message, Code: code, Cause: cause}
}

func isString(v any) bool { _, ok := v.(string); return ok }
func isNumber(v any) bool { _, ok := v.(float64); return ok }

func isURL(v any) bool {
	s, ok := v.(string)
	if !ok {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && u.Scheme != "" && (u.Host != "" || u.Opaque != "")
}
