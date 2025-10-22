import time

def app(environ, start_response):
    status = '200 OK'
    headers = [('Content-Type', 'text/plain')]
    start_response(status, headers)

    def generate():
        yield b"It's working if you see the numbers being printed once per second:\n"
        for i in range(1, 6):
            print(i)
            yield f"{i}\n".encode()
            time.sleep(1)
    return generate()
