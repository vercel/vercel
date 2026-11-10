package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type pipeHijackResponseWriter struct {
	conn       net.Conn
	readWriter *bufio.ReadWriter
	header     http.Header
}

func (w *pipeHijackResponseWriter) Header() http.Header {
	return w.header
}

func (w *pipeHijackResponseWriter) Write(data []byte) (int, error) {
	return w.readWriter.Write(data)
}

func (w *pipeHijackResponseWriter) WriteHeader(_ int) {}

func (w *pipeHijackResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.conn, w.readWriter, nil
}

func helperCommand(t *testing.T, mode string) *exec.Cmd {
	t.Helper()
	cmd := exec.Command(os.Args[0], "-test.run=^TestHelperProcess$", "--", mode)
	cmd.Env = append(os.Environ(), "GO_WANT_HELPER_PROCESS=1")
	return cmd
}

func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}

	switch os.Args[len(os.Args)-1] {
	case "exit-7":
		os.Exit(7)
	case "sleep":
		time.Sleep(time.Hour)
		os.Exit(0)
	default:
		os.Exit(2)
	}
}

func TestChildExitCode(t *testing.T) {
	t.Run("nil error reports 0", func(t *testing.T) {
		if code := childExitCode(nil); code != 0 {
			t.Errorf("expected 0, got %d", code)
		}
	})

	t.Run("non-exit error reports 1", func(t *testing.T) {
		if code := childExitCode(errors.New("boom")); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})

	t.Run("child exit code is preserved", func(t *testing.T) {
		err := helperCommand(t, "exit-7").Run()
		if code := childExitCode(err); code != 7 {
			t.Errorf("expected 7, got %d", code)
		}
	})

	t.Run("killed child reports 1", func(t *testing.T) {
		cmd := helperCommand(t, "sleep")
		if err := cmd.Start(); err != nil {
			t.Fatal(err)
		}
		if err := cmd.Process.Kill(); err != nil {
			t.Fatal(err)
		}
		err := cmd.Wait()
		// Killed processes map to the proxy's generic failure code.
		if code := childExitCode(err); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})
}

func TestProxyExitCode(t *testing.T) {
	t.Run("clean child exit is fatal for proxy", func(t *testing.T) {
		if code := proxyExitCode(0); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})

	t.Run("child exit code is preserved for proxy", func(t *testing.T) {
		if code := proxyExitCode(7); code != 7 {
			t.Errorf("expected 7, got %d", code)
		}
	})
}

func TestChildExitMessage(t *testing.T) {
	msg := childExitMessage(nil, "exited unexpectedly")
	expected := "Expected a long-running server process, but the user server exited unexpectedly with exit code 0"
	if msg != expected {
		t.Errorf("expected %q, got %q", expected, msg)
	}
}

func TestHijackAwareResponseWriterOnlyReportsSuccessfulHijack(t *testing.T) {
	recorder := httptest.NewRecorder()
	called := false
	w := &hijackAwareResponseWriter{
		ResponseWriter: recorder,
		onUpgrade:      func() { called = true },
	}

	if _, _, err := w.Hijack(); !errors.Is(err, http.ErrNotSupported) {
		t.Fatalf("expected ErrNotSupported, got %v", err)
	}
	if called {
		t.Fatal("hijack callback ran after a failed hijack")
	}
}

func TestHijackAwareResponseWriterReportsAfterHandshakeFlush(t *testing.T) {
	clientConn, serverConn := net.Pipe()
	defer clientConn.Close()
	defer serverConn.Close()

	ended := make(chan struct{})
	underlying := &pipeHijackResponseWriter{
		conn: serverConn,
		readWriter: bufio.NewReadWriter(
			bufio.NewReader(serverConn),
			bufio.NewWriter(serverConn),
		),
		header: make(http.Header),
	}
	w := &hijackAwareResponseWriter{
		ResponseWriter: underlying,
		onUpgrade:      func() { close(ended) },
	}

	_, readWriter, err := w.Hijack()
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-ended:
		t.Fatal("request ended before the handshake was written")
	default:
	}

	handshake := []byte(
		"HTTP/1.1 101 Switching Protocols\r\n" +
			"Connection: Upgrade\r\n" +
			"Upgrade: websocket\r\n\r\n",
	)
	flushed := make(chan error, 1)
	go func() {
		if _, err := readWriter.Write(handshake); err != nil {
			flushed <- err
			return
		}
		flushed <- readWriter.Flush()
	}()

	if err := clientConn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}
	received := make([]byte, len(handshake))
	if _, err := io.ReadFull(clientConn, received); err != nil {
		t.Fatal(err)
	}
	if string(received) != string(handshake) {
		t.Fatalf("unexpected handshake %q", received)
	}
	if err := <-flushed; err != nil {
		t.Fatal(err)
	}
	select {
	case <-ended:
	case <-time.After(5 * time.Second):
		t.Fatal("request did not end after the handshake was flushed")
	}
}

func TestServeWithUpgradeLifecyclePreservesOrdinaryResponses(t *testing.T) {
	var endCount atomic.Int32
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "http://example.com/", nil)
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if got := endCount.Load(); got != 0 {
			t.Fatalf("request ended before the handler returned: %d", got)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte("created"))
	})

	serveWithUpgradeLifecycle(handler, recorder, request, func() {
		endCount.Add(1)
	})

	if recorder.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d", recorder.Code)
	}
	if body := recorder.Body.String(); body != "created" {
		t.Fatalf("unexpected response body %q", body)
	}
	if got := endCount.Load(); got != 1 {
		t.Fatalf("expected one end callback, got %d", got)
	}
}

func TestUpgradeEndsRequestBeforeTunnelCloses(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.EqualFold(r.Header.Get("Upgrade"), "websocket") {
			http.Error(w, "expected websocket upgrade", http.StatusBadRequest)
			return
		}

		conn, readWriter, err := http.NewResponseController(w).Hijack()
		if err != nil {
			t.Errorf("backend hijack failed: %v", err)
			return
		}
		defer conn.Close()

		_, _ = readWriter.WriteString(
			"HTTP/1.1 101 Switching Protocols\r\n" +
				"Connection: Upgrade\r\n" +
				"Upgrade: websocket\r\n\r\n",
		)
		if err := readWriter.Flush(); err != nil {
			t.Errorf("backend handshake flush failed: %v", err)
			return
		}

		message, err := readWriter.ReadString('\n')
		if err != nil {
			return
		}
		_, _ = readWriter.WriteString("echo:" + message)
		_ = readWriter.Flush()
	}))
	defer backend.Close()

	targetURL, err := url.Parse(backend.URL)
	if err != nil {
		t.Fatal(err)
	}
	proxy := httputil.NewSingleHostReverseProxy(targetURL)

	var endCount atomic.Int32
	requestEnded := make(chan struct{})
	handlerReturned := make(chan struct{})
	frontend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		serveWithUpgradeLifecycle(proxy, w, r, func() {
			endCount.Add(1)
			close(requestEnded)
		})
		close(handlerReturned)
	}))
	defer frontend.Close()

	frontendURL, err := url.Parse(frontend.URL)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := net.DialTimeout("tcp", frontendURL.Host, 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if err := conn.SetDeadline(time.Now().Add(5 * time.Second)); err != nil {
		t.Fatal(err)
	}

	if _, err := fmt.Fprintf(
		conn,
		"GET /ws HTTP/1.1\r\nHost: %s\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
		frontendURL.Host,
	); err != nil {
		t.Fatal(err)
	}

	reader := bufio.NewReader(conn)
	response, err := http.ReadResponse(reader, &http.Request{Method: http.MethodGet})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101, got %s", response.Status)
	}

	select {
	case <-requestEnded:
	case <-time.After(5 * time.Second):
		t.Fatal("request did not end at the upgrade boundary")
	}
	select {
	case <-handlerReturned:
		t.Fatal("proxy handler returned before the upgraded tunnel closed")
	default:
	}

	if _, err := conn.Write([]byte("ping\n")); err != nil {
		t.Fatal(err)
	}
	echo, err := reader.ReadString('\n')
	if err != nil {
		t.Fatal(err)
	}
	if echo != "echo:ping\n" {
		t.Fatalf("unexpected tunneled response %q", echo)
	}

	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-handlerReturned:
	case <-time.After(5 * time.Second):
		t.Fatal("proxy handler did not return after the tunnel closed")
	}
	if got := endCount.Load(); got != 1 {
		t.Fatalf("expected one end callback, got %d", got)
	}
}
