# Vercel CLI Documentation Gaps Analysis

## Overview

This document analyzes the Vercel CLI codebase to identify documentation gaps between the CLI's actual feature surface and what is typically covered in public documentation. The analysis is based on examining all command definitions in `/packages/cli/src/commands/`.

---

## Complete CLI Command Surface

### Summary Statistics
- **Total Commands**: 41 (including hidden/feature-flagged)
- **Total Subcommands**: ~100+
- **Global Options**: 11

---

## Stack-Ranked Documentation Gaps

### 🔴 **Priority 1: Critical Gaps (Completely Undocumented or Severely Lacking)**

#### 1. `vercel rolling-release` (rr)
**Gap Severity**: Critical  
**Description**: Enterprise-grade rolling release functionality with 6 subcommands
- Subcommands: `configure`, `start`, `approve`, `abort`, `complete`, `fetch`
- Complex JSON configuration format for stages, advancement types
- Critical for production deployments with gradual rollouts
- **Why Critical**: This is a sophisticated feature for managing production deployments incrementally. Users deploying to production need to understand percentage-based traffic shifting, approval workflows, and how to abort/complete releases safely.

#### 2. `vercel cache`
**Gap Severity**: Critical  
**Description**: Cache management with 3 important subcommands
- Subcommands: `purge`, `invalidate`, `dangerously-delete`
- Tag-based and source image invalidation
- Revalidation deadline options
- **Why Critical**: Cache invalidation is a common need but poorly documented. Users need to understand the difference between `purge`, `invalidate`, and `dangerously-delete`, plus tag-based targeting.

#### 3. `vercel redirects`
**Gap Severity**: Critical  
**Description**: Project-level redirect management with 7 subcommands
- Subcommands: `list`, `list-versions`, `add`, `upload`, `remove`, `promote`, `restore`
- CSV/JSON import capability
- Version control for redirects
- Staging vs production redirect workflows
- **Why Critical**: Redirect management at the project level is different from deployment-level redirects. The versioning, staging, and promotion workflow needs comprehensive documentation.

#### 4. `vercel blob`
**Gap Severity**: Critical  
**Description**: Vercel Blob Storage CLI with 5 subcommands
- Subcommands: `list`, `put`, `del`, `copy`, `store` (with nested add/remove/get)
- Store management by region
- Multipart upload options
- Cache-control configuration
- **Why Critical**: Blob storage is a core Vercel product. CLI operations need comprehensive documentation for automation and CI/CD pipelines.

---

### 🟠 **Priority 2: High Gaps (Partially Documented or Missing Key Details)**

#### 5. `vercel integration-resource` (ir)
**Gap Severity**: High  
**Description**: Marketplace integration resource management
- Subcommands: `disconnect`, `remove`, `create-threshold`
- Threshold creation for billing management
- Project-resource disconnect workflows
- **Why Important**: Users managing integrations at scale need to understand resource lifecycle management.

#### 6. `vercel microfrontends` (mf)
**Gap Severity**: High  
**Description**: Microfrontends configuration management
- Currently only `pull` subcommand
- Deployment-specific configuration pulling
- **Why Important**: Microfrontends is a growing architecture pattern. Users need to understand how to manage configurations across deployments.

#### 7. `vercel curl`
**Gap Severity**: High  
**Description**: Automated curl with deployment URL and protection bypass
- Automatic deployment URL resolution
- Protection bypass token management
- Curl argument passthrough
- **Note**: Has internal README but needs public documentation
- **Why Important**: Excellent for testing and debugging protected deployments. The auto-protection bypass feature is very useful but unknown to most users.

#### 8. `vercel httpstat`
**Gap Severity**: High  
**Description**: HTTP timing visualization for deployments
- Same protection bypass features as `curl`
- Timing statistics visualization
- **Why Important**: Debugging performance issues requires understanding HTTP timing. This tool is valuable but hidden.

#### 9. `vercel mcp`
**Gap Severity**: High  
**Description**: Model Context Protocol (MCP) agent setup
- Project-specific MCP access
- Vercel integration for AI agents
- **Why Important**: MCP is emerging technology for AI integration. Early documentation is crucial.

---

### 🟡 **Priority 3: Medium Gaps (Documented but Missing Advanced Features)**

#### 10. `vercel env run`
**Gap Severity**: Medium  
**Description**: Run commands with environment variables
- Execute commands with pulled environment variables
- Environment and git-branch targeting
- **Why Important**: Useful for local development but often undocumented subcommand.

#### 11. `vercel target`
**Gap Severity**: Medium  
**Description**: Custom environments (targets) management
- Currently only `list` subcommand
- Custom environment configuration
- **Why Important**: Custom environments beyond production/preview/development are underutilized due to lack of documentation.

#### 12. `vercel bisect`
**Gap Severity**: Medium  
**Description**: Binary search for broken deployments
- Automated test script support
- Good/bad deployment marking
- Path-specific testing
- **Why Important**: Powerful debugging tool that most users don't know exists.

#### 13. `vercel inspect --json`
**Gap Severity**: Medium  
**Description**: JSON output for deployment information
- Machine-readable deployment data
- Wait and timeout options for CI/CD
- **Why Important**: CI/CD integration needs this documented properly.

#### 14. `vercel list --status`
**Gap Severity**: Medium  
**Description**: Filter deployments by status
- Status filtering (BUILDING, READY, ERROR, etc.)
- Multiple status filtering (comma-separated)
- **Why Important**: Useful for automation and monitoring.

#### 15. `vercel project --update-required`
**Gap Severity**: Medium  
**Description**: List projects needing updates
- Node.js deprecation warnings
- JSON output for automation
- **Why Important**: Proactive maintenance requires knowing which projects need updates.

---

### 🟢 **Priority 4: Lower Gaps (Minor Enhancements Needed)**

#### 16. Global Options Documentation
**Gap Severity**: Lower  
- `--cwd` for single-run directory changes
- `--local-config` (-A) for custom vercel.json
- `--global-config` (-Q) for custom .vercel directory
- `--api` for custom API endpoint
- `--team` (-T) vs `--scope` (-S) differences

#### 17. `vercel deploy` Advanced Options
**Gap Severity**: Lower  
- `--skip-domain` for promotion-free deployments
- `--archive` for compressed uploads
- `--with-cache` with `--force` combination
- `--guidance` for post-deploy suggestions

#### 18. `vercel integration balance`
**Gap Severity**: Lower  
**Description**: Show integration balance and thresholds
- Marketplace billing visibility
- Threshold monitoring

#### 19. `vercel telemetry`
**Gap Severity**: Lower  
**Description**: CLI telemetry management
- Enable/disable/status subcommands
- Privacy implications

#### 20. `vercel upgrade`
**Gap Severity**: Lower  
**Description**: CLI self-upgrade
- `--dry-run` preview
- `--json` output for automation

---

## Feature-Flagged Commands

### `vercel guidance`
**Status**: Behind `FF_GUIDANCE_MODE` feature flag  
**Description**: Enable/disable guidance messages after commands  
**Note**: Should be documented when released publicly

---

## Documentation Improvement Recommendations

### 1. Create Comprehensive Reference Pages
For each Priority 1 gap, create dedicated documentation pages with:
- Full command syntax
- All subcommands and options
- Real-world use cases
- Code examples

### 2. Add CI/CD Integration Guides
Document how to use these CLI features in:
- GitHub Actions
- GitLab CI/CD
- CircleCI
- Generic CI environments

### 3. Create "Advanced CLI" Guide
Consolidate documentation for power-user features:
- `bisect` for debugging
- `curl`/`httpstat` for testing
- `cache` for performance optimization
- `rolling-release` for safe deployments

### 4. Add JSON Output Documentation
Many commands support `--json` output. Create a guide for:
- Parsing CLI output in scripts
- Available JSON schemas
- Common automation patterns

### 5. Update Quick Reference
Create a single-page reference with:
- All commands and subcommands
- Common option combinations
- Alias shortcuts

---

## Command Quick Reference

| Command | Aliases | Subcommands | Doc Status |
|---------|---------|-------------|------------|
| deploy | - | - | Documented |
| build | - | - | Documented |
| dev | develop | - | Documented |
| init | - | - | Documented |
| login | - | - | Documented |
| logout | - | - | Documented |
| whoami | - | - | Documented |
| link | - | - | Documented |
| pull | - | - | Partial |
| open | - | - | Documented |
| list | ls | - | Partial |
| inspect | - | - | Partial |
| logs | log | - | Documented |
| redeploy | - | - | Partial |
| remove | rm | - | Documented |
| rollback | - | status | Partial |
| promote | - | status | Partial |
| **rolling-release** | **rr** | **configure, start, approve, abort, complete, fetch** | **Missing** |
| project | projects | add, inspect, list, remove | Partial |
| target | targets | list | **Missing** |
| env | - | add, list, pull, remove, run, update | Partial |
| domains | domain | list, inspect, add, buy, move, transfer-in, remove | Documented |
| dns | - | add, import, list, remove | Partial |
| alias | aliases, ln | list, remove, set | Documented |
| certs | cert | add, issue, list, remove | Partial |
| teams | switch, team | add, invite, list, switch | Documented |
| integration | - | add, list, open, balance, remove | Partial |
| **integration-resource** | **ir** | **disconnect, remove, create-threshold** | **Missing** |
| install | i | - | Partial |
| **blob** | - | **list, put, del, copy, store** | **Missing** |
| **cache** | - | **purge, invalidate, dangerously-delete** | **Missing** |
| git | - | connect, disconnect | Documented |
| bisect | - | - | Partial |
| **curl** | - | - | **Missing** |
| **httpstat** | - | - | **Missing** |
| **redirects** | **redirect** | **list, list-versions, add, upload, remove, promote, restore** | **Missing** |
| telemetry | - | enable, disable, status | Partial |
| upgrade | - | - | Partial |
| **microfrontends** | **mf** | **pull** | **Missing** |
| **mcp** | - | - | **Missing** |

---

## Conclusion

The Vercel CLI has grown significantly with enterprise-grade features that are not well-documented. The highest priority gaps are in production-critical areas:

1. **Rolling releases** - Critical for safe production deployments
2. **Cache management** - Essential for performance optimization
3. **Redirect management** - Important for SEO and site migrations
4. **Blob storage** - Core storage product needs CLI documentation

Addressing these gaps will significantly improve the CLI's usability for advanced users and enable better CI/CD integration.
