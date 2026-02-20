from tasks import QUEUE_NAME, broker

from vercel.workers.dramatiq import PollingWorker

__all__ = ["broker"]


def main() -> None:
    print(
        "[local_worker] starting polling worker",
        {"queue": QUEUE_NAME},
    )

    worker = PollingWorker(broker, queue_name=QUEUE_NAME, debug=True)
    worker.start()


if __name__ == "__main__":
    main()
