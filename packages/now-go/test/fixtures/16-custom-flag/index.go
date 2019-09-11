package handler

import (
	"fmt"
	"net/http"

	"custom-flag/custom"
)

// Index func
func Index(w http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(w, custom.Random)
}
