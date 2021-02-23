package api

import (
	"fmt"
	"net/http"
	"runtime"
	"with-shared/shared"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%s:%s", runtime.Version(), shared.Say("RANDOMNESS_PLACEHOLDER"))
}
