package api

import (
	"embed"
	"encoding/json"
	"io/fs"
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/go-chi/chi/v5"
)

//go:embed assets/*
var assets embed.FS

type DataItem struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Value int    `json:"value"`
}

type DataResponse struct {
	Data      []DataItem `json:"data"`
	Total     int        `json:"total"`
	Framework string     `json:"framework"`
	Version   string     `json:"version"`
	Timestamp string     `json:"timestamp"`
}

type ItemResponse struct {
	Item      DataItem `json:"item"`
	Framework string   `json:"framework"`
	Version   string   `json:"version"`
	Timestamp string   `json:"timestamp"`
}

func Run() error {
	assetFS, err := fs.Sub(assets, "assets")
	if err != nil {
		return err
	}

	r := chi.NewRouter()
	r.Handle("/static/*", http.StripPrefix("/static/", http.FileServer(http.FS(assetFS))))

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte("<html><body>framework:chi version:" + runtime.Version() + " randomness:RANDOMNESS_PLACEHOLDER</body></html>"))
	})

	r.Get("/api/data", func(w http.ResponseWriter, r *http.Request) {
		items := []DataItem{
			{ID: 1, Name: "Sample Item 1", Value: 100},
			{ID: 2, Name: "Sample Item 2", Value: 200},
			{ID: 3, Name: "Sample Item 3", Value: 300},
		}

		writeJSON(w, http.StatusOK, DataResponse{
			Data:      items,
			Total:     len(items),
			Framework: "chi",
			Version:   runtime.Version(),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.Get("/api/items/{id}", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ItemResponse{
			Item: DataItem{
				ID:    1,
				Name:  "Sample Item " + chi.URLParam(r, "id"),
				Value: 100,
			},
			Framework: "chi",
			Version:   runtime.Version(),
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "not found:chi", http.StatusNotFound)
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	return http.ListenAndServe(":"+port, r)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
