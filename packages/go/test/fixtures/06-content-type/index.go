package function

import (
	"fmt"
	"net/http"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "RANDOMNESS_PLACEHOLDER")
}
