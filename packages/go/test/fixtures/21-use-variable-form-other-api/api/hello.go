package handler

import (
	"fmt"
	"net/http"
)

type Circle struct {
	Radius float64
}

func Hello(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Hello World!")
}
