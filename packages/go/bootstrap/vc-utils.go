package main

import (
	"fmt"
	"net"
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
	const (
		dialTimeout  = 200 * time.Millisecond
		pollInterval = 50 * time.Millisecond
	)

	addr := fmt.Sprintf("127.0.0.1:%d", port)
	deadline := time.Now().Add(timeout)
	var lastErr error

	for time.Now().Before(deadline) {
		remaining := time.Until(deadline)
		if remaining <= 0 {
			break
		}

		attemptTimeout := dialTimeout
		if remaining < attemptTimeout {
			attemptTimeout = remaining
		}

		conn, err := net.DialTimeout("tcp", addr, attemptTimeout)
		if err == nil {
			conn.Close()
			return nil
		}

		lastErr = err
		time.Sleep(pollInterval)
	}

	if lastErr != nil {
		return fmt.Errorf(
			"server did not start listening on %s within %v: %w",
			addr,
			timeout,
			lastErr,
		)
	}

	return fmt.Errorf("server did not start listening on %s within %v", addr, timeout)
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
