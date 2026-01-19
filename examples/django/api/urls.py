from django.urls import path

from . import views


urlpatterns = [
    path("", views.home, name="home"),
    path("api/data", views.get_sample_data, name="api-data"),
    path("api/items/<int:item_id>", views.get_item, name="api-item"),
]
