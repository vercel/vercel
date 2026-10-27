package ipc

import (
	"encoding/json"
	"net"
	"sync"
	"time"
)

// Client serializes null-delimited JSON messages on one runtime connection.
// A nil client is a no-op, allowing adapters to run without a runtime socket.
type Client struct {
	mu      sync.Mutex
	conn    net.Conn
	timeout time.Duration
}

// Dial connects to the runtime socket. A non-zero timeout bounds the dial and
// every later write, so a stalled runtime cannot block the caller.
func Dial(path string, timeout time.Duration) (*Client, error) {
	conn, err := net.DialTimeout("unix", path, timeout)
	if err != nil {
		return nil, err
	}
	return &Client{conn: conn, timeout: timeout}, nil
}

func NewClient(conn net.Conn) *Client { return &Client{conn: conn} }

func (c *Client) Send(message interface{}) error {
	if c == nil {
		return nil
	}
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.timeout != 0 {
		if err := c.conn.SetWriteDeadline(time.Now().Add(c.timeout)); err != nil {
			return err
		}
	}
	_, err = c.conn.Write(append(data, 0))
	return err
}

func (c *Client) Close() error {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn.Close()
}
