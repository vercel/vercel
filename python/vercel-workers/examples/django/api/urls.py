from django.urls import path

from . import views

urlpatterns = [
    path("", views.home, name="home"),
    path("api/data", views.get_sample_data, name="api-data"),
    path("api/items/<int:item_id>", views.get_item, name="api-item"),
    # Task endpoints
    path("api/tasks/add", views.enqueue_add, name="task-add"),
    path("api/tasks/multiply", views.enqueue_multiply, name="task-multiply"),
    path("api/tasks/add-context", views.enqueue_add_with_context, name="task-add-context"),
    path("api/tasks/result/<str:task_id>", views.get_task_result, name="task-result"),
]
