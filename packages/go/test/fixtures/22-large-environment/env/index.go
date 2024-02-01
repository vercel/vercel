package env

import (
	"fmt"
	"net/http"
	"os"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	rdm := os.Getenv("RANDOMNESS_ENV")
	if rdm == "" {
		fmt.Println("No env received")
	}

	fmt.Fprintln(w, rdm)
	fmt.Fprintln(w, os.Getenv("LOREM"))
	fmt.Fprintln(w, os.Getenv("IPSUM"))
}
