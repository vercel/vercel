package main

import (
	now "./utils"
	"bytes"
	php "github.com/deuill/go-php"
	"net/http"
	"net/url"
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

	for k, v := range r.URL.Query() {
		if strings.HasSuffix(k, "[]") {
			sb := ""
			for _, s := range v {
				if sb != "" {
					sb += ","
				}
				sb += "'" + s + "'"
			}
			k = strings.TrimSuffix(k, "[]")
			context.Eval("$_GET['" + k + "']=Array(" + sb + ");")
		} else {
			s := v[len(v) - 1]
			context.Eval("$_GET['" + k + "']='" + s + "';") // TODO escape quotes
		}
	}

	r.ParseForm()
	for k, v := range r.PostForm {
		if strings.HasSuffix(k, "[]") {
			sb := ""
			for _, s := range v {
				if sb != "" {
					sb += ","
				}
				sb += "'" + s + "'"
			}
			k = strings.TrimSuffix(k, "[]")
			context.Eval("$_POST['" + k + "']=Array(" + sb + ");")
		} else {
			s := v[len(v) - 1]
			context.Eval("$_POST['" + k + "']='" + s + "';") // TODO escape quotes
		}
	}

	cookies := r.Cookies()
	cookieMap := make(map[string]string)
	for _, c := range cookies {
		k, _ := url.QueryUnescape(c.Name)
		v, _ := url.QueryUnescape(c.Value)
		s := "'" + v + "'" // TODO escape quotes
		if strings.HasSuffix(k, "[]") {
			if value, exists := cookieMap[k]; exists {
				cookieMap[k] = value + "," + s
			} else {
				cookieMap[k] = s
			}
		} else {
			if _, exists := cookieMap[k]; !exists {
				cookieMap[k] = s
			}
		}
	}
	for k, v := range cookieMap {
		if strings.HasSuffix(k, "[]") {
			k = strings.TrimSuffix(k, "[]")
			context.Eval("$_COOKIE['" + k + "']=Array(" + v + ");")
		} else {
			context.Eval("$_COOKIE['" + k + "']=" + v + ";")
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
	context.Eval("$_SERVER['SERVER_PROTOCOL']='" + r.Proto + "';");
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
