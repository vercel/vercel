package main

import (
	"fmt"
	"net/http"

	"github.com/vercel/vercel-go"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		fmt.Fprintf(w, "User ID: %s", id)
	})
	vercel.Start(mux)
}
