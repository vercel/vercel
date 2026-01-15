package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/vercel/vercel-go"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Echo request headers with prefix
		for k, v := range r.Header {
			// Skip internal headers or standard ones if needed, but for now echo all
			w.Header().Set("X-Resp-"+k, strings.Join(v, ","))
		}

		// Set a custom response header
		w.Header().Set("X-Custom-Response", "custom-value")
		w.Header().Set("Content-Type", "application/json")

		fmt.Fprintf(w, `{"status":"ok"}`)
	})
	vercel.Start(http.DefaultServeMux)
}
