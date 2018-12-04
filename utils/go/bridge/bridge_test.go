package bridge

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"testing"
)

type HttpHandler struct {
	http.Handler
	t *testing.T
}

func (h *HttpHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Add("X-Foo", "bar")
	w.WriteHeader(404)
	w.Write([]byte("test"))
}

func TestServe(t *testing.T) {
	h := &HttpHandler{nil, t}
	req := &Request{
		"test.com",
		"/path?foo=bar",
		"POST",
		map[string]string{"Content-Length": "1", "X-Foo": "bar"},
		"",
		"a",
	}
	res, err := Serve(h, req)
	if err != nil {
		t.Fail()
	}
	if res.StatusCode != 404 {
		t.Fail()
	}
	fmt.Printf("status code: %d\n", res.StatusCode)
	fmt.Printf("header: %v\n", res.Headers)
	fmt.Printf("base64 body: %s\n", res.Body)
	body, err := base64.StdEncoding.DecodeString(res.Body)
	fmt.Printf("body: %s\n", body)
}
