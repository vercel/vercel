from __future__ import annotations


class CronTab:
    def get_crons(self):
        """Return cron entries for dynamic detection."""
        return [
            ("jobs.sync:daily_sync", "0 0 * * *"),
            ("jobs.report:generate_report", "0 6 * * 1"),
            ("jobs.sync:every_minute", "*/1 * * * *"),
            ("jobs.report:every_five", "*/5 * * * *"),
        ]


crontab = CronTab()
