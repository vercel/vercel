package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

const (
	proxyTestHelper     = "GO_WANT_IPC_PROXY_TEST_HELPER"
	proxyTestBarrier    = "/_ipc_proxy_test_barrier"
	proxyTestInvocation = "__ipc_proxy_test_barrier__"
)

// Re-execute the test binary to exercise the unchanged production entry point.
// Its user-server child is a byte relay to the test's HTTP handler, so malformed
// responses, upgrades and framing cross the real proxy without a second parser.
func TestMain(m *testing.M) {
	if os.Getenv(proxyTestHelper) == "1" {
		if len(os.Args) == 2 && os.Args[1] == "proxy" {
			main()
		} else {
			runProxyTestRelay()
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}

func runProxyTestRelay() {
	listener, err := net.Listen("tcp", "127.0.0.1:"+os.Getenv("PORT"))
	if err != nil {
		panic(err)
	}
	control, err := net.DialTimeout("tcp", os.Getenv("IPC_PROXY_TEST_CONTROL"), 5*time.Second)
	if err != nil {
		panic(err)
	}
	fmt.Fprintln(control, os.Getpid())
	go func() {
		io.Copy(io.Discard, control)
		os.Exit(0)
	}()
	for {
		client, err := listener.Accept()
		if err != nil {
			panic(err)
		}
		go func() {
			defer client.Close()
			backend, err := net.DialTimeout("tcp", os.Getenv("IPC_PROXY_TEST_TARGET"), 5*time.Second)
			if err != nil {
				return
			}
			defer backend.Close()
			done := make(chan struct{})
			go func() {
				_, err := io.Copy(backend, client)
				if errors.Is(err, syscall.ECONNRESET) {
					backend.(*net.TCPConn).SetLinger(0)
					backend.Close()
				}
				backend.(*net.TCPConn).CloseWrite()
				close(done)
			}()
			_, err = io.Copy(client, backend)
			if errors.Is(err, syscall.ECONNRESET) {
				client.(*net.TCPConn).SetLinger(0)
			}
			client.Close()
			<-done
		}()
	}
}

type httpScenarioFactory struct {
	name  string
	start func(testing.TB, http.Handler) (string, func())
}

var httpScenarioFactories = []httpScenarioFactory{{"original", startOriginalProxy}}

// The production entry point owns port 3000, so these process fixtures must run
// serially. Keep the active collector separate from production's IPC globals.
var activeProxyTest *proxyTestProcess

type proxyTestProcess struct {
	mu         sync.Mutex
	ends       map[string][]uint64
	expected   map[string][]uint64
	barriers   map[uint64]chan struct{}
	barrierID  uint64
	errors     []string
	started    chan struct{}
	startCount int
	collected  chan struct{}
	logs       lockedTestBuffer
}

type lockedTestBuffer struct {
	sync.Mutex
	bytes.Buffer
}

func (b *lockedTestBuffer) Write(p []byte) (int, error) {
	b.Lock()
	defer b.Unlock()
	return b.Buffer.Write(p)
}

func (b *lockedTestBuffer) String() string {
	b.Lock()
	defer b.Unlock()
	return b.Buffer.String()
}

func (p *proxyTestProcess) collect(listener net.Listener) {
	defer close(p.collected)
	conn, err := listener.Accept()
	if err != nil {
		return // Startup/cleanup reports a proxy that never connected.
	}
	defer conn.Close()
	reader := bufio.NewReader(conn)
	for {
		frame, err := reader.ReadBytes(0)
		if err == io.EOF && len(frame) == 0 {
			return
		}
		var message struct {
			Type    string `json:"type"`
			Payload struct {
				Context  RequestContext `json:"context"`
				HTTPPort int            `json:"httpPort"`
			} `json:"payload"`
		}
		p.mu.Lock()
		if err != nil {
			p.errors = append(p.errors, fmt.Sprintf("incomplete IPC frame: %q: %v", frame, err))
			p.mu.Unlock()
			return
		}
		if err := json.Unmarshal(frame[:len(frame)-1], &message); err != nil {
			p.errors = append(p.errors, fmt.Sprintf("invalid IPC: %q: %v", frame, err))
		} else {
			switch message.Type {
			case "server-started":
				p.startCount++
				if message.Payload.HTTPPort != 3000 {
					p.errors = append(p.errors, fmt.Sprintf("start port: %d", message.Payload.HTTPPort))
				}
				if p.startCount == 1 {
					close(p.started)
				}
			case "end":
				context := message.Payload.Context
				if context.InvocationID == proxyTestInvocation {
					if done := p.barriers[context.RequestID]; done != nil {
						close(done)
						delete(p.barriers, context.RequestID)
					} else {
						p.errors = append(p.errors, "unexpected/duplicate IPC barrier")
					}
				} else {
					p.ends[context.InvocationID] = append(p.ends[context.InvocationID], context.RequestID)
				}
			case "unrecoverable-error":
				// Closing the relay at teardown makes the supervisor exit.
			default:
				p.errors = append(p.errors, "unexpected IPC type: "+message.Type)
			}
		}
		p.mu.Unlock()
	}
}

func startOriginalProxy(t testing.TB, h http.Handler) (string, func()) {
	t.Helper()
	if activeProxyTest != nil {
		t.Fatal("proxy process fixtures cannot run concurrently")
	}
	reservation, err := net.Listen("tcp", "127.0.0.1:3000")
	if err != nil {
		t.Fatalf("original proxy requires unused port 3000: %v", err)
	}
	reservation.Close()
	// Keep Unix socket names below the macOS sockaddr_un path limit.
	dir, err := os.MkdirTemp("", "ipc-proxy-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	executable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	installTestExecutable(t, executable, filepath.Join(dir, "user-server"))
	if runtime.GOOS == "windows" {
		installTestExecutable(t, executable, filepath.Join(dir, "user-server.exe"))
	}
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == proxyTestBarrier {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	}))
	t.Cleanup(backend.Close)
	ipc, err := net.Listen("unix", filepath.Join(dir, "ipc.sock"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ipc.Close() })
	control, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { control.Close() })
	control.(*net.TCPListener).SetDeadline(time.Now().Add(8 * time.Second))
	p := &proxyTestProcess{
		ends: make(map[string][]uint64), expected: make(map[string][]uint64),
		barriers: make(map[uint64]chan struct{}), started: make(chan struct{}), collected: make(chan struct{}),
	}
	go p.collect(ipc)
	cmd := exec.Command(executable, "proxy")
	cmd.Dir = dir
	for _, value := range os.Environ() {
		key, _, _ := strings.Cut(value, "=")
		switch strings.ToUpper(key) {
		case "PORT", "VERCEL_IPC_PATH", "VERCEL_SERVICE_ROUTE_PREFIX", "VERCEL_SERVICE_ROUTE_PREFIX_STRIP", proxyTestHelper, "IPC_PROXY_TEST_TARGET", "IPC_PROXY_TEST_CONTROL", "GORACE":
		default:
			cmd.Env = append(cmd.Env, value)
		}
	}
	cmd.Env = append(cmd.Env, proxyTestHelper+"=1", "VERCEL_IPC_PATH="+ipc.Addr().String(),
		"IPC_PROXY_TEST_TARGET="+backend.Listener.Addr().String(), "IPC_PROXY_TEST_CONTROL="+control.Addr().String(),
		"GORACE=atexit_sleep_ms=0")
	cmd.Stdout, cmd.Stderr = &p.logs, &p.logs
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	exited := make(chan struct{})
	go func() { cmd.Wait(); close(exited) }()
	var relay net.Conn
	var relayProcess *os.Process
	var once sync.Once
	stop := func() {
		once.Do(func() {
			select {
			case <-exited:
				t.Errorf("proxy exited before teardown: %s", p.logs.String())
			default:
			}
			if relay != nil {
				relay.Close()
			}
			select {
			case <-exited:
			case <-time.After(8 * time.Second):
				t.Error("proxy did not exit after relay shutdown")
				if relayProcess != nil {
					relayProcess.Kill()
				}
				cmd.Process.Kill()
				<-exited
			}
			if cmd.ProcessState.ExitCode() != 1 {
				t.Errorf("proxy exit=%d, want supervised clean-child exit 1: %s", cmd.ProcessState.ExitCode(), p.logs.String())
			}
			if logs := p.logs.String(); strings.Contains(logs, "WARNING: DATA RACE") {
				t.Errorf("race in proxy or relay process:\n%s", logs)
			}
			if relayProcess != nil {
				relayProcess.Release()
			}
			ipc.Close()
			select {
			case <-p.collected:
			case <-time.After(5 * time.Second):
				t.Error("IPC reader did not finish after proxy exit")
			}
			backend.CloseClientConnections()
			backend.Close()
			p.audit(t)
			activeProxyTest = nil
		})
	}
	t.Cleanup(stop)
	relay, err = control.Accept()
	if err != nil {
		t.Fatalf("user server relay did not start: %v\n%s", err, p.logs.String())
	}
	relay.SetReadDeadline(time.Now().Add(5 * time.Second))
	pid, err := bufio.NewReader(relay).ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	relay.SetReadDeadline(time.Time{})
	if number, err := strconv.Atoi(strings.TrimSpace(pid)); err == nil {
		relayProcess, _ = os.FindProcess(number)
	} else {
		t.Fatalf("invalid relay PID: %q", pid)
	}
	control.Close()
	select {
	case <-p.started:
	case <-exited:
		t.Fatalf("proxy failed to start: %s", p.logs.String())
	case <-time.After(8 * time.Second):
		t.Fatalf("missing server-started IPC: %s", p.logs.String())
	}
	activeProxyTest = p
	deadline := time.Now().Add(5 * time.Second)
	for {
		conn, err := net.DialTimeout("tcp", "127.0.0.1:3000", 100*time.Millisecond)
		if err == nil {
			conn.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("proxy not listening: %s", p.logs.String())
		}
		time.Sleep(5 * time.Millisecond)
	}
	ipcBarrier(t)
	return "http://127.0.0.1:3000", stop
}

func installTestExecutable(t testing.TB, source, target string) {
	t.Helper()
	if os.Link(source, target) == nil {
		return
	}
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, data, 0755); err != nil {
		t.Fatal(err)
	}
}

func (p *proxyTestProcess) audit(t testing.TB) {
	t.Helper()
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.startCount != 1 {
		t.Errorf("server-started IPC count=%d, want 1", p.startCount)
	}
	for _, err := range p.errors {
		t.Error(err)
	}
	for invocation, ids := range p.ends {
		seen := make(map[uint64]bool)
		for _, id := range ids {
			if seen[id] {
				t.Errorf("duplicate end IPC for %s/%d", invocation, id)
			}
			seen[id] = true
		}
	}
	for invocation, expected := range p.expected {
		if got := sortedIDs(p.ends[invocation]); !reflect.DeepEqual(got, expected) {
			t.Errorf("final end IPC for %s: got %v want %v", invocation, got, expected)
		}
	}
}

// A marker traverses the same production IPC writer as scenario completions.
// Waiting for its frame avoids racing the collector in negative assertions.
func ipcBarrier(t testing.TB) {
	t.Helper()
	p := activeProxyTest
	p.mu.Lock()
	p.barrierID++
	id := p.barrierID
	done := make(chan struct{})
	p.barriers[id] = done
	p.mu.Unlock()
	transport := &http.Transport{DisableKeepAlives: true}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 5 * time.Second}
	r, _ := http.NewRequest("GET", "http://127.0.0.1:3000"+proxyTestBarrier, nil)
	r.Header.Set("X-Vercel-Internal-Invocation-Id", proxyTestInvocation)
	r.Header.Set("X-Vercel-Internal-Request-Id", strconv.FormatUint(id, 10))
	response, err := client.Do(r)
	if err != nil {
		t.Fatalf("IPC barrier request: %v\n%s", err, p.logs.String())
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("IPC barrier status=%d", response.StatusCode)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatalf("missing IPC barrier\n%s", p.logs.String())
	}
}

func sortedIDs(ids []uint64) []uint64 {
	result := append([]uint64{}, ids...)
	sort.Slice(result, func(i, j int) bool { return result[i] < result[j] })
	return result
}

func completions(invocation string) []uint64 {
	p := activeProxyTest
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]uint64(nil), p.ends[invocation]...)
}

func assertCompletionIDs(t *testing.T, invocation string, expected ...uint64) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for len(completions(invocation)) < len(expected) && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}
	ipcBarrier(t)
	want := sortedIDs(expected)
	if got := sortedIDs(completions(invocation)); !reflect.DeepEqual(got, want) {
		t.Fatalf("end IPC for %s: got %v want %v", invocation, got, want)
	}
	p := activeProxyTest
	p.mu.Lock()
	p.expected[invocation] = want
	p.mu.Unlock()
}

func scenarioConn(t testing.TB, address string) (net.Conn, *bufio.Reader) {
	t.Helper()
	conn, err := net.DialTimeout("tcp", strings.TrimPrefix(address, "http://"), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	return conn, bufio.NewReader(conn)
}

func scenarioResponse(t testing.TB, reader *bufio.Reader, method string) (*http.Response, []byte) {
	t.Helper()
	response, err := http.ReadResponse(reader, &http.Request{Method: method})
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	return response, body
}

func scenarioWrite(t testing.TB, writer io.Writer, value string) {
	t.Helper()
	if _, err := io.WriteString(writer, value); err != nil {
		t.Fatal(err)
	}
}
