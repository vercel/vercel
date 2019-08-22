package buildenv

import (
	"fmt"
	"net/http"
	"os"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	rdm := os.Getenv("RANDOMNESS_BUILD_ENV")
	if rdm == "" {
		fmt.Println("No build env received")
	}

	fmt.Fprintf(w, rdm+":build-env")
}
