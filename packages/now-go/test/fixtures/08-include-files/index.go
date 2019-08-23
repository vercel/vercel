package cowsay

import (
	"fmt"
	"io/ioutil"
	"net/http"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	bts, err := ioutil.ReadFile("templates/foo.txt")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
	fmt.Fprintf(w, string(bts))
}
