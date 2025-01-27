package al2test

import (
	"io"
	"log"
	"net/http"
	"os"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	file, err := os.Open("/etc/os-release")
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		if err = file.Close(); err != nil {
			log.Fatal(err)
		}
	}()

	b, err := io.ReadAll(file)
	w.Write(b)
}
