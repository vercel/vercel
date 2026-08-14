import dramatiq
from vercel.cache import get_cache


def _record_processed(topic: str, payload: dict) -> None:
    request_id = payload.get('request_id') if isinstance(payload, dict) else None
    if not request_id:
        return
    cache = get_cache(namespace=topic)
    cache.set(
        str(request_id),
        {'ok': True, 'topic': topic, 'payload': payload},
        options={'ttl': 300},
    )


@dramatiq.actor(queue_name='emails')
def send_email(payload: dict):
    _record_processed('emails', payload)
    return {'ok': True, 'topic': 'emails', 'payload': payload}


@dramatiq.actor(queue_name='reports')
def generate_report(payload: dict):
    _record_processed('reports', payload)
    return {'ok': True, 'topic': 'reports', 'payload': payload}
