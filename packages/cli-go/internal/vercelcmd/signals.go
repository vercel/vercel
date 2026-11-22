package vercelcmd

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"syscall"
)

// notifySignals cancels ctx on SIGINT, SIGTERM or SIGHUP.
func notifySignals(parent context.Context) context.Context {
	ctx, cancel := context.WithCancelCause(parent)
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)
	go func() { cancel(signalError{<-ch}) }()
	return ctx
}

type signalError struct{ os.Signal }

func (e signalError) Error() string { return e.String() }

func received(ctx context.Context) os.Signal {
	var e signalError
	if errors.As(context.Cause(ctx), &e) {
		return e.Signal
	}
	return nil
}

// signalExit: SIGINT keeps the command's code (login exits 0); SIGTERM and
// SIGHUP exit 128 + the signal, as Node does.
func signalExit(code int, sig os.Signal) int {
	if s, ok := sig.(syscall.Signal); ok && s != syscall.SIGINT {
		return 128 + int(s)
	}
	return code
}
