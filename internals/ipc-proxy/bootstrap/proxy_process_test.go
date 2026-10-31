package main

import (
	"bufio"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestProxySupervisesChildExitBeforeAndAfterStartup(t *testing.T) {
	for _, timing := range []string{"before", "after"} {
		for _, code := range []int{0, 7} {
			t.Run(fmt.Sprintf("%s/%d", timing, code), func(t *testing.T) {
				reservation, err := net.Listen("tcp", "127.0.0.1:3000")
				if err != nil {
					t.Fatal(err)
				}
				reservation.Close()
				dir, executable := proxyTestDirectory(t)
				ipc, err := net.Listen("unix", filepath.Join(dir, "ipc.sock"))
				if err != nil {
					t.Fatal(err)
				}
				defer ipc.Close()
				control, err := net.Listen("tcp", "127.0.0.1:0")
				if err != nil {
					t.Fatal(err)
				}
				defer control.Close()
				control.(*net.TCPListener).SetDeadline(time.Now().Add(8 * time.Second))
				p := newProxyTestProcess()
				if timing == "before" {
					p.wantStarts = 0
				}
				go p.collect(ipc)
				cmd := exec.Command(executable, "proxy")
				cmd.Dir = dir
				cmd.Env = append(proxyTestEnvironment(), "VERCEL_IPC_PATH="+ipc.Addr().String(), "IPC_PROXY_TEST_CONTROL="+control.Addr().String())
				if timing == "before" {
					cmd.Env = append(cmd.Env, "IPC_PROXY_TEST_EXIT="+strconv.Itoa(code))
				}
				cmd.Stdout, cmd.Stderr = &p.logs, &p.logs
				if err := cmd.Start(); err != nil {
					t.Fatal(err)
				}
				exited := make(chan struct{})
				go func() { cmd.Wait(); close(exited) }()
				var relay net.Conn
				var relayProcess *os.Process
				defer func() {
					if relay != nil {
						relay.Close()
					}
					select {
					case <-exited:
					case <-time.After(3 * time.Second):
						if relayProcess != nil {
							relayProcess.Kill()
						}
						cmd.Process.Kill()
						<-exited
					}
					if relayProcess != nil {
						relayProcess.Release()
					}
					ipc.Close()
					select {
					case <-p.collected:
					case <-time.After(5 * time.Second):
						t.Error("IPC collector did not finish")
					}
				}()
				if timing == "after" {
					relay, err = control.Accept()
					if err != nil {
						t.Fatalf("relay startup: %v\n%s", err, p.logs.String())
					}
					relay.SetDeadline(time.Now().Add(8 * time.Second))
					line, err := bufio.NewReader(relay).ReadString('\n')
					if err != nil {
						t.Fatal(err)
					}
					pid, err := strconv.Atoi(strings.TrimSpace(line))
					if err != nil {
						t.Fatal(err)
					}
					relayProcess, _ = os.FindProcess(pid)
					select {
					case <-p.started:
					case <-exited:
						t.Fatalf("proxy exited during startup: %s", p.logs.String())
					case <-time.After(8 * time.Second):
						t.Fatal("missing server-started IPC")
					}
					// Confirm that the public server is serving, rather than only
					// observing the IPC frame emitted before ListenAndServe.
					deadline := time.Now().Add(5 * time.Second)
					for {
						conn, err := net.DialTimeout("tcp", "127.0.0.1:3000", 100*time.Millisecond)
						if err == nil {
							conn.SetDeadline(deadline)
							io.WriteString(conn, "GET /_vercel/ping HTTP/1.1\r\nHost: test\r\nConnection: close\r\n\r\n")
							response, err := http.ReadResponse(bufio.NewReader(conn), nil)
							if err != nil {
								conn.Close()
								t.Fatal(err)
							}
							body, err := io.ReadAll(response.Body)
							response.Body.Close()
							conn.Close()
							if err != nil || response.StatusCode != 200 || string(body) != "OK" {
								t.Fatalf("startup health: %d %q %v", response.StatusCode, body, err)
							}
							break
						}
						if time.Now().After(deadline) {
							t.Fatalf("proxy did not start listening: %v", err)
						}
						time.Sleep(time.Millisecond)
					}
					if _, err := fmt.Fprintln(relay, code); err != nil {
						t.Fatal(err)
					}
				}
				select {
				case <-exited:
				case <-time.After(8 * time.Second):
					t.Fatalf("proxy did not exit: %s", p.logs.String())
				}
				select {
				case <-p.collected:
				case <-time.After(5 * time.Second):
					t.Fatal("missing IPC EOF")
				}
				want := code
				if want == 0 {
					want = 1
				}
				if got := cmd.ProcessState.ExitCode(); got != want {
					t.Fatalf("proxy exit=%d want=%d\n%s", got, want, p.logs.String())
				}
				p.audit(t)
				p.mu.Lock()
				defer p.mu.Unlock()
				if len(p.fatals) != 1 || p.fatals[0].ExitCode != code || !strings.Contains(p.fatals[0].Message, "user server") {
					t.Fatalf("fatal IPC=%+v", p.fatals)
				}
				if strings.Contains(p.logs.String(), "WARNING: DATA RACE") {
					t.Fatalf("child race:\n%s", p.logs.String())
				}
			})
		}
	}
}
