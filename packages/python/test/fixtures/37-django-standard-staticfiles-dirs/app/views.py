from django.http import HttpResponse
def index(request):
    return HttpResponse('<link rel="stylesheet" href="/static/style.css">Hello from Django')
