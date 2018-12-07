package main

import (
	"bytes"
	"fmt"
	php "github.com/deuill/go-php"
)

func main() {
	engine, _ := php.New()
	context, _ := engine.NewContext()
	var stdout bytes.Buffer
	context.Output = &stdout
	context.Exec("test.php")
	fmt.Println(stdout.String())
	engine.Destroy()
}
