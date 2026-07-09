package main

import (
	"flag"
	"log"
	"os"
	"text/template"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var addr = flag.String("addr", "", "HTTP service address")

var upgrader = websocket.Upgrader{}

func echo(ctx *gin.Context) {
	w, r := ctx.Writer, ctx.Request
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade:", err)
		return
	}
	defer func() { _ = c.Close() }()

	for {
		messageType, message, err := c.ReadMessage()
		if err != nil {
			log.Println("read:", err)
			break
		}
		log.Printf("recv: %s", message)
		if err := c.WriteMessage(messageType, message); err != nil {
			log.Println("write:", err)
			break
		}
	}
}

func home(ctx *gin.Context) {
	scheme := "ws"
	if ctx.Request.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "wss"
	}
	_ = homeTemplate.Execute(
		ctx.Writer,
		scheme+"://"+ctx.Request.Host+"/echo",
	)
}

func main() {
	flag.Parse()
	log.SetFlags(0)

	listenAddr := *addr
	if listenAddr == "" {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8080"
		}
		listenAddr = ":" + port
	}

	r := gin.Default()
	r.GET("/echo", echo)
	r.GET("/", home)
	log.Fatal(r.Run(listenAddr))
}

var homeTemplate = template.Must(template.New("").Parse(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
window.addEventListener("load", function() {
    var output = document.getElementById("output");
    var input = document.getElementById("input");
    var ws;
    var print = function(message) {
        var d = document.createElement("div");
        d.textContent = message;
        output.appendChild(d);
        output.scroll(0, output.scrollHeight);
    };
    document.getElementById("open").onclick = function() {
        if (ws) {
            return false;
        }
        ws = new WebSocket("{{.}}");
        ws.onopen = function() {
            print("OPEN");
        };
        ws.onclose = function() {
            print("CLOSE");
            ws = null;
        };
        ws.onmessage = function(evt) {
            print("RESPONSE: " + evt.data);
        };
        ws.onerror = function(evt) {
            print("ERROR: " + evt.data);
        };
        return false;
    };
    document.getElementById("send").onclick = function() {
        if (!ws) {
            return false;
        }
        print("SEND: " + input.value);
        ws.send(input.value);
        return false;
    };
    document.getElementById("close").onclick = function() {
        if (!ws) {
            return false;
        }
        ws.close();
        return false;
    };
});
</script>
</head>
<body>
<table>
<tr><td valign="top" width="50%">
<p>Click "Open" to create a connection to the server,
"Send" to send a message to the server and "Close" to close the connection.
You can change the message and send multiple times.</p>
<form>
<button id="open">Open</button>
<button id="close">Close</button>
<p><input id="input" type="text" value="Hello world!"></p>
<button id="send">Send</button>
</form>
</td><td valign="top" width="50%">
<div id="output" style="max-height: 70vh; overflow-y: scroll;"></div>
</td></tr></table>
</body>
</html>
`))
