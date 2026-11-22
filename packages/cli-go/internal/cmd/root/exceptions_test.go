package root

import (
	"sync"
	"testing"
)

// exceptions are the only places a convention test lets a command break a
// rule, each with its reason, usually that today's CLI does it and a
// ported command keeps today's behavior. Adding one is a reviewed line
// here: rule, then subject, then reason.
var exceptions = map[string]map[string]string{
	"look-alike": {
		"--count": "`teams ls` still accepts the deprecated --count, as upstream",
	},
	"verb": {},
	"login": {
		"login": "`vercel login` is the command whose action is logging in",
	},
}

var (
	usedMu sync.Mutex
	used   = map[string]bool{}
)

// excepted reports whether subject may break rule, and records the use so
// TestExceptionsAreUsed can find stale ones.
func excepted(t *testing.T, rule, subject string) bool {
	t.Helper()
	_, ok := exceptions[rule][subject]
	if ok {
		usedMu.Lock()
		used[rule+" "+subject] = true
		usedMu.Unlock()
	}
	return ok
}

// Every exception is still needed: run the tests that consult them, then
// check that each was used.
func TestExceptionsAreUsed(t *testing.T) {
	t.Run("flags", TestFlagNames)
	t.Run("names", TestCommandNames)
	t.Run("bypass", TestCommandsDoNotBypassTheFramework)
	for rule, subjects := range exceptions {
		for subject, reason := range subjects {
			switch {
			case reason == "":
				t.Errorf("exception %s %s has no reason", rule, subject)
			case !used[rule+" "+subject]:
				t.Errorf("exception %s %s is no longer needed; remove it", rule, subject)
			}
		}
	}
}
