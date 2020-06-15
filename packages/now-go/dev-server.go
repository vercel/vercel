package main

import (
	"fmt"
	"net"
	"net/http"
  "os"
  "strconv"
)

// define handler struct
type HttpHandler struct{}

// implement `ServeHTTP` method on `HttpHandler` struct
func (h HttpHandler) ServeHTTP(res http.ResponseWriter, req *http.Request) {
	fmt.Fprintf(res, "hello\n")
}

func main() {
	// create a new handler
	handler := HttpHandler{}

	// https://stackoverflow.com/a/43425461/376773
	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		panic(err)
	}

	port := listener.Addr().(*net.TCPAddr).Port
	fmt.Println("Using port:", port)

  file := os.NewFile(3, "pipe")
  _, err2 := file.Write([]byte(strconv.Itoa(port)))
  if err2 != nil {
    panic(err2)
  }

	panic(http.Serve(listener, handler))
}
