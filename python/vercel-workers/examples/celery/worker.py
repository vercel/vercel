from tasks import QUEUE_NAME, app


def main() -> None:
    print(
        "[local_worker] starting polling worker",
        {"queue": QUEUE_NAME},
    )

    worker = app.PollingWorker(queue_name=QUEUE_NAME)
    worker.start()


if __name__ == "__main__":
    main()
