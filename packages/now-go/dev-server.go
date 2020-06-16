package main

import (
	"net"
	"net/http"
	"os"
	"strconv"
)

func main() {
	// create a new handler
	handler := http.HandlerFunc(__HANDLER_FUNC_NAME)

	// https://stackoverflow.com/a/43425461/376773
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		panic(err)
	}

	port := listener.Addr().(*net.TCPAddr).Port

	file := os.NewFile(3, "pipe")
	_, err2 := file.Write([]byte(strconv.Itoa(port)))
	if err2 != nil {
		panic(err2)
	}

	panic(http.Serve(listener, handler))
}
