package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"testing/iotest"
)

// Inject the terminal read error while exercising the real collector, including
// its buffering, JSON decoding and complete-frame handling.
type collectorReadConn struct {
	net.Conn
	reader io.Reader
}

func (c collectorReadConn) Read(p []byte) (int, error) { return c.reader.Read(p) }
func (c collectorReadConn) Close() error               { return nil }

func TestIPCCollectorStreamTermination(t *testing.T) {
	const frames = "{\"type\":\"server-started\",\"payload\":{\"httpPort\":3000}}\x00" +
		"{\"type\":\"end\",\"payload\":{\"context\":{\"invocationId\":\"collector\",\"requestId\":7}}}\x00"
	reset := &net.OpError{Op: "read", Net: "unix", Err: os.NewSyscallError("wsarecv", proxyTestWindowsReset)}
	for _, tc := range []struct {
		name      string
		data      string
		err       error
		wantError bool
	}{
		{"empty EOF", "", io.EOF, false},
		{"complete frames then EOF", frames, io.EOF, false},
		{"empty Windows reset", "", reset, runtime.GOOS != "windows"},
		{"complete frames then Windows reset", frames, reset, runtime.GOOS != "windows"},
		{"partial frame then EOF", frames + "{", io.EOF, true},
		{"partial frame then Windows reset", frames + "{", reset, true},
		{"empty unexpected EOF", "", io.ErrUnexpectedEOF, true},
		{"empty timeout", "", fmt.Errorf("read: %w", os.ErrDeadlineExceeded), true},
		{"invalid JSON", frames + "invalid\x00", io.EOF, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := newProxyTestProcess()
			p.collectConnection(collectorReadConn{reader: io.MultiReader(strings.NewReader(tc.data), iotest.ErrReader(tc.err))})
			select {
			case <-p.collected:
			default:
				t.Fatal("collector did not report termination")
			}
			if got := len(p.errors) != 0; got != tc.wantError {
				t.Fatalf("collector errors=%v, wantError=%t", p.errors, tc.wantError)
			}
			if strings.HasPrefix(tc.data, frames) {
				if p.startCount != 1 || !reflect.DeepEqual(p.ends["collector"], []uint64{7}) {
					t.Fatalf("complete frames lost: starts=%d ends=%v", p.startCount, p.ends)
				}
			}
		})
	}
}
