//go:build vcdev
// +build vcdev

// vc-init-dev.go - Dev wrapper for standalone Go servers on Vercel
//
// This wrapper is used by `vercel dev` for standalone Go mode. It:
// 1. Starts the user's server (`go run <target>`) on an internal port
// 2. Proxies requests from the external dev port to the internal server
// 3. Optionally strips generated services route prefixes before forwarding

package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

func mustEnv(name string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		fmt.Fprintf(os.Stderr, "%s is not set\n", name)
		os.Exit(1)
	}
	return value
}

func withEnvOverride(env []string, key, value string) []string {
	prefix := key + "="
	filtered := make([]string, 0, len(env)+1)
	for _, item := range env {
		if !strings.HasPrefix(item, prefix) {
			filtered = append(filtered, item)
		}
	}
	filtered = append(filtered, prefix+value)
	return filtered
}

func main() {
	listenPortRaw := mustEnv("PORT")
	listenPort, err := strconv.Atoi(listenPortRaw)
	if err != nil || listenPort <= 0 {
		fmt.Fprintf(os.Stderr, "Invalid PORT value: %q\n", listenPortRaw)
		os.Exit(1)
	}

	runTarget := mustEnv("__VC_GO_DEV_RUN_TARGET")
	serviceRoutePrefix := resolveServiceRoutePrefix()

	userPort, err := findFreePort()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find free port: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cmd := exec.CommandContext(ctx, "go", "run", runTarget)
	cmd.Env = withEnvOverride(os.Environ(), "PORT", strconv.Itoa(userPort))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start Go dev server: %v\n", err)
		os.Exit(1)
	}

	if err := waitForServer(userPort, 30*time.Second); err != nil {
		fmt.Fprintf(os.Stderr, "Go dev server failed to start: %v\n", err)
		_ = cmd.Process.Kill()
		os.Exit(1)
	}

	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", userPort))
	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		if host := req.Header.Get("X-Forwarded-Host"); host != "" {
			req.Host = host
		}
	}

	server := &http.Server{
		Addr: fmt.Sprintf("127.0.0.1:%d", listenPort),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/_vercel/ping" {
				w.WriteHeader(http.StatusOK)
				w.Write([]byte("OK"))
				return
			}

			if r.URL != nil {
				originalPath := r.URL.Path
				r.URL.Path = stripServiceRoutePrefix(r.URL.Path, serviceRoutePrefix)
				if r.URL.Path != originalPath {
					r.URL.RawPath = ""
				}
			}

			proxy.ServeHTTP(w, r)
		}),
	}

	var closeOnce sync.Once
	stop := func() {
		closeOnce.Do(func() {
			cancel()
			_ = server.Close()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
		})
	}

	go func() {
		_ = cmd.Wait()
		stop()
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		stop()
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "Dev proxy server error: %v\n", err)
		stop()
		os.Exit(1)
	}

	stop()
}
