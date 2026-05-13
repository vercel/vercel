import dramatiq
from vercel.cache import get_cache


@dramatiq.actor(queue_name='jobs')
def process_job(payload: dict):
    request_id = payload.get('request_id')
    if request_id:
        cache = get_cache(namespace='jobs')
        cache.set(
            str(request_id),
            {'ok': True, 'topic': 'jobs', 'payload': payload},
            options={'ttl': 300},
        )
    return {'ok': True, 'payload': payload}
