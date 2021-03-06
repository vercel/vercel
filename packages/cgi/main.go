package main

import (
	now "../../utils/go/bridge"
	"net/http"
	"net/http/cgi"
	"os"
	"path/filepath"
)

type CgiHandler struct {
	http.Handler
	Dir    string
	Script string
}

func (h *CgiHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	handler := cgi.Handler{
		Path: h.Script,
		Root: "/" + h.Script,
		Dir:  h.Dir,
		Env: []string{
			"HTTPS=on",
			"SERVER_PORT=443",
			"SERVER_SOFTWARE=@now/cgi",
		},
	}
	handler.ServeHTTP(w, r)
}

func main() {
	workdir, _ := filepath.Abs(".")
	script := os.Getenv("SCRIPT_FILENAME")
	handler := &CgiHandler{nil, workdir, script}
	now.Start(handler)
}
