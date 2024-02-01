package handler

import (
	"fmt"
	"net/http"
)

// "Handler" conflicts with the other files' exported function
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "from /sub/one.go")
}
