package main

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"testing"
)

type fragmentedReader struct {
	data []byte
	max  int
}

func (r *fragmentedReader) Read(buffer []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.EOF
	}
	if len(buffer) > r.max {
		buffer = buffer[:r.max]
	}
	n := copy(buffer, r.data)
	r.data = r.data[n:]
	return n, nil
}

func encodeRuntimeControlFrame(t *testing.T, frame interface{}) []byte {
	t.Helper()
	body, err := json.Marshal(frame)
	if err != nil {
		t.Fatal(err)
	}
	return encodeRuntimeControlBody(body)
}

func encodeRuntimeControlBody(body []byte) []byte {
	frame := make([]byte, 4+len(body))
	binary.BigEndian.PutUint32(frame[:4], uint32(len(body)))
	copy(frame[4:], body)
	return frame
}

func runtimeRequestSnapshot(control *runtimeControl, key string) (runtimeRequest, bool) {
	control.mu.Lock()
	defer control.mu.Unlock()
	request, ok := control.requests[key]
	if !ok {
		return runtimeRequest{}, false
	}
	return *request, true
}

func TestRuntimeControlReadsFragmentedAndCoalescedFrames(t *testing.T) {
	control := newRuntimeControl(nil)
	key := control.registerRequest("invocation", 17)
	control.endRequest(key)

	frames := bytes.Join([][]byte{
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "retain", RequestKey: key}),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "request-complete", RequestKey: key}),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "release", RequestKey: key}),
	}, nil)
	control.reader = &fragmentedReader{data: frames, max: 3}
	control.run()

	if _, ok := runtimeRequestSnapshot(control, key); ok {
		t.Fatal("request was not cleaned up after all coalesced frames were read")
	}
}

func TestRuntimeControlLifecycleCleanup(t *testing.T) {
	control := newRuntimeControl(bytes.NewReader(nil))
	key := control.registerRequest("invocation", 42)

	control.handleFrame(runtimeControlFrame{Version: 1, Type: "retain", RequestKey: key})
	control.handleFrame(runtimeControlFrame{Version: 1, Type: "retain", RequestKey: key})
	control.handleFrame(runtimeControlFrame{Version: 1, Type: "request-complete", RequestKey: key})
	control.endRequest(key)

	request, ok := runtimeRequestSnapshot(control, key)
	if !ok {
		t.Fatal("request was cleaned up while retains remained")
	}
	if !request.ended || !request.requestComplete || request.retains != 2 {
		t.Fatalf("unexpected lifecycle state: %+v", request)
	}

	control.handleFrame(runtimeControlFrame{Version: 1, Type: "release", RequestKey: key})
	if request, ok = runtimeRequestSnapshot(control, key); !ok || request.retains != 1 {
		t.Fatalf("request should remain with one retain: %+v, present=%v", request, ok)
	}

	control.handleFrame(runtimeControlFrame{Version: 1, Type: "release", RequestKey: key})
	if _, ok := runtimeRequestSnapshot(control, key); ok {
		t.Fatal("request remained after end, completion, and final release")
	}
}

func TestRuntimeControlCleanupRequiresEndAndCompletion(t *testing.T) {
	tests := []struct {
		name     string
		end      bool
		complete bool
		present  bool
	}{
		{name: "neither", present: true},
		{name: "end only", end: true, present: true},
		{name: "completion only", complete: true, present: true},
		{name: "end and completion", end: true, complete: true, present: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			control := newRuntimeControl(bytes.NewReader(nil))
			key := control.registerRequest("invocation", 1)
			// An unmatched release must not underflow the retain count.
			control.handleFrame(runtimeControlFrame{Version: 1, Type: "release", RequestKey: key})
			if test.complete {
				control.handleFrame(runtimeControlFrame{Version: 1, Type: "request-complete", RequestKey: key})
			}
			if test.end {
				control.endRequest(key)
			}
			_, present := runtimeRequestSnapshot(control, key)
			if present != test.present {
				t.Fatalf("request presence = %v, want %v", present, test.present)
			}
		})
	}
}

func TestRuntimeControlSkipsInvalidFramesAndContinues(t *testing.T) {
	control := newRuntimeControl(nil)
	key := control.registerRequest("invocation", 5)
	control.endRequest(key)

	oversized := bytes.Repeat([]byte{'x'}, maxRuntimeControlFrameSize+1)
	frames := bytes.Join([][]byte{
		encodeRuntimeControlBody(oversized),
		encodeRuntimeControlBody([]byte(`{"version":`)),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 2, Type: "request-complete", RequestKey: key}),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "request-complete", RequestKey: "unknown"}),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "unknown", RequestKey: key}),
		encodeRuntimeControlFrame(t, runtimeControlFrame{Version: 1, Type: "request-complete", RequestKey: key}),
	}, nil)
	control.reader = bytes.NewReader(frames)
	control.run()

	if _, ok := runtimeRequestSnapshot(control, key); ok {
		t.Fatal("valid frame after invalid frames was not processed")
	}
}

func TestRuntimeControlLogTranslation(t *testing.T) {
	control := newRuntimeControl(bytes.NewReader(nil))
	key := control.registerRequest("inv-123", 42)
	message := control.handleFrame(runtimeControlFrame{
		Version:    1,
		Type:       "log",
		RequestKey: key,
		Payload:    json.RawMessage(`{"message":"hello","level":"warn"}`),
	})

	encoded, err := json.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"type":"log","payload":{"context":{"invocationId":"inv-123","requestId":42},"message":"aGVsbG8=","level":"warn"}}`
	if string(encoded) != want {
		t.Fatalf("log JSON = %s, want %s", encoded, want)
	}

	for _, payload := range []json.RawMessage{
		json.RawMessage(`{"message":"missing level"}`),
		json.RawMessage(`{"message":7,"level":"info"}`),
		json.RawMessage(`not-json`),
	} {
		if got := control.handleFrame(runtimeControlFrame{Version: 1, Type: "log", RequestKey: key, Payload: payload}); got != nil {
			t.Fatalf("malformed log payload produced %#v", got)
		}
	}
}

func TestRuntimeControlMetricTranslationPreservesPayload(t *testing.T) {
	control := newRuntimeControl(bytes.NewReader(nil))
	key := control.registerRequest("inv-456", 99)
	payload := json.RawMessage(`{"pathname":"/api","duration":45,"extra":{"ok":true}}`)
	message := control.handleFrame(runtimeControlFrame{
		Version:    1,
		Type:       "fetch-metric",
		RequestKey: key,
		Payload:    payload,
	})

	metric, ok := message.(MetricMessage)
	if !ok {
		t.Fatalf("message type = %T, want MetricMessage", message)
	}
	if !bytes.Equal(metric.Payload.Payload, payload) {
		t.Fatalf("metric payload = %s, want %s", metric.Payload.Payload, payload)
	}
	encoded, err := json.Marshal(metric)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"type":"metric","payload":{"context":{"invocationId":"inv-456","requestId":99},"type":"fetch-metric","payload":{"pathname":"/api","duration":45,"extra":{"ok":true}}}}`
	if string(encoded) != want {
		t.Fatalf("metric JSON = %s, want %s", encoded, want)
	}
}

func TestRuntimeControlIgnoresUnknownRequests(t *testing.T) {
	control := newRuntimeControl(bytes.NewReader(nil))
	for _, frameType := range []string{"retain", "release", "request-complete", "log", "fetch-metric"} {
		if message := control.handleFrame(runtimeControlFrame{
			Version:    1,
			Type:       frameType,
			RequestKey: "unknown",
			Payload:    json.RawMessage(`{}`),
		}); message != nil {
			t.Fatalf("%s frame for unknown request produced %#v", frameType, message)
		}
	}
	control.endRequest("unknown")
}

func TestRuntimeControlConcurrentRegistration(t *testing.T) {
	control := newRuntimeControl(bytes.NewReader(nil))
	const count = 100

	keys := make(chan string, count)
	var wait sync.WaitGroup
	for i := 0; i < count; i++ {
		wait.Add(1)
		go func(requestID uint64) {
			defer wait.Done()
			keys <- control.registerRequest(fmt.Sprintf("inv-%d", requestID), requestID)
		}(uint64(i))
	}
	wait.Wait()
	close(keys)

	seen := make(map[string]bool, count)
	for key := range keys {
		if seen[key] {
			t.Fatalf("duplicate request key %q", key)
		}
		seen[key] = true
	}
	if len(seen) != count {
		t.Fatalf("registered %d unique keys, want %d", len(seen), count)
	}
}
