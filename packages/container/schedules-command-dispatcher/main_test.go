//go:build unix

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"os/signal"
	"reflect"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"ipc-proxy/ipc"
)

func TestDispatcherChild(t *testing.T) {
	args := os.Args
	for len(args) > 0 && args[0] != "--" {
		args = args[1:]
	}
	if len(args) == 0 {
		return
	}
	switch args[1] {
	case "args":
		json.NewEncoder(os.Stdout).Encode(args[2:])
		fmt.Fprint(os.Stderr, os.Getenv("COMMAND_TEST_ENV"), " ", os.Getenv("VERCEL_SCHEDULE_NAME"))
	case "exit":
		os.Exit(7)
	case "logs":
		for i := 0; i < 4; i++ {
			fmt.Fprintln(os.Stdout, args[2])
			fmt.Fprintln(os.Stderr, args[2])
			time.Sleep(5 * time.Millisecond)
		}
	case "wait":
		signals := make(chan os.Signal, 1)
		signal.Notify(signals, syscall.SIGTERM)
		fmt.Fprintln(os.Stdout, "ready")
		<-signals
		fmt.Fprintln(os.Stdout, "terminated")
	case "descendant":
		cmd := exec.Command(os.Args[0], "-test.run=^TestDispatcherChild$", "--", "wait")
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		if err := cmd.Start(); err != nil {
			os.Exit(1)
		}
	case "detached":
		cmd := exec.Command(os.Args[0], "-test.run=^TestDispatcherChild$", "--", "sleep")
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
		if err := cmd.Start(); err != nil {
			os.Exit(1)
		}
		fmt.Println(cmd.Process.Pid)
	case "sleep":
		time.Sleep(time.Minute)
	}
	os.Exit(0)
}

func newTestDispatcher(args ...string) (*dispatcher, *bytes.Buffer, *bytes.Buffer) {
	stdout, stderr := &bytes.Buffer{}, &bytes.Buffer{}
	command := append([]string{os.Args[0], "-test.run=^TestDispatcherChild$", "--"}, args...)
	return &dispatcher{command: command, output: &output{stdout: stdout, stderr: stderr}, active: make(map[*exec.Cmd]struct{})}, stdout, stderr
}

func dispatchRequest() *http.Request {
	r := httptest.NewRequest("POST", "/", strings.NewReader("{}"))
	for name, value := range map[string]string{
		"Ce-Specversion":       "1.0",
		"Ce-Type":              "com.vercel.schedule.v1beta",
		"Ce-Source":            "/schedule/default/nightly",
		"Ce-Id":                "execution-id",
		"Ce-Vssscheduledat":    "2026-09-02T12:00:00Z",
		"Ce-Vssscheduleid":     "schedule-id",
		"Ce-Vssschedulename":   "nightly",
		"Ce-Vssnamespace":      "default",
		"Ce-Vssschedulesource": "static",
	} {
		r.Header.Set(name, value)
	}
	return r
}

func TestArgumentsAndEnvironment(t *testing.T) {
	t.Setenv("COMMAND_TEST_ENV", "inherited")
	t.Setenv("VERCEL_SCHEDULE_NAME", "stale")
	args := []string{"space argument", "", "$HOME", "; exit 1", "日本語"}
	d, stdout, stderr := newTestDispatcher(append([]string{"args"}, args...)...)
	w := httptest.NewRecorder()
	d.ServeHTTP(w, dispatchRequest())
	if w.Code != http.StatusNoContent {
		t.Fatalf("status=%d stderr=%q", w.Code, stderr.String())
	}
	var actual []string
	if err := json.Unmarshal(stdout.Bytes(), &actual); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(args, actual) || stderr.String() != "inherited nightly" {
		t.Fatalf("args=%q stderr=%q", actual, stderr.String())
	}
}

func TestParseCommand(t *testing.T) {
	command, err := parseCommand(`["python","job.py",""]`)
	if err != nil || !reflect.DeepEqual(command, []string{"python", "job.py", ""}) {
		t.Fatalf("command=%q err=%v", command, err)
	}
	for _, value := range []string{"", "python job.py", "[]", `[""]`, `[1]`} {
		if _, err := parseCommand(value); err == nil {
			t.Errorf("%q: expected an error", value)
		}
	}
}

func TestCompletionAndFailure(t *testing.T) {
	for _, tt := range []struct {
		mode   string
		status int
	}{{"args", 204}, {"exit", 500}} {
		t.Run(tt.mode, func(t *testing.T) {
			d, _, _ := newTestDispatcher(tt.mode)
			w := httptest.NewRecorder()
			d.ServeHTTP(w, dispatchRequest())
			if w.Code != tt.status {
				t.Fatalf("status=%d", w.Code)
			}
		})
	}
}

func TestRequestsThatDoNotExecuteCommand(t *testing.T) {
	invalid := dispatchRequest()
	invalid.Header.Del("Ce-Vssschedulename")
	for _, tt := range []struct {
		name    string
		request *http.Request
		status  int
	}{
		{"health check", httptest.NewRequest("GET", "/_vercel/ping", nil), http.StatusOK},
		{"invalid dispatch", invalid, http.StatusBadRequest},
	} {
		t.Run(tt.name, func(t *testing.T) {
			d, stdout, _ := newTestDispatcher("args")
			w := httptest.NewRecorder()
			d.ServeHTTP(w, tt.request)
			if w.Code != tt.status || stdout.Len() != 0 {
				t.Fatalf("status=%d stdout=%q", w.Code, stdout.String())
			}
		})
	}
}

func TestConcurrentIPCLogsHaveRequestContext(t *testing.T) {
	writer, reader := net.Pipe()
	defer writer.Close()
	defer reader.Close()
	messages := make(chan ipc.LogMessage, 32)
	go func() {
		decoder := json.NewDecoder(&nullReader{reader: reader})
		for {
			var msg ipc.LogMessage
			if decoder.Decode(&msg) != nil {
				close(messages)
				return
			}
			messages <- msg
		}
	}()
	d, _, _ := newTestDispatcher("logs", "output")
	d.output.ipc = ipc.NewClient(writer)
	done := make(chan error, 2)
	for _, id := range []uint64{1, 2} {
		go func(id uint64) {
			done <- d.run(context.Background(), ipc.RequestContext{InvocationID: fmt.Sprint(id), RequestID: id}, nil)
		}(id)
	}
	for i := 0; i < 2; i++ {
		if err := <-done; err != nil {
			t.Fatal(err)
		}
	}
	writer.Close()
	seen := map[uint64]map[string]bool{}
	for msg := range messages {
		ctx := msg.Payload.Context
		if msg.Type != "log" || ctx.InvocationID != fmt.Sprint(ctx.RequestID) {
			t.Fatalf("wrong context: %+v", msg)
		}
		if seen[ctx.RequestID] == nil {
			seen[ctx.RequestID] = map[string]bool{}
		}
		seen[ctx.RequestID][msg.Payload.Stream] = true
	}
	for _, id := range []uint64{1, 2} {
		if !seen[id]["stdout"] || !seen[id]["stderr"] {
			t.Fatalf("missing logs: %v", seen)
		}
	}
}

type nullReader struct{ reader io.Reader }

func (r *nullReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	for i := 0; i < n; i++ {
		if p[i] == 0 {
			p[i] = '\n'
		}
	}
	return n, err
}

type notifyWriter struct{ ready chan struct{} }

func (w notifyWriter) Write(p []byte) (int, error) {
	select {
	case w.ready <- struct{}{}:
	default:
	}
	return len(p), nil
}

func TestCancellationKillsProcess(t *testing.T) {
	d, _, _ := newTestDispatcher("wait")
	ready := make(chan struct{}, 1)
	d.output.stdout = notifyWriter{ready}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- d.run(ctx, ipc.RequestContext{}, nil) }()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("child did not start")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled command succeeded")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("child survived cancellation")
	}
}

func TestShutdownForwardsSignalAndRejectsNewWork(t *testing.T) {
	d, _, _ := newTestDispatcher("wait")
	ready := make(chan struct{}, 1)
	d.output.stdout = notifyWriter{ready}
	done := make(chan error, 1)
	go func() { done <- d.run(context.Background(), ipc.RequestContext{}, nil) }()
	select {
	case <-ready:
	case <-time.After(5 * time.Second):
		t.Fatal("child did not start")
	}
	d.stop()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("SIGTERM was not forwarded")
	}
	if err := d.run(context.Background(), ipc.RequestContext{}, nil); !errors.Is(err, errShuttingDown) {
		t.Fatalf("accepted work after shutdown: %v", err)
	}
}

func TestDescendantsCannotKeepInvocationAlive(t *testing.T) {
	d, _, _ := newTestDispatcher("descendant")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := d.run(ctx, ipc.RequestContext{}, nil); err != nil {
		t.Fatal(err)
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		t.Fatal("descendant kept output pipes open")
	}
}

// A process that leaves the group survives the kill and holds the pipes open.
func TestDetachedDescendantsCannotKeepInvocationAlive(t *testing.T) {
	d, stdout, stderr := newTestDispatcher("detached")
	done := make(chan error, 1)
	go func() { done <- d.run(context.Background(), ipc.RequestContext{}, nil) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("detached descendant kept the invocation alive")
	}
	if pid, err := strconv.Atoi(strings.TrimSpace(stdout.String())); err == nil {
		syscall.Kill(pid, syscall.SIGKILL)
	}
	if !strings.Contains(stderr.String(), "outside its process group") {
		t.Fatalf("stderr=%q", stderr.String())
	}
}

func TestUTF8AcrossReads(t *testing.T) {
	reader := &oneByteReader{data: []byte("a日本語z")}
	var output bytes.Buffer
	copyOutput(reader, func(p []byte) {
		if !json.Valid([]byte(fmt.Sprintf("%q", string(p)))) {
			t.Errorf("invalid text %q", p)
		}
		output.Write(p)
	})
	if output.String() != "a日本語z" {
		t.Fatalf("output=%q", output.String())
	}
}

type oneByteReader struct{ data []byte }

func (r *oneByteReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	p[0] = r.data[0]
	r.data = r.data[1:]
	return 1, nil
}
