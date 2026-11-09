//go:build unix

package main

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"ipc-proxy/ipc"
	"sync"
	"unicode/utf8"
)

type output struct {
	mu     sync.Mutex
	ipc    *ipc.Client
	stdout io.Writer
	stderr io.Writer
}

func (o *output) write(ctx ipc.RequestContext, stream string, data []byte) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.ipc != nil && ctx.InvocationID != "" {
		message := ipc.LogMessage{Type: "log", Payload: ipc.LogPayload{
			Message: base64.StdEncoding.EncodeToString(data), Stream: stream, Context: ctx,
		}}
		if err := o.ipc.Send(message); err == nil {
			return
		}

		o.ipc.Close()
		o.ipc = nil
		fmt.Fprintln(o.stderr, "Command dispatcher lost IPC logging; falling back to container output.")
	}
	writer := o.stdout
	if stream == "stderr" {
		writer = o.stderr
	}
	writer.Write(data)
}

// Preserve UTF-8 characters that straddle pipe reads: the IPC consumer decodes
// each message independently. Invalid user bytes are replaced just as text logs.
func copyOutput(reader io.Reader, emit func([]byte)) {
	buffer := make([]byte, 32*1024+utf8.UTFMax)
	pending := 0
	for {
		n, err := reader.Read(buffer[pending:])
		end := pending + n
		complete := end
		if err == nil {
			for complete > 0 && !utf8.RuneStart(buffer[complete-1]) {
				complete--
			}
			if complete > 0 && !utf8.FullRune(buffer[complete-1:end]) {
				complete--
			} else {
				complete = end
			}
		}
		if complete > 0 {
			emit(bytes.ToValidUTF8(buffer[:complete], []byte("�")))
		}
		pending = copy(buffer, buffer[complete:end])
		if err != nil {
			return
		}
	}
}
