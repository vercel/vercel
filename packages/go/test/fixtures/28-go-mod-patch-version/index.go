package handler

import (
	"fmt"
	"net/http"
	"runtime"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%s:RANDOMNESS_PLACEHOLDER", runtime.Version())
}
