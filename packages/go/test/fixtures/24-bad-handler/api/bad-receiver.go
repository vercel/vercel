package handler

import (
	"fmt"
	"net/http"
)

type SampleDecoder struct {
}

type Servers struct {
	path string
}

// the handler location logic looks for the first function that matches the proper signature;
// this test makes sure that the BadReceiverHandler is not found because it is a receiver function

// this handler will not be found because it is a receiver function
func (d *SampleDecoder) BadReceiverHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "from BadHandler")
}

// this handler can be delegated to without being renamed
func (s Servers) Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, s.path)
}

// this handler will be found because it has the correct function signature
func GoodHandler(w http.ResponseWriter, r *http.Request) {
	server := Servers{"some/path"}

	// this occurence of "Handler" should not be renamed
	server.Handler(w, r)
}
