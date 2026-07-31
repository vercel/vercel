package main

import (
	"net/http"

	"__VC_HANDLER_PACKAGE_NAME"
	vercel "github.com/vercel/go-runtime"
)

func main() {
	if err := vercel.ListenAndServe(http.HandlerFunc(__VC_HANDLER_FUNC_NAME)); err != nil {
		panic(err)
	}
}
