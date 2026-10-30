//go:build unix

// The command dispatcher exposes an HTTP invocation boundary around a process.
// It uses the container's inherited user, working directory and environment.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"ipc-proxy/ipc"
	"ipc-proxy/schedule"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

type dispatcher struct {
	command  []string
	output   *output
	mu       sync.Mutex
	stopping bool
	active   map[*exec.Cmd]struct{}
}

func (d *dispatcher) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/_vercel/ping" {
		w.WriteHeader(http.StatusOK)
		return
	}
	// Read the CloudEvent before starting work. This also lets net/http observe
	// a disconnected caller while the command is running.
	if _, err := io.Copy(io.Discard, r.Body); err != nil {
		http.Error(w, "Could not read invocation", http.StatusBadRequest)
		return
	}
	ctx := ipc.ContextFromRequest(r)
	scheduleEnv, err := schedule.Env(r.Header)
	if err != nil {
		d.output.write(ctx, "stderr", []byte(fmt.Sprintf("Invalid schedule invocation: %v\n", err)))
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	err = d.run(r.Context(), ctx, schedule.ChildEnv(os.Environ(), scheduleEnv, r.Header))
	if errors.Is(err, errShuttingDown) {
		// The command never started, so the firing can run elsewhere.
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	if err != nil {
		d.output.write(ctx, "stderr", []byte(fmt.Sprintf("Command failed: %v\n", err)))
		http.Error(w, "Command failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// The builder sets the command on the function rather than in the image, so
// schedules can share an image.
const commandEnv = "VERCEL_SCHEDULE_COMMAND"

// parseCommand reads the command's JSON argument array.
func parseCommand(value string) ([]string, error) {
	var command []string
	if err := json.Unmarshal([]byte(value), &command); err != nil {
		return nil, fmt.Errorf("%s must be a JSON array of strings: %w", commandEnv, err)
	}
	if len(command) == 0 || command[0] == "" {
		return nil, fmt.Errorf("%s must name a program", commandEnv)
	}
	return command, nil
}

func main() {
	command, err := parseCommand(os.Getenv(commandEnv))
	if err != nil {
		log.Fatal(err)
	}
	output := &output{stdout: os.Stdout, stderr: os.Stderr}
	if path := os.Getenv("VERCEL_IPC_PATH"); path != "" {
		// No write deadline, like the proxy: a runtime that stops reading logs
		// stalls the command, and the invocation deadline bounds that.
		conn, err := ipc.Dial(path, 0)
		if err != nil {
			log.Printf("IPC logging unavailable; using container output: %v", err)
		} else {
			output.ipc = conn
			defer conn.Close()
		}
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}
	d := &dispatcher{command: command, output: output, active: make(map[*exec.Cmd]struct{})}
	server := &http.Server{Addr: ":" + port, Handler: d, ReadHeaderTimeout: 10 * time.Second}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGTERM, syscall.SIGINT)
	stopped := make(chan struct{})
	go func() {
		<-signals
		d.stop()
		// The platform's termination window bounds shutdown. Let commands handle
		// SIGTERM and finish their output before closing active responses.
		server.Shutdown(context.Background())
		close(stopped)
	}()
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	<-stopped
}
