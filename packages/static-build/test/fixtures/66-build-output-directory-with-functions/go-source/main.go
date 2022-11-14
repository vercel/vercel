package main

import (
	"fmt"
	"net/http"

	vc "github.com/vercel/go-bridge/go/bridge"
)

func main() {
	vc.Start(http.HandlerFunc(Handler))
}

func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "<h1>Hello from Go!</h1>")
}
