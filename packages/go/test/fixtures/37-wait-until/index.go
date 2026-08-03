package handler

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	vercel "github.com/vercel/go-runtime"
)

var completed uint32

func Handler(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/warm":
		fmt.Fprint(w, "warm")
	case "/status":
		if atomic.LoadUint32(&completed) == 1 {
			fmt.Fprint(w, "complete")
			return
		}
		fmt.Fprint(w, "pending")
	default:
		atomic.StoreUint32(&completed, 0)
		vercel.WaitUntil(r.Context(), func() {
			time.Sleep(5 * time.Second)
			atomic.StoreUint32(&completed, 1)
		})
		fmt.Fprint(w, "scheduled")
	}
}
