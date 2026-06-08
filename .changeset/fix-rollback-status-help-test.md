---
---

Fix `rollback status help column width 120` snapshot test that was calling `help(rollback.rollbackCommand, ...)` instead of `help(rollback.statusSubcommand, { parent: rollback.rollbackCommand })`. The test was effectively duplicating the `rollback help` snapshot above it and not exercising the `status` subcommand help output. The companion `promote status` test at line 760-767 already follows the correct pattern.
