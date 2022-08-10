package handler

import (
	"fmt"
	"net/http"
)

// "Handler" conflicts with the other files' exported function,
// but should still work
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "from dupe-handler.go")
}
