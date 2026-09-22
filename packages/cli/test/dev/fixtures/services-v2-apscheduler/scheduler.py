from datetime import datetime, timezone
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler

RESULTS_DIR = Path(__file__).parent / ".results"

scheduler = BackgroundScheduler()


@scheduler.scheduled_job("interval", seconds=2, id="tick")
def tick() -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat()
    with open(RESULTS_DIR / "ticks.log", "a") as log:
        log.write(f"{stamp}\n")
