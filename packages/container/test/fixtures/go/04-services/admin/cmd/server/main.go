package main

import (
	"encoding/json"
	"net/http"
	"os"
	"runtime"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"service": "admin",
			"path":    r.URL.Path,
			"go":      runtime.Version(),
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	_ = http.ListenAndServe(":"+port, mux)
}
