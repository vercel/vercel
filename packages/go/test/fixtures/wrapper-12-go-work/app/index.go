package main

import (
	"example.com/shared"
	"fmt"
	"github.com/vercel/vercel-go"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, shared.Message())
	})
	vercel.Start(http.DefaultServeMux)
}
