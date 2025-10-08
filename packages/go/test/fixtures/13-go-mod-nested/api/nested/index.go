package nested

import (
	"fmt"
	"net/http"
	"with-nested/shared"
)

// Handler func
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, shared.Say("lol:RANDOMNESS_PLACEHOLDER"))
}
