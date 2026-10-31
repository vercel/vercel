package cli

import (
	"errors"
	"fmt"

	"github.com/vercel/vercel/packages/cli-go/internal/auth"
)

// Error is what commands return instead of printing; startup prints it.
type Error struct {
	Message string // printed as "Error: <message>"
	// Hint is indented under the message, which then uses the "✗" layout.
	Hint string
	// Link adds an "<Action>: <link>" line; Action defaults to "Learn More".
	Link, Action string
	// Help is printed after the error.
	Help string
	// Next are recovery commands, likeliest first (at most two).
	Next []*Next
	// NotAuthorized marks InvalidToken.
	NotAuthorized bool
	// Exit 0 means 1: a printed error never exits 0.
	Exit int
	// Silent: already reported. Nothing is printed and Exit is used as is.
	Silent bool
}

func (e *Error) Error() string {
	if e.Silent && e.Message == "" {
		return fmt.Sprintf("exit %d", e.Exit)
	}
	return e.Message
}

func (e *Error) ExitCode() int {
	if e.Exit == 0 && !e.Silent {
		return 1
	}
	return e.Exit
}

func Errorf(format string, a ...any) *Error { return &Error{Message: fmt.Sprintf(format, a...)} }

func Silent(code int) *Error { return &Error{Silent: true, Exit: code} }

func IsNotAuthorized(err error) bool {
	var e *Error
	return errors.As(err, &e) && e.NotAuthorized
}

// InvalidToken is errors-ts.ts InvalidToken, worded for the token's source.
func InvalidToken(source auth.Source) *Error {
	msg := "The specified token is not valid. Use `vercel login` to generate a new token."
	switch source {
	case auth.FromFlag:
		msg = "The token provided via `--token` argument is not valid. Please provide a valid token."
	case auth.FromEnv:
		msg = "The token provided via VERCEL_TOKEN environment variable is not valid. Please provide a valid token."
	}
	return &Error{NotAuthorized: true, Message: msg}
}
