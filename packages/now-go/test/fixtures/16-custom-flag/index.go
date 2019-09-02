package handler

import (
	"fmt"
	"net/http"
)

// Index func
func Index(w http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(w, "RANDOMNESS_PLACEHOLDER")
}
