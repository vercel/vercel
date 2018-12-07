package main

import (
	now "./utils"
	"bytes"
	php "github.com/deuill/go-php"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
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
	for k, v := range query {
		if (strings.HasSuffix(k, "[]")) {
			k = strings.TrimSuffix(k, "[]")
			var i int = 0
			var sb string = "["
			for _, s := range v {
				if i > 0 {
					sb += ","
				}
				sb += strconv.Itoa(i) + "=>'" + s + "'"
				i += 1
			}
			sb += "]"
			context.Eval("$_GET['" + k + "']=" + sb + ";")
		} else {
			var s string = v[len(v) - 1]
			context.Eval("$_GET['" + k + "']='" + s + "';") // TODO escape quotes
		}
	}

	r.ParseForm()
	for k, v := range r.PostForm {
		if (strings.HasSuffix(k, "[]")) {
			k = strings.TrimSuffix(k, "[]")
			var i int = 0
			var sb string = "["
			for _, s := range v {
				if i > 0 {
					sb += ","
				}
				sb += strconv.Itoa(i) + "=>'" + s + "'"
				i += 1
			}
			sb += "]"
			context.Eval("$_POST['" + k + "']=" + sb + ";")
		} else {
			var s string = v[len(v) - 1]
			context.Eval("$_POST['" + k + "']='" + s + "';") // TODO escape quotes
		}
	}

	envMap := make(map[string]string)
	for _, e := range os.Environ() {
		pair := strings.Split(e, "=")
		envMap[pair[0]] = pair[1]
	}
	context.Bind("_ENV", envMap)

	context.Eval("$_SERVER['SCRIPT_FILENAME']='" + h.ScriptFull + "';")
	context.Eval("$_SERVER['REQUEST_METHOD']='" + r.Method + "';")
	context.Eval("$_SERVER['REQUEST_URI']='" + r.URL.RequestURI() + "';") // TODO must be unescaped to align with php
	context.Eval("$_SERVER['HTTP_HOST']='" + r.Host + "';") // no port needed
	context.Eval("$_SERVER['SERVER_NAME']='" + r.Host + "';")
	context.Eval("$_SERVER['SERVER_PORT']='443';")
	context.Eval("$_SERVER['HTTPS']='on';")
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
