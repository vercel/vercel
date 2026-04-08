import json
import os
import sys

RESULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".results")


def main():
    os.makedirs(RESULT_DIR, exist_ok=True)
    with open(os.path.join(RESULT_DIR, "cron_result.json"), "w") as f:
        json.dump({"executed": True, "mode": sys.argv[1]}, f)


if __name__ == "__main__":
    main()
