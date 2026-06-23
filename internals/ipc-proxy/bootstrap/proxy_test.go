package main

import (
	"errors"
	"os/exec"
	"testing"
)

func TestChildExitCode(t *testing.T) {
	t.Run("nil error reports 0", func(t *testing.T) {
		if code := childExitCode(nil); code != 0 {
			t.Errorf("expected 0, got %d", code)
		}
	})

	t.Run("non-exit error reports 1", func(t *testing.T) {
		if code := childExitCode(errors.New("boom")); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})

	t.Run("child exit code is preserved", func(t *testing.T) {
		err := exec.Command("sh", "-c", "exit 7").Run()
		if code := childExitCode(err); code != 7 {
			t.Errorf("expected 7, got %d", code)
		}
	})

	t.Run("signal-terminated child reports 1", func(t *testing.T) {
		cmd := exec.Command("sleep", "10")
		if err := cmd.Start(); err != nil {
			t.Fatal(err)
		}
		if err := cmd.Process.Kill(); err != nil {
			t.Fatal(err)
		}
		err := cmd.Wait()
		// ExitCode() is -1 for signal-terminated processes
		if code := childExitCode(err); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})
}

func TestProxyExitCode(t *testing.T) {
	t.Run("clean child exit is fatal for proxy", func(t *testing.T) {
		if code := proxyExitCode(0); code != 1 {
			t.Errorf("expected 1, got %d", code)
		}
	})

	t.Run("child exit code is preserved for proxy", func(t *testing.T) {
		if code := proxyExitCode(7); code != 7 {
			t.Errorf("expected 7, got %d", code)
		}
	})
}

func TestChildExitMessage(t *testing.T) {
	msg := childExitMessage(nil, "exited unexpectedly")
	expected := "Expected a long-running server process, but the user server exited unexpectedly with exit code 0"
	if msg != expected {
		t.Errorf("expected %q, got %q", expected, msg)
	}
}
