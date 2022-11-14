package handler

import (
	"fmt"
	"net/http"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "hello:RANDOMNESS_PLACEHOLDER")
}
