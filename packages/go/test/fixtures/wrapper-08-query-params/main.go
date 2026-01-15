package main

import (
	"encoding/json"
	"net/http"

	"github.com/vercel/vercel-go"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(r.URL.Query())
	})
	vercel.Start(http.DefaultServeMux)
}
