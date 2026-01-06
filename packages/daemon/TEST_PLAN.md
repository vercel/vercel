# Vercel Token Refresh Daemon - Comprehensive Test Plan

## Overview

This document outlines the comprehensive testing strategy for the Vercel Token Refresh Daemon. The daemon proactively refreshes OAuth (CLI auth) and OIDC (per-project) tokens in the background.

## Test Coverage Status

### ✅ Completed (45 tests passing)

- **RetryStrategy unit tests** (13 tests)
- **PIDManager unit tests** (18 tests)
- **Integration tests** (14 tests)

### 📋 Manual Testing Required

Manual testing focuses on real-world scenarios that are difficult to automate.

---

## Manual Test Plan

### Phase 1: Installation & Setup

#### 1.1 Daemon Installation (macOS)

**Prerequisites:** macOS system, Vercel CLI built

**Test Steps:**

1. Run `vercel daemon install`
2. Verify output shows success message
3. Check launchd plist exists: `ls ~/Library/LaunchAgents/com.vercel.daemon.plist`
4. Verify plist contents with `cat ~/Library/LaunchAgents/com.vercel.daemon.plist`
5. Check service is loaded: `launchctl list | grep vercel`

**Expected Results:**

- Installation succeeds without errors
- Plist file created with correct paths
- Service appears in launchctl list
- Log directory created at `~/Library/Application Support/com.vercel.cli/logs/`

**Pass Criteria:** All files created, no errors

---

#### 1.2 Daemon Installation (Linux - if available)

**Prerequisites:** Linux system, Vercel CLI built

**Test Steps:**

1. Run `vercel daemon install`
2. Check systemd unit: `systemctl --user list-units | grep vercel`
3. Verify unit file: `cat ~/.config/systemd/user/vercel-daemon.service`

**Expected Results:**

- Unit file created with correct paths
- Service enabled for auto-start (if --auto-start not disabled)

**Pass Criteria:** Service installed, no errors

---

### Phase 2: Daemon Lifecycle

#### 2.1 Manual Start

**Prerequisites:** Daemon not running

**Test Steps:**

1. Run `vercel daemon start`
2. Wait 2 seconds
3. Run `vercel daemon status`
4. Check logs: `vercel daemon logs`

**Expected Results:**

```
Vercel daemon starting...
Daemon process started with PID [number]
Token manager initialized
IPC server listening on [socket-path]
Daemon started successfully
```

**Pass Criteria:**

- Status shows "Daemon is running"
- Logs show successful initialization
- No errors in output

---

#### 2.2 Daemon Status Reporting

**Prerequisites:** Daemon running

**Test Steps:**

1. Run `vercel daemon status`
2. Run `vercel daemon status --json`
3. Verify output format

**Expected Results:**

- Human-readable shows "Daemon is running"
- Shows tracked project count
- Shows OAuth token validity
- JSON output is valid JSON with correct structure

**Pass Criteria:** Status accurately reflects daemon state

---

#### 2.3 Stop Daemon

**Prerequisites:** Daemon running

**Test Steps:**

1. Run `vercel daemon stop`
2. Wait 2 seconds
3. Run `vercel daemon status`
4. Check logs for shutdown message

**Expected Results:**

- Stop command succeeds
- Status shows "Daemon is not running"
- Logs show graceful shutdown
- PID file removed
- Socket file cleaned up

**Pass Criteria:** Daemon stops cleanly, resources released

---

#### 2.4 PID File Enforcement

**Prerequisites:** Daemon running

**Test Steps:**

1. Start daemon: `vercel daemon start`
2. Try to start again: `vercel daemon start`
3. Check second start fails appropriately

**Expected Results:**

- Second start fails with message about existing daemon
- First daemon continues running
- Only one daemon process exists

**Pass Criteria:** Single instance enforcement works

---

### Phase 3: Token Refresh Integration

#### 3.1 OAuth Token Discovery on Startup

**Prerequisites:** Valid `auth.json` with OAuth token

**Setup:**

1. Run `vercel login` to get valid auth token
2. Stop daemon if running
3. Start daemon

**Test Steps:**

1. Check logs: `vercel daemon logs | grep OAuth`
2. Verify OAuth refresh cycle starts
3. Check status: `vercel daemon status`

**Expected Results:**

- Logs show "Starting OAuth token refresh cycle"
- If token is valid, scheduled for refresh 15min before expiry
- Status shows OAuth token as "Valid" with expiration time

**Pass Criteria:** OAuth token detected and managed

---

#### 3.2 OIDC Token Discovery on Startup

**Prerequisites:** At least one linked project with OIDC token

**Setup:**

1. Link a project: `cd [project] && vercel link`
2. Stop and restart daemon

**Test Steps:**

1. Check logs: `vercel daemon logs | grep "Discovered.*OIDC"`
2. Run `vercel daemon status`
3. Verify project count

**Expected Results:**

- Logs show "Discovered N OIDC tokens"
- Status shows tracked projects list
- Each discovered project added to refresh cycle

**Pass Criteria:** Existing tokens discovered on startup

---

#### 3.3 Project Link Notification

**Prerequisites:** Daemon running

**Test Steps:**

1. Link a new project: `vercel link`
2. Immediately check daemon logs: `vercel daemon logs`
3. Check daemon status: `vercel daemon status`

**Expected Results:**

- Logs show "Received IPC message" with type add-project
- Project appears in tracked projects list
- No errors in logs

**Pass Criteria:** Daemon notified of new link

---

#### 3.4 Project Relink (Unlink + Link)

**Prerequisites:** Daemon running, existing linked project

**Test Steps:**

1. Relink project: `vercel link` (choose different project)
2. Check daemon logs
3. Verify status shows new project

**Expected Results:**

- Logs show remove-project for old project
- Logs show add-project for new project
- Status reflects current project only

**Pass Criteria:** Project tracking updates correctly

---

### Phase 4: IPC Communication

#### 4.1 Status Query via IPC

**Prerequisites:** Daemon running

**Test Steps:**

```bash
echo '{"type":"status"}' | nc -U ~/Library/Application\ Support/com.vercel.cli/daemon.sock
```

**Expected Results:**

```json
{"success":true,"data":{"status":"running","projects":[...],"oauth":{...}}}
```

**Pass Criteria:** Valid JSON response with status data

---

#### 4.2 Add Project via IPC

**Prerequisites:** Daemon running

**Test Steps:**

```bash
echo '{"type":"add-project","payload":{"projectId":"test-proj","teamId":"team-123"}}' | \
  nc -U ~/Library/Application\ Support/com.vercel.cli/daemon.sock
```

**Expected Results:**

```json
{ "success": true }
```

**Pass Criteria:** Project added, no errors

---

#### 4.3 Shutdown via IPC

**Prerequisites:** Daemon running

**Test Steps:**

```bash
echo '{"type":"shutdown"}' | nc -U ~/Library/Application\ Support/com.vercel.cli/daemon.sock
```

**Expected Results:**

- Response: `{"success":true}`
- Daemon shuts down gracefully
- Logs show clean shutdown

**Pass Criteria:** Daemon stops via IPC command

---

### Phase 5: Error Handling & Edge Cases

#### 5.1 No Auth Token

**Prerequisites:** No `auth.json` file

**Test Steps:**

1. Remove auth: `rm ~/Library/Application\ Support/com.vercel.cli/auth.json`
2. Start daemon
3. Check logs

**Expected Results:**

- Daemon starts successfully
- Logs show warning about missing OAuth token
- Daemon retries OAuth refresh with backoff
- Daemon continues operating

**Pass Criteria:** Graceful handling of missing OAuth token

---

#### 5.2 Invalid Socket Permissions

**Prerequisites:** Daemon not running

**Test Steps:**

1. Create socket file with wrong permissions:
   ```bash
   touch ~/Library/Application\ Support/com.vercel.cli/daemon.sock
   chmod 000 ~/Library/Application\ Support/com.vercel.cli/daemon.sock
   ```
2. Start daemon
3. Check if stale socket is cleaned

**Expected Results:**

- Daemon removes stale socket
- Creates new socket with correct permissions
- Starts successfully

**Pass Criteria:** Stale socket handling works

---

#### 5.3 Daemon Crash Recovery

**Prerequisites:** Daemon running

**Test Steps:**

1. Get daemon PID: `vercel daemon status` or check logs
2. Kill daemon forcefully: `kill -9 [PID]`
3. Try to start daemon again

**Expected Results:**

- Daemon detects stale PID file
- Cleans up stale PID
- Starts new instance successfully
- Previous state not corrupted

**Pass Criteria:** Recovers from crash

---

#### 5.4 Multiple Rapid Project Links

**Prerequisites:** Daemon running

**Test Steps:**

1. Link 5 projects rapidly in different directories
2. Check daemon handles all notifications
3. Verify all projects tracked

**Expected Results:**

- All IPC messages processed
- All projects appear in status
- No message loss or errors

**Pass Criteria:** Handles rapid operations

---

### Phase 6: Token Refresh Behavior

#### 6.1 OAuth Token Nearing Expiry

**Prerequisites:** OAuth token expiring within 20 minutes

**Setup:** This requires either waiting or manually setting expiresAt

**Test Steps:**

1. Monitor logs: `vercel daemon logs --follow`
2. Wait for scheduled refresh
3. Verify token refreshed

**Expected Results:**

- Logs show refresh attempt 15min before expiry
- New token written to auth.json
- expiresAt updated
- Refresh cycle continues

**Pass Criteria:** OAuth token refreshed automatically

**Note:** This test requires time or manual token manipulation

---

#### 6.2 OIDC Token Refresh Schedule

**Prerequisites:** Linked project, daemon tracking it

**Test Steps:**

1. Check token file: `cat ~/Library/Application\ Support/com.vercel.token/[project-id].json`
2. Note expiration time
3. Monitor logs for scheduled refresh

**Expected Results:**

- Refresh scheduled 15min before expiry
- Token refreshed proactively
- No service interruption

**Pass Criteria:** OIDC token refreshed on schedule

**Note:** Requires significant time or token manipulation

---

### Phase 7: Service Manager Integration

#### 7.1 Auto-Start on System Boot (macOS)

**Prerequisites:** Daemon installed with --auto-start

**Test Steps:**

1. Reboot system
2. After login, wait 30 seconds
3. Check daemon status: `vercel daemon status`
4. Check logs

**Expected Results:**

- Daemon automatically started after login
- Logs show initialization
- All tokens discovered

**Pass Criteria:** Auto-start works

**Note:** Requires system reboot

---

#### 7.2 Service Restart on Failure (macOS)

**Prerequisites:** Daemon installed as service

**Test Steps:**

1. Get daemon PID
2. Kill daemon: `kill [PID]`
3. Wait 30 seconds
4. Check if daemon restarted: `vercel daemon status`

**Expected Results:**

- launchd detects failure
- Automatically restarts daemon
- Service recovers

**Pass Criteria:** KeepAlive setting works

---

#### 7.3 Uninstall Service

**Prerequisites:** Daemon installed as service

**Test Steps:**

1. Run `vercel daemon uninstall`
2. Check plist removed: `ls ~/Library/LaunchAgents/ | grep vercel`
3. Verify service not in launchctl: `launchctl list | grep vercel`
4. Try to start daemon manually: `vercel daemon start`

**Expected Results:**

- Plist file removed
- Service unloaded from launchctl
- Manual start still works (daemon not deleted, just service)

**Pass Criteria:** Clean uninstall

---

## Test Result Recording

For each test, record:

- **Date:** When test was performed
- **Platform:** macOS/Linux/Windows
- **Version:** CLI version tested
- **Result:** Pass/Fail
- **Notes:** Any observations or issues

### Example:

```
Test: 2.1 Manual Start
Date: 2026-01-06
Platform: macOS 14.6
Version: CLI 50.1.5
Result: ✅ Pass
Notes: Daemon started successfully, all logs correct
```

---

## Known Limitations

1. **OAuth refresh requires valid refresh token** - If user logged in with device flow but token can't be refreshed, daemon will retry with backoff but won't be able to refresh.

2. **OIDC refresh requires valid CLI auth** - If OAuth token is invalid/expired, OIDC refresh will fail until OAuth is fixed.

3. **Token discovery is file-based** - If token files are manually corrupted, daemon may skip them.

4. **IPC requires daemon running** - Link/unlink notifications are fire-and-forget; if daemon isn't running, notifications are silently ignored.

---

## Automated Test Coverage

### Unit Tests (31 tests)

- RetryStrategy: Exponential backoff, max attempts, reset
- PIDManager: Single instance, stale PID cleanup, error handling

### Integration Tests (14 tests)

- IPC protocol: message handling, multiple messages, partial messages, invalid JSON
- TokenManager lifecycle: init, add/remove projects, status reporting
- Error resilience: missing tokens, graceful degradation

---

## Success Criteria Summary

The daemon is considered production-ready when:

✅ All automated tests pass (45/45)
✅ Manual installation works on macOS, Linux, Windows
✅ Daemon starts, stops, and reports status correctly
✅ OAuth and OIDC tokens are discovered and managed
✅ Link/unlink commands trigger daemon notifications
✅ IPC communication is reliable
✅ Error handling is graceful (no crashes)
✅ Service manager integration works (auto-start, restart)
✅ Token refresh happens 15min before expiry
✅ Clean uninstall leaves no artifacts

---

## Next Steps

1. Execute manual tests systematically
2. Document any failures or unexpected behavior
3. Fix issues found during testing
4. Re-test after fixes
5. Mark daemon feature as stable for release
