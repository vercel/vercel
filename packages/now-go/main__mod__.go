package main

import (
  "net/http"
  "__NOW_HANDLER_PACKAGE_NAME"

  vc "github.com/vercel/go-bridge/go/bridge"
)

func main() {
  vc.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
