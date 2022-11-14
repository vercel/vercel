package subcow

import (
	"fmt"
	"net/http"
	"runtime"

	say "github.com/dhruvbird/go-cowsay"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, say.Format("subcow:" + runtime.Version() + ":RANDOMNESS_PLACEHOLDER"))
}
