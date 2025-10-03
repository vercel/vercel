package main

import (
    "io/ioutil"
    "net"
    "net/http"
    "os"
    "path/filepath"
    "strconv"
)

func main() {
	// create a new handler
	handler := http.HandlerFunc(__HANDLER_FUNC_NAME)

	// https://stackoverflow.com/a/43425461/376773
	listener, err := net.Listen("tcp", "127.0.0.1:0")
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

    // Optionally serve static files from a public directory first, then fallback to handler
    publicDir := os.Getenv("VERCEL_DEV_PUBLIC_DIR")
    var finalHandler http.Handler = handler
    if publicDir != "" {
        fileServer := http.FileServer(http.Dir(publicDir))
        mux := http.NewServeMux()
        mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
            // Check if the requested path maps to a file or index.html in publicDir
            // If so, serve it; otherwise fallback to the user's handler
            p := r.URL.Path
            if p == "" || p == "/" {
                p = "/index.html"
            }
            absPath := filepath.Join(publicDir, filepath.FromSlash(p))
            if info, err := os.Stat(absPath); err == nil && !info.IsDir() {
                fileServer.ServeHTTP(w, r)
                return
            }
            // Try directory index
            dirIndex := filepath.Join(publicDir, filepath.FromSlash(filepath.Clean(r.URL.Path+"/index.html")))
            if info, err := os.Stat(dirIndex); err == nil && !info.IsDir() {
                fileServer.ServeHTTP(w, r)
                return
            }
            handler.ServeHTTP(w, r)
        })
        finalHandler = mux
    }

    panic(http.Serve(listener, finalHandler))
}
