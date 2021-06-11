package handler

import (
	"fmt"
	"net/http"
	"runtime"

	"custom-flag/custom"
)

// Index func
func Index(w http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(w, "version:%v:%v", runtime.Version(), custom.Random)
}
