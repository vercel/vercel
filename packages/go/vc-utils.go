package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

func findFreePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	return port, nil
}

func waitForServer(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)

	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			resp.Body.Close()
			return nil
		}
		time.Sleep(50 * time.Millisecond)
	}

	return fmt.Errorf("server did not start within %v", timeout)
}

func normalizeServiceRoutePrefix(rawPrefix string) string {
	if rawPrefix == "" {
		return ""
	}

	prefix := strings.TrimSpace(rawPrefix)
	if prefix == "" {
		return ""
	}

	if !strings.HasPrefix(prefix, "/") {
		prefix = "/" + prefix
	}

	if prefix != "/" {
		prefix = strings.TrimRight(prefix, "/")
		if prefix == "" {
			prefix = "/"
		}
	}

	if prefix == "/" {
		return ""
	}

	return prefix
}

func serviceRoutePrefixStripEnabled() bool {
	raw := strings.TrimSpace(os.Getenv("VERCEL_SERVICE_ROUTE_PREFIX_STRIP"))
	if raw == "" {
		return false
	}

	normalized := strings.ToLower(raw)
	return normalized == "1" || normalized == "true"
}

func resolveServiceRoutePrefix() string {
	if !serviceRoutePrefixStripEnabled() {
		return ""
	}

	return normalizeServiceRoutePrefix(os.Getenv("VERCEL_SERVICE_ROUTE_PREFIX"))
}

func stripServiceRoutePrefix(pathValue string, prefix string) string {
	if pathValue == "*" {
		return pathValue
	}

	normalizedPath := pathValue
	if normalizedPath == "" {
		normalizedPath = "/"
	} else if !strings.HasPrefix(normalizedPath, "/") {
		normalizedPath = "/" + normalizedPath
	}

	if prefix == "" {
		return normalizedPath
	}

	if normalizedPath == prefix {
		return "/"
	}

	prefixWithSlash := prefix + "/"
	if strings.HasPrefix(normalizedPath, prefixWithSlash) {
		stripped := normalizedPath[len(prefix):]
		if stripped == "" {
			return "/"
		}
		return stripped
	}

	return normalizedPath
}
