// Package handler with multi-line comment
// and multiple export handler
package handler

import (
	"fmt"
	"net/http"
)

// Index1 func
func Index1(w http.ResponseWriter) {
	fmt.Fprintf(w, "one:RANDOMNESS_PLACEHOLDER")
}

// Index2 func
func Index2(w http.ResponseWriter, str string, req *http.Request) {
	fmt.Fprintf(w, "two:RANDOMNESS_PLACEHOLDER")
}

// Index3 func
func Index3(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "three:RANDOMNESS_PLACEHOLDER")
}
