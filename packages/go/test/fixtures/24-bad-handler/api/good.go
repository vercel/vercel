package handler

import (
	"fmt"
	"net/http"
	"runtime"
)

func GoodHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%s:RANDOMNESS_PLACEHOLDER", runtime.Version())
}
