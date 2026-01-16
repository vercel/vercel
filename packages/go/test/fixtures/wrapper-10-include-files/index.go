package main

import (
	"fmt"
	"github.com/vercel/vercel-go"
	"io/ioutil"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		content, err := ioutil.ReadFile("templates/hello.txt")
		if err != nil {
			http.Error(w, fmt.Sprintf("Error reading file: %v", err), http.StatusInternalServerError)
			return
		}
		w.Write(content)
	})

	vercel.Start(http.DefaultServeMux)
}
