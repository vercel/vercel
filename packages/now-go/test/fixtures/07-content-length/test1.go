package function

import (
	"net/http"
	"os"
	"strconv"
)

// HandlerTest1 function
func HandlerTest1(w http.ResponseWriter, r *http.Request) {
	rdm := os.Getenv("RANDOMNESS_ENV_VAR")

	w.WriteHeader(401)
	w.Header().Set("content-length", strconv.Itoa(len(rdm+":content-length")))
	w.Write([]byte(rdm + ":content-length"))
}
