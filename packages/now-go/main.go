package main

import (
	"net/http"
	vc "github.com/vercel/go-bridge/go/bridgee"
)

func main() {
	vc.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
