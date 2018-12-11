package bridge

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"net/http"
	"strconv"
	"strings"
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
	StatusCode int                 `json:"statusCode"`
	Headers    map[string][]string `json:"headers"`
	Encoding   string              `json:"encoding,omitemtpy"`
	Body       string              `json:"body"`
}

type ResponseWriter struct {
	http.ResponseWriter
	statusCode int
	headers    http.Header
	body       *bytes.Buffer
}

func (w *ResponseWriter) Header() http.Header {
	return w.headers
}

func (w *ResponseWriter) Write(p []byte) (n int, err error) {
	n, err = w.body.Write(p)
	return
}

func (w *ResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
}

var userHandler http.Handler

func Serve(handler http.Handler, req *Request) (res Response, err error) {
	var body []byte
	if req.Encoding == "base64" {
		body, err = base64.StdEncoding.DecodeString(req.Body)
		if err != nil {
			return
		}
	} else {
		body = []byte(req.Body)
	}

	r, err := http.NewRequest(req.Method, req.Path, bytes.NewReader(body))
	if err != nil {
		return
	}

	for k, v := range req.Headers {
		r.Header.Add(k, v)
		switch strings.ToLower(k) {
			case "host":
				// we need to set `Host` in the request
				// because Go likes to ignore the `Host` header
				// see https://github.com/golang/go/issues/7682
				r.Host = v
			case "content-length":
				contentLength, _ := strconv.ParseInt(v, 10, 64)
				r.ContentLength = contentLength
			case "x-forwarded-for":
			case "x-real-ip":
				r.RemoteAddr = v
		}
	}

	var bodyBuf bytes.Buffer
	w := &ResponseWriter{
		nil,
		http.StatusOK,
		make(http.Header),
		&bodyBuf,
	}

	handler.ServeHTTP(w, r)
	defer r.Body.Close()

	headers := make(map[string][]string)
	for k, v := range w.headers {
		for _, s := range v {
			headers[k] = append(headers[k], s)
		}
	}

	res = Response{
		StatusCode: w.statusCode,
		Headers:    headers,
		Encoding:   "base64",
		Body:       base64.StdEncoding.EncodeToString(bodyBuf.Bytes()),
	}
	return
}

// Maps the `APIGatewayProxyRequest` to a `Request` instance and invokes `Serve()`
func handler(event events.APIGatewayProxyRequest) (res Response, err error) {
	var req Request
	err = json.Unmarshal([]byte(event.Body), &req)
	if err != nil {
		return
	}
	res, err = Serve(userHandler, &req)
	return
}

// Starts the Lambda
func Start(h http.Handler) {
	userHandler = h
	lambda.Start(handler)
}
