from django.http import HttpResponse


def index(request):
    return HttpResponse('django:RANDOMNESS_PLACEHOLDER')
