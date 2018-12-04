package main

import (
	now "./utils"
	"bytes"
	php "github.com/deuill/go-php"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

type PhpHandler struct {
	http.Handler
	ScriptFull string
}

func (h *PhpHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	engine, _ := php.New()
	context, _ := engine.NewContext()

	var query = r.URL.Query()
	getMap := make(map[string]string)
	for k, v := range query {
		for _, s := range v {
			getMap[k] = s
		}
	}
	context.Bind("_GET", getMap)

	r.ParseForm()
	postMap := make(map[string]string)
	for k, v := range r.PostForm {
		for _, s := range v {
			postMap[k] = s
		}
	}
	context.Bind("_POST", postMap)

	envMap := make(map[string]string)
	for _, e := range os.Environ() {
		pair := strings.Split(e, "=")
		envMap[pair[0]] = pair[1]
	}
	context.Bind("_ENV", envMap)

	context.Eval("$_SERVER[\"SERVER_NAME\"]=\"" + r.Host + "\";")
	context.Eval("$_SERVER[\"SERVER_PORT\"]=\"443\";")
	context.Eval("$_SERVER[\"HTTPS\"]=\"on\";")
	context.Eval("http_response_code(200);")

	var stdout bytes.Buffer
	context.Output = &stdout
	context.Exec(h.ScriptFull)

	statusCodeVal, _ := context.Eval("return http_response_code();")
	w.WriteHeader(int(statusCodeVal.Int()))

	headers := w.Header()
	headers.Add("content-type", "text/html")
	for k, v := range context.Header {
		for _, s := range v {
			headers.Add(k, s)
		}
	}

	w.Write(stdout.Bytes())

	engine.Destroy()
}

func main() {
	ex, _ := os.Executable()
	handler := &PhpHandler{
		nil,
		path.Join(filepath.Dir(ex), os.Getenv("NOW_PHP_SCRIPT")),
	}
	now.Start(handler)
}
