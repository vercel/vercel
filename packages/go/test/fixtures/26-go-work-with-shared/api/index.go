package handler

import (
	"fmt"
	"net/http"
	"go-work-with-shared/mylib"
)

// Handler function
func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, mylib.Say("hello"))
}
