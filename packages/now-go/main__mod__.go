package main

import (
  "net/http"
  "__NOW_HANDLER_PACKAGE_NAME"

  now "github.com/zeit/now/utils/go/bridge@3ae83172eccea727118baed5c0250bfe45cea385"
)

func main() {
  now.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
