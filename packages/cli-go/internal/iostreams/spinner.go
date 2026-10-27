package iostreams

import (
	"fmt"
	"sync"
	"time"
)

// The spinner is util/output/wait.ts: off a terminal, the message prints
// once.

var spinnerFrames = []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}

type spinner struct {
	mu      sync.Mutex
	text    string
	started bool
	stop    chan struct{}
	done    chan struct{}
}

// StartSpinner replaces the message of a spinner already showing.
func (u *UI) StartSpinner(message string) {
	switch {
	case u.debug:
		u.Debug(fmt.Sprintf("Spinner invoked (%s) with a 300ms delay", message))
		return
	case !u.stderrTTY:
		u.Print(message + "\n")
		return
	case u.spinner != nil:
		u.spinner.mu.Lock()
		u.spinner.text = message
		u.spinner.mu.Unlock()
		return
	}
	sp := &spinner{text: message, stop: make(chan struct{}), done: make(chan struct{})}
	u.spinner = sp
	go func() {
		defer close(sp.done)
		select {
		case <-sp.stop:
			return
		case <-time.After(300 * time.Millisecond):
		}
		ticker := time.NewTicker(80 * time.Millisecond)
		defer ticker.Stop()
		cs := u.ColorScheme()
		for i := 0; ; i++ {
			sp.mu.Lock()
			sp.started = true
			fmt.Fprintf(u.errOut, "\r\x1b[2K%s %s", cs.Gray(spinnerFrames[i%len(spinnerFrames)]), cs.Gray(sp.text))
			sp.mu.Unlock()
			select {
			case <-sp.stop:
				return
			case <-ticker.C:
			}
		}
	}()
}

func (u *UI) StopSpinner() {
	sp := u.spinner
	if sp == nil {
		return
	}
	u.spinner = nil
	close(sp.stop)
	<-sp.done
	if sp.started {
		fmt.Fprint(u.errOut, "\r\x1b[2K")
	}
}
