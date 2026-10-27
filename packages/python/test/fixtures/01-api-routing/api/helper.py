# this file does not export an app or handler so it should not create a lambda and /api/helper should return 404

def helper():
    return 'Hello, world!'
