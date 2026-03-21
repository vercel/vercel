package bootstrap_test

import (
	"sync/atomic"
	"testing"
	"time"

	"main/bootstrap"
)

func TestInitLogForwarderFlushToIPCBlocksNewLogsUntilBufferedDrainCompletes(t *testing.T) {
	first := bootstrap.LogMessage{Type: "first"}
	second := bootstrap.LogMessage{Type: "second"}

	firstForwardStarted := make(chan struct{})
	firstForwardRelease := make(chan struct{})
	secondForwardStarted := make(chan struct{})
	forwarded := make(chan bootstrap.LogMessage, 2)
	unexpectedLocal := make(chan bootstrap.LogMessage, 1)

	var forwardCalls atomic.Int32
	forwarder := bootstrap.NewInitLogForwarder(
		4,
		func() bool { return true },
		func(msg bootstrap.LogMessage) {
			switch forwardCalls.Add(1) {
			case 1:
				close(firstForwardStarted)
				<-firstForwardRelease
			case 2:
				close(secondForwardStarted)
			}
			forwarded <- msg
		},
		func(msg bootstrap.LogMessage) {
			unexpectedLocal <- msg
		},
	)

	forwarder.Emit(first)

	flushDone := make(chan struct{})
	go func() {
		forwarder.FlushToIPC()
		close(flushDone)
	}()

	<-firstForwardStarted

	emitStarted := make(chan struct{})
	emitDone := make(chan struct{})
	go func() {
		close(emitStarted)
		forwarder.Emit(second)
		close(emitDone)
	}()

	<-emitStarted

	select {
	case <-secondForwardStarted:
		t.Fatal("expected new log emission to wait until buffered drain completes")
	case msg := <-unexpectedLocal:
		t.Fatalf("unexpected local output while flushing to IPC: %+v", msg)
	case <-time.After(50 * time.Millisecond):
	}

	close(firstForwardRelease)

	select {
	case <-flushDone:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for buffered log flush to complete")
	}

	select {
	case <-emitDone:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for concurrent log emission to complete")
	}

	firstForwarded := <-forwarded
	secondForwarded := <-forwarded
	if firstForwarded != first {
		t.Fatalf("expected first forwarded log to be %+v, got %+v", first, firstForwarded)
	}
	if secondForwarded != second {
		t.Fatalf("expected second forwarded log to be %+v, got %+v", second, secondForwarded)
	}

	select {
	case msg := <-unexpectedLocal:
		t.Fatalf("unexpected local output after IPC flush: %+v", msg)
	default:
	}
}

func TestInitLogForwarderFlushToLocalOutputDoesNotRebufferNewLogs(t *testing.T) {
	first := bootstrap.LogMessage{Type: "first"}
	second := bootstrap.LogMessage{Type: "second"}

	forwarded := make(chan bootstrap.LogMessage, 1)
	local := make(chan bootstrap.LogMessage, 1)
	forwarder := bootstrap.NewInitLogForwarder(
		4,
		func() bool { return true },
		func(msg bootstrap.LogMessage) {
			forwarded <- msg
		},
		func(msg bootstrap.LogMessage) {
			local <- msg
		},
	)

	forwarder.Emit(first)
	forwarder.FlushToLocalOutput()
	forwarder.Emit(second)

	if got := <-local; got != first {
		t.Fatalf("expected buffered log to flush to local output as %+v, got %+v", first, got)
	}

	if got := <-forwarded; got != second {
		t.Fatalf("expected new log to forward directly after local flush as %+v, got %+v", second, got)
	}

	select {
	case msg := <-local:
		t.Fatalf("unexpected extra local output: %+v", msg)
	default:
	}
}

func TestInitLogForwarderFlushToIPCDrainsBufferedLogsInOrder(t *testing.T) {
	first := bootstrap.LogMessage{Type: "first"}
	second := bootstrap.LogMessage{Type: "second"}

	forwarded := make(chan bootstrap.LogMessage, 2)
	unexpectedLocal := make(chan bootstrap.LogMessage, 1)
	forwarder := bootstrap.NewInitLogForwarder(
		4,
		func() bool { return true },
		func(msg bootstrap.LogMessage) {
			forwarded <- msg
		},
		func(msg bootstrap.LogMessage) {
			unexpectedLocal <- msg
		},
	)

	forwarder.Emit(first)
	forwarder.Emit(second)
	forwarder.FlushToIPC()

	if got := <-forwarded; got != first {
		t.Fatalf("expected first flushed log to be %+v, got %+v", first, got)
	}

	if got := <-forwarded; got != second {
		t.Fatalf("expected second flushed log to be %+v, got %+v", second, got)
	}

	select {
	case msg := <-unexpectedLocal:
		t.Fatalf("unexpected local output during IPC flush: %+v", msg)
	default:
	}
}
