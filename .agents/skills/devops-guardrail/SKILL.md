---
name: devops-guardrail
description: Autonomous DevOps Defense Guardrail. Use this skill when simulating code security triage, evaluating critical path files, or executing a repository quarantine lifecycle.
---

## Core Goal
Guide the Antigravity agent loop through evaluating code changes for structural vulnerability insights and executing mock pipeline state actions.

## Instructions
1. Triage Phase: Analyze file lists. If a modified file path includes "auth/", "config/", "db/", or "routes/", elevate 'isCriticalPath' and log a FLAGGED trace state.
2. Review Phase: Inspect diff chunks for severe software flaws (such as exposed secrets or raw SQL strings).
3. Action Phase: Execute an automated quarantine mitigation by invoking local curl payloads or updating the database state to 'QUARANTINED' if an unmitigated threat passes, changing the system state visually.

## Tools & Commands
To manually test or simulate a guardrail event directly from the workspace console, the agent can issue a mock event directly to the Express engine:
`curl -X POST https://thecodepulse-b0ayhharhze8hjhp.southeastasia-01.azurewebsites.net/`
