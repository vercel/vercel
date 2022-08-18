package handler

import (
	"fmt"
	"net/http"
	"runtime"
)

type SampleDecoder struct {
}

func (d *SampleDecoder) BadReceiverHandler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%v", runtime.Version())
}
