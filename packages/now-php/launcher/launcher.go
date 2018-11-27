package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	php "github.com/deuill/go-php"
)

type Request struct {
	Host     string            `json:"host"`
	Path     string            `json:"path"`
	Method   string            `json:"method"`
	Headers  map[string]string `json:"headers"`
	Encoding string            `json:"encoding,omitempty"`
	Body     string            `json:"body"`
}

type Response struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers"`
	Encoding   string            `json:"encoding,omitemtpy"`
	Body       string            `json:"body"`
}

var phpScript = ""
var phpScriptFull = ""

func handler(ctx context.Context, event events.APIGatewayProxyRequest) (Response, error) {
	engine, _ := php.New()
	context, _ := engine.NewContext()

	var req Request
	json.Unmarshal([]byte(event.Body), &req)

	var body string
	if req.Encoding == "base64" {
		decoded, _ := base64.StdEncoding.DecodeString(req.Body)
		body = string(decoded)
	} else {
		body = string(req.Body)
	}

	var bodyReader = strings.NewReader(body)
	var httpReq, _ = http.NewRequest(req.Method, req.Path, bodyReader)

	for k, v := range req.Headers {
		httpReq.Header.Add(k, v)
	}

	var query = httpReq.URL.Query()
	getMap := make(map[string]string)
	for k, v := range query {
		for _, s := range v {
			getMap[k] = s
		}
	}
	context.Bind("_GET", getMap)

	httpReq.ParseForm()
	postMap := make(map[string]string)
	for k, v := range httpReq.PostForm {
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

	context.Eval("$_SERVER[\"SERVER_NAME\"]=\"" + req.Host + "\";")
	context.Eval("$_SERVER[\"SERVER_PORT\"]=\"443\";")
	context.Eval("$_SERVER[\"HTTPS\"]=\"on\";")

	var stdout bytes.Buffer
	context.Output = &stdout
	context.Exec(phpScriptFull)

	headers := make(map[string]string)
	headers["content-type"] = "text/html"
	for k, v := range context.Header {
		for _, s := range v {
			headers[k] = s
		}
	}

	resBody := base64.StdEncoding.EncodeToString(stdout.Bytes())

	engine.Destroy()
	return Response{
		StatusCode: 200,
		Headers:    headers,
		Encoding:   "base64",
		Body:       resBody,
	}, nil
}

func main() {
	ex, _ := os.Executable()
	phpScript = os.Getenv("NOW_PHP_SCRIPT")
	phpScriptFull = path.Join(filepath.Dir(ex), phpScript)
	lambda.Start(handler)
}
