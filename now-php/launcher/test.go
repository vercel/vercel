package main

import (
  "bytes"
  "fmt"
  "net/http"
  "os"
  "path"
  "path/filepath"
  "strings"
  php "github.com/deuill/go-php"
)

var public = ""

func handler() {
  engine, _ := php.New()
  context, _ := engine.NewContext()

  var bodyReader = strings.NewReader("Message=from test.go")
  var httpReq, _ = http.NewRequest("POST", "/dummy/path", bodyReader)
  httpReq.Header.Add("Content-Type", "application/x-www-form-urlencoded")
  httpReq.ParseForm()

  postMap := make(map[string]string)
  for k, v := range httpReq.PostForm {
    for _, s := range v {
      postMap[k] = s
    }
  }

  context.Bind("_POST", postMap)
  var stdout bytes.Buffer
  context.Output = &stdout
  context.Exec(path.Join(public, "test.php"))

  for k, v := range context.Header {
    // see https://golang.org/src/net/http/header.go function writeSubset
    for _, s := range v {
      fmt.Printf("%s: %s\n", k, s)
    }
  }

  fmt.Printf("\n")
  fmt.Println(stdout.String())
  engine.Destroy()
}

func main() {
  ex, _ := os.Executable()
  public = path.Join(filepath.Dir(ex), "public")
  fmt.Printf("public %s\n", path.Join(filepath.Dir(ex), "public"))
  handler()
}
