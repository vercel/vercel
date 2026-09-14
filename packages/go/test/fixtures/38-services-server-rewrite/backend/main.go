package main

import (
	"encoding/json"
	"net/http"
	"os"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{
			"service": "backend",
			"path":    r.URL.Path,
		})
	})

	mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{
			"service": "backend",
			"user_id": r.PathValue("id"),
			"path":    r.URL.Path,
		})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	_ = http.ListenAndServe(":"+port, mux)
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}
