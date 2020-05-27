package main

import (
	"net/http"
	now "github.com/vercel/go-bridge/go/bridge"
)

func main() {
	now.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
