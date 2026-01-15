package main

import (
	"github.com/go-chi/chi/v5"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	r := chi.NewRouter()
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Hello from Chi"))
	})
	vercel.Start(r)
}
