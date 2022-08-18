package handler

import (
	"fmt"
	"net/http"
	"runtime"
)

type SampleDecoder struct {
}

// the handler location logic looks for the first function that matches the proper signature;
// this test makes sure that the BadReceiverHandler is not found because it is a receiver function

// this handler will not be found because it is a receiver function
func (d *SampleDecoder) BadReceiverHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%v:from BadHandler", runtime.Version())
}

// this handler will be found because it has the correct function signature
func GoodHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%v:from GoodHandler", runtime.Version())
}
