package ipc

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"testing"
)

func TestConcurrentMessagesKeepTheirFrames(t *testing.T) {
	writer, reader := net.Pipe()
	defer writer.Close()
	defer reader.Close()
	client := NewClient(writer)
	var writers sync.WaitGroup
	for i := 0; i < 20; i++ {
		writers.Add(1)
		go func(id int) {
			defer writers.Done()
			if err := client.Send(EndMessage{Type: "end", Payload: EndPayload{Context: RequestContext{InvocationID: fmt.Sprint(id), RequestID: uint64(id)}}}); err != nil {
				t.Error(err)
			}
		}(i)
	}
	go func() { writers.Wait(); client.Close() }()
	frames := bufio.NewReader(reader)
	seen := make(map[uint64]bool)
	for i := 0; i < 20; i++ {
		frame, err := frames.ReadBytes(0)
		if err != nil {
			t.Fatal(err)
		}
		var message EndMessage
		if err := json.Unmarshal(frame[:len(frame)-1], &message); err != nil {
			t.Fatal(err)
		}
		ctx := message.Payload.Context
		if message.Type != "end" || ctx.InvocationID != fmt.Sprint(ctx.RequestID) || seen[ctx.RequestID] {
			t.Fatalf("invalid frame %s", frame)
		}
		seen[ctx.RequestID] = true
	}
}

func TestLifecycleWireFormat(t *testing.T) {
	tests := []struct {
		message interface{}
		want    string
	}{
		{StartMessage{Type: "server-started", Payload: StartPayload{InitDuration: 12, HTTPPort: 3000}}, `{"type":"server-started","payload":{"initDuration":12,"httpPort":3000}}`},
		{EndMessage{Type: "end", Payload: EndPayload{Context: RequestContext{InvocationID: "inv", RequestID: 42}}}, `{"type":"end","payload":{"context":{"invocationId":"inv","requestId":42}}}`},
		{LogMessage{Type: "log", Payload: LogPayload{Message: "aGVsbG8=", Stream: "stdout", Context: RequestContext{InvocationID: "inv", RequestID: 42}}}, `{"type":"log","payload":{"message":"aGVsbG8=","stream":"stdout","context":{"invocationId":"inv","requestId":42}}}`},
		{UnrecoverableErrorMessage{Type: "unrecoverable-error", Payload: UnrecoverableErrorPayload{ExitCode: 7, Message: "exit"}}, `{"type":"unrecoverable-error","payload":{"exitCode":7,"message":"exit"}}`},
	}
	for _, tt := range tests {
		data, err := json.Marshal(tt.message)
		if err != nil || string(data) != tt.want {
			t.Fatalf("got %s, %v; want %s", data, err, tt.want)
		}
	}
	var client *Client
	if err := client.Send(tests[0].message); err != nil {
		t.Fatal(err)
	}
}
