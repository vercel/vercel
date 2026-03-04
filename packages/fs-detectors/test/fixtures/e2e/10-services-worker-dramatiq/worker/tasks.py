import dramatiq


@dramatiq.actor(queue_name='jobs')
def process_job(payload: dict):
    return {'ok': True, 'payload': payload}
