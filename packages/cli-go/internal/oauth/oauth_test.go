package oauth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// mockServer serves discovery plus fixed responses by "METHOD /path".
func mockServer(t *testing.T, issuer string, routes map[string]struct {
	status int
	body   string
}) *Server {
	t.Helper()
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/.well-known/openid-configuration" {
			iss := issuer
			if iss == "" {
				iss = srv.URL + "/"
			}
			fmt.Fprintf(w, `{"issuer":%q,"device_authorization_endpoint":"%[2]s/device","token_endpoint":"%[2]s/token","revocation_endpoint":"%[2]s/revoke","jwks_uri":"%[2]s/jwks","introspection_endpoint":"%[2]s/introspect"}`, iss, srv.URL)
			return
		}
		route, ok := routes[r.Method+" "+r.URL.Path]
		if !ok {
			http.NotFound(w, r)
			return
		}
		if route.status != 0 {
			w.WriteHeader(route.status)
		}
		fmt.Fprint(w, route.body)
	}))
	t.Cleanup(srv.Close)
	s := New(srv.Client(), "test-agent")
	s.Issuer = srv.URL + "/"
	return s
}

type routes = map[string]struct {
	status int
	body   string
}

func TestStartDeviceValidatesTheResponse(t *testing.T) {
	s := mockServer(t, "", routes{"POST /device": {body: `{"user_code":"UC"}`}})
	if _, err := s.StartDevice(context.Background()); err == nil || err.Error() != "Expected `device_code` to be a string" {
		t.Errorf("err %v", err)
	}
}

func TestPollDeviceUnexpectedErrorBody(t *testing.T) {
	s := mockServer(t, "", routes{"POST /token": {status: 500, body: `{"oops":true}`}})
	_, err := s.PollDevice(context.Background(), "dc")
	var oauthErr *Error
	if !errors.As(err, &oauthErr) || oauthErr.Code != "server_error" || !strings.HasPrefix(oauthErr.Cause, "Unexpected server response: ") {
		t.Errorf("err %#v", err)
	}
}

func TestTokenResponseValidation(t *testing.T) {
	cases := map[string]string{
		`{"token_type":"Bearer","expires_in":1}`:                                       "Expected `access_token` to be a string",
		`{"access_token":"a","token_type":"mac","expires_in":1}`:                       "Expected `token_type` to be \"Bearer\"",
		`{"access_token":"a","token_type":"Bearer"}`:                                   "Expected `expires_in` to be a number",
		`{"access_token":"a","token_type":"Bearer","expires_in":1,"refresh_token":""}`: "Expected `refresh_token` to be a string",
	}
	for body, want := range cases {
		s := mockServer(t, "", routes{"POST /token": {body: body}})
		if _, err := s.Refresh(context.Background(), "old"); err == nil || err.Error() != want {
			t.Errorf("%s: err %v, want %q", body, err, want)
		}
	}
}
