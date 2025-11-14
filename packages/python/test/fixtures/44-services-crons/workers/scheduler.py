import time


def main():
    print("running cron job...")
    time.sleep(3)
    message = "cron job completed"
    print(message)
    return message
