package main

import (
	"net/http"
)

func main() {
	server := http.Server{
		Addr:    "localhost:3000",
		Handler: http.HandlerFunc(api.IndexHandler),
	}

	server.ListenAndServe()
}
