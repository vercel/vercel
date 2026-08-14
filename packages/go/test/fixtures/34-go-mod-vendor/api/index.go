package handler

import (
	"fmt"
	"net/http"
	"runtime"

	"example.com/greeting"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%s:%s:RANDOMNESS_PLACEHOLDER", runtime.Version(), greeting.Hello())
}
