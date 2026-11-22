//go:build unix

package main

import (
	"context"
	"errors"
	"io"
	"ipc-proxy/ipc"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

var errShuttingDown = errors.New("container is shutting down")

// Once the group is reaped, its output is already buffered and drains at once.
// Only a process that left the group (e.g. via setsid) keeps the pipes open.
const drainTimeout = time.Second

func (d *dispatcher) run(ctx context.Context, request ipc.RequestContext, env []string) error {
	cmd := exec.CommandContext(ctx, d.command[0], d.command[1:]...)
	cmd.Env = env
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error { return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL) }
	return d.runProcess(cmd, request)
}

func (d *dispatcher) runProcess(cmd *exec.Cmd, request ipc.RequestContext) error {
	stdout, stdoutWrite, err := os.Pipe()
	if err != nil {
		return err
	}
	defer stdout.Close()
	defer stdoutWrite.Close()
	stderr, stderrWrite, err := os.Pipe()
	if err != nil {
		return err
	}
	defer stderr.Close()
	defer stderrWrite.Close()
	cmd.Stdout, cmd.Stderr = stdoutWrite, stderrWrite
	d.mu.Lock()
	if d.stopping {
		d.mu.Unlock()
		return errShuttingDown
	}
	err = cmd.Start()
	if err == nil {
		d.active[cmd] = struct{}{}
	}
	d.mu.Unlock()
	if err != nil {
		return err
	}
	stdoutWrite.Close()
	stderrWrite.Close()
	var readers sync.WaitGroup
	readers.Add(2)
	for _, stream := range []struct {
		name   string
		reader io.Reader
	}{{"stdout", stdout}, {"stderr", stderr}} {
		go func(name string, reader io.Reader) {
			defer readers.Done()
			copyOutput(reader, func(data []byte) { d.output.write(request, name, data) })
		}(stream.name, stream.reader)
	}
	err = cmd.Wait()
	// A completed invocation owns its whole process group. Descendants must not
	// survive into the next invocation or keep the output pipes open.
	syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	// As PID 1 in the image, the dispatcher adopts orphaned descendants. Reap
	// only this completed invocation's group so other cmd.Wait calls retain
	// ownership of their children.
	for {
		_, waitErr := syscall.Wait4(-cmd.Process.Pid, nil, 0, nil)
		if waitErr == syscall.EINTR {
			continue
		}
		if waitErr != nil {
			break
		}
	}
	drained := make(chan struct{})
	go func() {
		readers.Wait()
		close(drained)
	}()
	select {
	case <-drained:
	case <-time.After(drainTimeout):
		// Closing the read ends unblocks the readers.
		stdout.Close()
		stderr.Close()
		<-drained
		d.output.write(request, "stderr", []byte("Command left a process running outside its process group; dropping its output.\n"))
	}
	d.mu.Lock()
	delete(d.active, cmd)
	d.mu.Unlock()
	return err
}

func (d *dispatcher) stop() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.stopping = true
	for cmd := range d.active {
		syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
	}
}
