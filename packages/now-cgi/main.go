package main

import (
	"os"
	"fmt"
	"net"
	"strings"
	"io/ioutil"
	"net/http"
	"net/http/cgi"
	"path/filepath"
	"encoding/json"
	b64 "encoding/base64"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
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

type ResponseError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ResponseErrorWrapper struct {
	Error ResponseError `json:"error"`
}

type CgiHandler struct {
	http.Handler
	Dir    string
	Script string
}

func createErrorResponse(message string, code string, statusCode int) (Response, error) {
	obj := ResponseErrorWrapper{
		Error: ResponseError{
			Code:    code,
			Message: message,
		},
	}

	body, _ := json.Marshal(obj)

	return Response{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
		Body: string(body),
	}, nil
}

func (h *CgiHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	cgih := cgi.Handler{
		Path: h.Script,
		Root: "/" + h.Script,
		Dir: h.Dir,
		Env: []string{"SERVER_PORT=443", "HTTPS=on", "SERVER_SOFTWARE=@now/cgi"},
	}
	cgih.ServeHTTP(w, r)
}

func main() {
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		panic(err)
	}

	workdir, _ := filepath.Abs(".")
	script := os.Getenv("SCRIPT_FILENAME")
	h := &CgiHandler{nil, workdir, script}

	http.Handle("/", h)
	go http.Serve(l, nil)

	handler := func(_req events.APIGatewayProxyRequest) (Response, error) {
		var req Request

		err := json.Unmarshal([]byte(_req.Body), &req)

		if err != nil {
			fmt.Println(err)
			return createErrorResponse("Invalid payload", "bad_request", 400)
		}

		if req.Encoding == "base64" {
			decoded, _ := b64.StdEncoding.DecodeString(req.Body)
			req.Body = string(decoded)
		}

		url := "http://" + l.Addr().String() + req.Path

		internalReq, err := http.NewRequest(req.Method, url, strings.NewReader(req.Body))
		if err != nil {
			fmt.Println(err)
			return createErrorResponse("Bad gateway internal req failed", "bad_gateway", 502)
		}

		for k, v := range req.Headers {
			internalReq.Header.Add(k, v)
			if strings.ToLower(k) == "host" {
				internalReq.Host = v
			}
		}

		client := &http.Client{}
		internalRes, err := client.Do(internalReq)
		if err != nil {
			fmt.Println(err)
			return createErrorResponse("Bad gateway internal req Do failed", "bad_gateway", 502)
		}
		defer internalRes.Body.Close()

		resHeaders := make(map[string]string, len(internalRes.Header))
		for k, v := range internalRes.Header {
			// FIXME: support multiple values via concatenating with ','
			// see RFC 7230, section 3.2.2
			resHeaders[k] = v[0]
		}

		bodyBytes, err := ioutil.ReadAll(internalRes.Body)
		if err != nil {
			return createErrorResponse("Bad gateway ReadAll bytes from response failed", "bad_gateway", 502)
		}

		resBody := b64.StdEncoding.EncodeToString(bodyBytes)

		return Response{
			StatusCode: internalRes.StatusCode,
			Headers:    resHeaders,
			Encoding:   "base64",
			Body:       resBody,
		}, nil
	}

	lambda.Start(handler)
}
