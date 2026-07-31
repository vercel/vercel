package vercel

import (
	"encoding/binary"
	"encoding/json"
	"io"
	"math"
	"os"
	"strconv"
	"sync"
)

const controlFDEnv = "VERCEL_RUNTIME_CONTROL_FD"

type controlFrame struct {
	Version    int         `json:"version"`
	Type       string      `json:"type"`
	RequestKey string      `json:"requestKey"`
	Payload    interface{} `json:"payload"`
}

var controlState struct {
	sync.Mutex
	fd   string
	file *os.File
}

func sendFrame(frameType, requestKey string, payload interface{}) bool {
	body, err := json.Marshal(controlFrame{
		Version:    1,
		Type:       frameType,
		RequestKey: requestKey,
		Payload:    payload,
	})
	if err != nil || len(body) > math.MaxUint32 {
		return false
	}

	controlState.Lock()
	defer controlState.Unlock()

	w := controlWriterLocked()
	if w == nil {
		return false
	}

	var prefix [4]byte
	binary.BigEndian.PutUint32(prefix[:], uint32(len(body)))
	if err := writeAll(w, prefix[:]); err != nil {
		return false
	}
	return writeAll(w, body) == nil
}

func controlWriterLocked() io.Writer {
	fd := os.Getenv(controlFDEnv)
	if fd == "" {
		return nil
	}
	if controlState.file != nil && controlState.fd == fd {
		return controlState.file
	}

	n, err := strconv.ParseUint(fd, 10, 64)
	if err != nil {
		return nil
	}
	controlState.fd = fd
	controlState.file = os.NewFile(uintptr(n), "vercel-runtime-control")
	return controlState.file
}

func writeAll(w io.Writer, data []byte) error {
	for len(data) > 0 {
		n, err := w.Write(data)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		data = data[n:]
	}
	return nil
}
