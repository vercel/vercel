import json
import os


RESULT_DIR = os.path.join(os.path.dirname(__file__), ".results")


def write_result(
    queue: str, request_id: str, x: int, y: int
) -> dict[str, str | int]:
    os.makedirs(RESULT_DIR, exist_ok=True)
    result = {"requestId": request_id, "priority": queue, "sum": x + y}
    with open(os.path.join(RESULT_DIR, f"{queue}.json"), "w") as f:
        json.dump(result, f)
    return result
