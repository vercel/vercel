//go:build unix

package vercelcmd

import (
	"context"
	"os"
	"syscall"
	"testing"
	"time"
)

func TestSignalExit(t *testing.T) {
	cases := []struct {
		code int
		sig  os.Signal
		want int
	}{
		{0, nil, 0},
		{1, nil, 1},
		{130, syscall.SIGINT, 130},
		{0, syscall.SIGINT, 0}, // login ends quietly on Ctrl-C
		{130, syscall.SIGTERM, 143},
		{0, syscall.SIGTERM, 143},
		{130, syscall.SIGHUP, 129},
	}
	for _, c := range cases {
		if got := signalExit(c.code, c.sig); got != c.want {
			t.Errorf("signalExit(%d, %v) = %d, want %d", c.code, c.sig, got, c.want)
		}
	}
}

func TestNotifySignalsCancelsOnSIGTERM(t *testing.T) {
	ctx := notifySignals(context.Background())
	if err := syscall.Kill(os.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	select {
	case <-ctx.Done():
	case <-time.After(5 * time.Second):
		t.Fatal("context was not canceled")
	}
	if received(ctx) != syscall.SIGTERM {
		t.Errorf("received %v", received(ctx))
	}
}
