# ADR 003: Tenant isolation model

## Status
Accepted

## Context
CodePulse is multi-tenant. Each GitHub App installation maps to one `Organization`. Dashboard and job APIs must never leak rows across installations. Relying on callers to “remember” `organizationId` filters is fragile.

## Decision
- **Tenant** = GitHub App installation → `Organization.githubInstallationId` → `organizationId`.
- **Enforcement point** = `tenantRepository(organizationId)` in `server/src/services/tenantRepository.ts`.
  - Empty/missing `organizationId` throws `TenantScopeError`.
  - Read APIs for `Repository`, `PullRequest`, `Issue`, `Developer`, `ReviewJob`, and `TraceEvent` go through this wrapper (dashboard/stats/jobs).
- Session boundary resolves `installationId` → `organizationId` once (`getOrganizationIdByInstallationId`), then passes the org id into tenant-scoped services.
- `ReviewJob` and `TraceEvent` both carry `organizationId` (TraceEvent denormalized for direct scoped queries without joins).

## Consequences
- Forgetting tenant scope fails loudly at the repository layer.
- Isolation is covered by `npm run test:isolation` (seeds two installations, asserts A cannot read B for every tenant-scoped model).
- Worker internals may still load a `ReviewJob` by id from the queue (trusted job id); dashboard/API paths must use `getByIdForOrganization`.
