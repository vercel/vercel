package main

import (
	"encoding/json"
	"net/http"
	"os"
)

func writeJSON(w http.ResponseWriter, status int, payload map[string]string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func main() {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/":
			writeJSON(w, http.StatusOK, map[string]string{
				"message": "Hello from Go",
			})
		case "/health":
			writeJSON(w, http.StatusOK, map[string]string{
				"status": "ok",
			})
		default:
			writeJSON(w, http.StatusNotFound, map[string]string{
				"detail": "404 from Go",
			})
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	_ = http.ListenAndServe(":"+port, handler)
}
