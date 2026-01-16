package main

import (
	"fmt"
	"github.com/google/uuid"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		id := uuid.New()
		fmt.Fprintf(w, "UUID: %s", id.String())
	})
	vercel.Start(http.DefaultServeMux)
}
