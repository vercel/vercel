package main

import (
	"fmt"
	"net/http"
	"os"
	"runtime"

	blackfriday "github.com/russross/blackfriday/v2"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		input := []byte("**hello**")
		output := blackfriday.Run(input)
		fmt.Fprintf(w, "version:%s:%s:RANDOMNESS_PLACEHOLDER", runtime.Version(), string(output))
	})

	http.ListenAndServe(":"+port, mux)
}
