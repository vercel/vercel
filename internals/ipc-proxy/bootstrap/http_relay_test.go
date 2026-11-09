package main

import (
	"errors"
	"fmt"
	"io"
	"net"
	"runtime"
	"syscall"
	"testing"
	"time"
)

func relayTCPPair(t *testing.T) (*net.TCPConn, *net.TCPConn) {
	t.Helper()
	listener, err := net.ListenTCP("tcp", &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1)})
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	listener.SetDeadline(time.Now().Add(5 * time.Second))
	peer, err := net.DialTimeout("tcp", listener.Addr().String(), 5*time.Second)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { peer.Close() })
	relay, err := listener.AcceptTCP()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { relay.Close() })
	peer.SetDeadline(time.Now().Add(5 * time.Second))
	relay.SetDeadline(time.Now().Add(5 * time.Second))
	return peer.(*net.TCPConn), relay
}

func TestHTTPRelayPreservesConnectionTermination(t *testing.T) {
	for _, direction := range []string{"client-to-backend", "backend-to-client"} {
		for _, reset := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/reset=%t", direction, reset), func(t *testing.T) {
				client, relayClient := relayTCPPair(t)
				backend, relayBackend := relayTCPPair(t)
				done := make(chan struct{})
				go func() {
					relayProxyTestConnection(relayClient, relayBackend)
					close(done)
				}()
				// Unblock both copy directions before waiting, including on failure.
				t.Cleanup(func() {
					client.Close()
					backend.Close()
					relayClient.Close()
					relayBackend.Close()
					select {
					case <-done:
					case <-time.After(5 * time.Second):
						t.Error("relay did not stop after its sockets closed")
					}
				})
				source, destination := client, backend
				if direction == "backend-to-client" {
					source, destination = backend, client
				}
				const payload = "forwarded before termination"
				if _, err := io.WriteString(source, payload); err != nil {
					t.Fatal(err)
				}
				body := make([]byte, len(payload))
				if _, err := io.ReadFull(destination, body); err != nil || string(body) != payload {
					t.Fatalf("forwarded body=%q err=%v", body, err)
				}
				// Wait for delivery above so reset cannot discard queued payload.
				if reset {
					if err := source.SetLinger(0); err != nil {
						t.Fatal(err)
					}
					if err := source.Close(); err != nil {
						t.Fatal(err)
					}
				} else if err := source.CloseWrite(); err != nil {
					t.Fatal(err)
				}
				_, err := destination.Read(make([]byte, 1))
				want := error(io.EOF)
				if reset {
					want = syscall.ECONNRESET
					if runtime.GOOS == "windows" {
						want = proxyTestWindowsReset
					}
				}
				if !errors.Is(err, want) {
					t.Fatalf("relayed termination=%v, want %v", err, want)
				}
			})
		}
	}
}
