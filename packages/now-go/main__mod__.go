package main

import (
	"__NOW_HANDLER_PACKAGE_NAME"
	"net/http"

	vc "github.com/vercel/go-bridge/go/bridge"
)

func main() {
	vc.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
