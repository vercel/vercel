package api

import (
	"fmt"
	"net/http"
	"with-shared/shared"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, shared.Say("RANDOMNESS_PLACEHOLDER"))
}
