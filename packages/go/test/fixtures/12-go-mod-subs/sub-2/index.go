package sub2

import (
	"fmt"
	"net/http"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "RANDOMNESS_PLACEHOLDER")
}
