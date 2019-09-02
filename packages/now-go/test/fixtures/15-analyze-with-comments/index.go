// Package handler with
// multi-line comment
package handler

import (
	"fmt"
	"log"
	"net/http"
)

func init() { log.SetFlags(log.Lmicroseconds) }

var _ http.HandlerFunc = Index // type check

// Index func
func Index(w http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(w, "RANDOMNESS_PLACEHOLDER")
}
