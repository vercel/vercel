package main

import (
	"net/http"
	now "github.com/zeit/now/utils/go/bridge"
)

func main() {
	now.Start(http.HandlerFunc(__NOW_HANDLER_FUNC_NAME))
}
