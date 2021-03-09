package main

import (
	vc "github.com/vercel/go-bridge/go/bridge"
	"net/http"
)

func main() {
	vc.Start(http.HandlerFunc(__VC_HANDLER_FUNC_NAME))
}
