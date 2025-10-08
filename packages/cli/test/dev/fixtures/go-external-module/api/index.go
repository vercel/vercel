package handler

import (
	"fmt"
	"net/http"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")

	message := "Hello from Go!"
	transformed := cases.Lower(language.English).String(message)

	fmt.Fprint(w, transformed)
}
