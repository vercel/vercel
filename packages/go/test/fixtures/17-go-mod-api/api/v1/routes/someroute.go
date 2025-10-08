package routes

import (
	"fmt"
	"net/http"
	"runtime"

	"github.com/vercel/does-not-exist/api/_pkg/somepackage"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "version:%v:%v", runtime.Version(), somepackage.Foo)
}
