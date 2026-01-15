package main

import (
	"fmt"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "Hello from wrapper mode")
	})
	vercel.Start(mux)
}
