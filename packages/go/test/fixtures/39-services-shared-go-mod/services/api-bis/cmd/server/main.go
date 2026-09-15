// Two services share the go.mod at the repository root; each is its own
// `main` package inside that module.
package main

import (
	"encoding/json"
	"net/http"
	"os"
	"runtime"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{
			"service": "api-bis",
			"path":    r.URL.Path,
			"go":      runtime.Version(),
		})
	})

	mux.HandleFunc("GET /items/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]string{
			"service": "api-bis",
			"item_id": r.PathValue("id"),
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
