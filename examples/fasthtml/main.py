from fasthtml.common import *

app, rt = fast_app()


@rt("/")
def get():
    return Title("FastHTML"), H1("Hello World!")


serve()
