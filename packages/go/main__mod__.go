package main

import (
	"__VC_HANDLER_PACKAGE_NAME"
	"net/http"

	vc "github.com/vercel/go-bridge/go/bridge"
)

func main() {
	vc.Start(http.HandlerFunc(__VC_HANDLER_FUNC_NAME))
}
