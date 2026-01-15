package main

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"

	"github.com/vercel/vercel-go"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		hash := sha256.Sum256(body)
		fmt.Fprintf(w, "%x", hash)
	})
	vercel.Start(http.DefaultServeMux)
}
