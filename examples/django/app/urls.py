"""URL configuration for app project."""
from django.urls import path

from . import views

urlpatterns = [
    path('', views.index),
    path('api/data', views.api_data),
]
