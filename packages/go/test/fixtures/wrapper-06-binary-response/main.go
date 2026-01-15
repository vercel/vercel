package main

import (
	"encoding/base64"
	"net/http"

	"github.com/vercel/vercel-go"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// 1x1 transparent PNG
		data, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
		w.Header().Set("Content-Type", "image/png")
		w.Write(data)
	})
	vercel.Start(http.DefaultServeMux)
}
