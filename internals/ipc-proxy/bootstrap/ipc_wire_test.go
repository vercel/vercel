package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
	"testing"
	"time"

	"ipc-proxy/ipc"
)

func TestIPCJSONEscapesAndConcurrentFrames(t *testing.T) {
	names := []string{"ipc-wire-plain", "ipc-wire-quote\"slash\\", "ipc-wire-control\x00\n\t", "ipc-wire-<>&", "ipc-wire-こんにちは\u2028\u2029"}
	const perName = 64
	writer, reader := net.Pipe()
	defer reader.Close()
	defer writer.Close()
	writer.SetDeadline(time.Now().Add(8 * time.Second))
	reader.SetDeadline(time.Now().Add(8 * time.Second))
	client := ipc.NewClient(writer)
	decoded := make(chan error, 1)
	go func() {
		defer reader.Close()
		seen := make(map[ipc.RequestContext]bool)
		validNames := make(map[string]bool)
		for _, name := range names {
			validNames[name] = true
		}
		buffer := bufio.NewReader(reader)
		for i := 0; i < len(names)*perName; i++ {
			frame, err := buffer.ReadBytes(0)
			if err != nil {
				decoded <- err
				return
			}
			var message ipc.EndMessage
			if err := json.Unmarshal(frame[:len(frame)-1], &message); err != nil {
				decoded <- err
				return
			}
			context := message.Payload.Context
			if message.Type != "end" || !validNames[context.InvocationID] || context.RequestID < 1 || context.RequestID > perName || seen[context] {
				decoded <- fmt.Errorf("invalid/duplicate IPC message: %+v", message)
				return
			}
			seen[context] = true
		}
		if _, err := buffer.ReadByte(); err != io.EOF {
			decoded <- fmt.Errorf("unexpected trailing IPC bytes: %v", err)
			return
		}
		decoded <- nil
	}()
	var wg sync.WaitGroup
	for _, name := range names {
		wg.Add(1)
		go func(inv string) {
			defer wg.Done()
			for id := uint64(1); id <= perName; id++ {
				if err := client.Send(ipc.EndMessage{Type: "end", Payload: ipc.EndPayload{Context: ipc.RequestContext{InvocationID: inv, RequestID: id}}}); err != nil {
					t.Error(err)
					return
				}
			}
		}(name)
	}
	wg.Wait()
	writer.Close()
	if err := <-decoded; err != nil {
		t.Fatal(err)
	}
}
