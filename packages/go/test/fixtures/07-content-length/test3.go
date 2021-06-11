package function

import (
	"net/http"
	"os"
)

// HandlerTest3 function
func HandlerTest3(w http.ResponseWriter, r *http.Request) {
	rev := os.Getenv("RANDOMNESS_ENV_VAR")
	w.WriteHeader(401)
	w.Write([]byte(rev + ":content-length"))
}
