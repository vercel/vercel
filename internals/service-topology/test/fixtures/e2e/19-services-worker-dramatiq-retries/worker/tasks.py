import dramatiq
from vercel.cache import get_cache

FAIL_UNTIL_ATTEMPT = 7


@dramatiq.actor(queue_name='jobs', max_retries=10, min_backoff=500, max_backoff=2000)
def flaky_job(payload: dict):
    request_id = str(payload['request_id'])
    cache = get_cache(namespace='jobs')

    attempts_key = f'{request_id}:attempts'
    attempts = int(cache.get(attempts_key) or 0) + 1
    cache.set(attempts_key, attempts, options={'ttl': 300})

    if attempts < FAIL_UNTIL_ATTEMPT:
        raise RuntimeError(f'transient failure on attempt {attempts}')

    cache.set(
        request_id,
        {
            'ok': True,
            'attempts': attempts,
            'summary': f'processed after {attempts} attempts',
            'payload': payload,
        },
        options={'ttl': 300},
    )
    return {'ok': True, 'attempts': attempts}
