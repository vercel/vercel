package main

import (
	"errors"
	"os/exec"
	"testing"
)

func TestChildExitCode(t *testing.T) {
	t.Run("nil error reports 1", func(t *testing.T) {
		if code := childExitCode(nil); code != 1 {
			t.Errorf("expected 1, got %d", code)
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
