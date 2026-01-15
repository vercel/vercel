package main

import (
	"github.com/gorilla/mux"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Hello from Gorilla"))
	})
	vercel.Start(r)
}
