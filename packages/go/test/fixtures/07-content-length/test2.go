package function

import (
	"net/http"
)

// HandlerTest2 function
func HandlerTest2(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Length", "2")
	w.WriteHeader(401)
	w.Write([]byte(""))
}
