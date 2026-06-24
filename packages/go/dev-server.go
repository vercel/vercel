package main

import (
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"strconv"
)

func main() {
	// create a new handler
	handler := http.HandlerFunc(__HANDLER_FUNC_NAME)

	addr := "127.0.0.1:0"
	if devPort := os.Getenv("VERCEL_DEV_PORT"); devPort != "" {
		addr = "127.0.0.1:" + devPort
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		panic(err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	portBytes := []byte(strconv.Itoa(port))

	file := os.NewFile(3, "pipe")
	_, err2 := file.Write(portBytes)
	if err2 != nil {
		portFile := os.Getenv("VERCEL_DEV_PORT_FILE")
		os.Unsetenv("VERCEL_DEV_PORT_FILE")
		err3 := ioutil.WriteFile(portFile, portBytes, 0644)
		if err3 != nil {
			panic(err3)
		}
	}

	panic(http.Serve(listener, handler))
}
