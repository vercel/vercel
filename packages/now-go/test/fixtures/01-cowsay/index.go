package cowsay

import (
	"fmt"
	"net/http"

	say "github.com/dhruvbird/go-cowsay"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, say.Format("cow:RANDOMNESS_PLACEHOLDER"))
}
