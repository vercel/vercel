package handler

import (
	"fmt"
	"net/http"
	"runtime"

	blackfriday "github.com/russross/blackfriday/v2"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	output := blackfriday.Run([]byte("**hello**"))
	fmt.Fprintf(w, "version:%s:%s:RANDOMNESS_PLACEHOLDER", runtime.Version(), string(output))
}
