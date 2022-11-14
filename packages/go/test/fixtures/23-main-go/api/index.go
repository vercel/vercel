package handler

import (
	"fmt"
	"net/http"
	"runtime"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%s:RANDOMNESS_PLACEHOLDER", runtime.Version())
}
