import dramatiq


@dramatiq.actor(queue_name="orders")
def process_order(payload: dict):
    return {"ok": True, "payload": payload}


@dramatiq.actor(queue_name="events")
def process_event(payload: dict):
    return {"ok": True, "payload": payload}
