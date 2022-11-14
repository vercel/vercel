package cowsay

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

// Handler function
func HandlerAnother(w http.ResponseWriter, r *http.Request) {
	bts, err := ioutil.ReadFile("templates/another.txt")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	fmt.Fprintf(w, string(bts))
}
