import dramatiq


@dramatiq.actor(queue_name='emails')
def send_email(payload: dict):
    return {'ok': True, 'topic': 'emails', 'payload': payload}


@dramatiq.actor(queue_name='reports')
def generate_report(payload: dict):
    return {'ok': True, 'topic': 'reports', 'payload': payload}
