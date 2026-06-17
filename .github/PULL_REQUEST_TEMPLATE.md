## Description

<!-- Briefly describe the change and why it's needed. What problem does it solve? -->

## Related Issue

<!-- Link to the GitHub issue this PR addresses, if applicable. -->
<!-- Use: Fixes #123, Closes #456, or Related to #789 -->

Fixes #

## Type of Change

<!-- Mark the relevant option(s) with an "x". Delete options that don't apply. -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor (code change that neither fixes a bug nor adds a feature)
- [ ] Performance improvement
- [ ] Documentation update
- [ ] Build or tooling change (Docker, CI/CD, Terraform, dependencies)
- [ ] Tests (adding or updating tests)

## Affected Packages

<!-- Mark the packages affected by this change. -->

- [ ] `@yt-player/shared` — Types, enums, Zod schemas
- [ ] `@yt-player/database` — Prisma schema, migrations, client
- [ ] `@yt-player/storage` — S3/MinIO abstraction
- [ ] `@yt-player/queue` — BullMQ queues, Redis connection
- [ ] `@yt-player/pipeline` — Video processing (FFmpeg, Whisper, VLM)
- [ ] `@yt-player/api` — Fastify server, routes, workers
- [ ] `@yt-player/web` — React frontend, components, styles
- [ ] Infrastructure — Docker, Terraform, CI/CD, scripts
- [ ] Documentation — README, guides, agent skills

## Checklist

<!-- Ensure all items are complete before requesting review. -->

### Code Quality
- [ ] I have read the [CONTRIBUTING.md](../CONTRIBUTING.md) guidelines.
- [ ] `pnpm typecheck` passes with no errors.
- [ ] `pnpm build` completes successfully.
- [ ] My code follows the project's code conventions (strict TypeScript, ESM imports with `.js` extensions, named exports).
- [ ] I have removed all `console.log` statements (use `console.error` or `console.warn` where appropriate).
- [ ] I have not introduced any `any` types (use `unknown` if the type is truly unknown).
- [ ] I have added proper TypeScript types and JSDoc comments for new public APIs.

### Testing
- [ ] I have tested my changes locally (describe how below).
- [ ] I have considered edge cases and error handling.
- [ ] Pipeline changes: tested with a short video URL to verify end-to-end flow.
- [ ] Frontend changes: checked in both light and dark mode.
- [ ] API changes: verified with curl/httpie against local dev server.

### Database (if applicable)
- [ ] Schema changes include a Prisma migration: `pnpm db:migrate --name description_of_change`
- [ ] Existing data migration is handled (backward compatible).
- [ ] Indexes are added for new foreign key columns.

### Infrastructure (if applicable)
- [ ] Docker changes have been tested with `docker compose up`.
- [ ] Terraform changes have been validated with `terraform plan`.
- [ ] New environment variables are documented in `.env.example`.

### Documentation
- [ ] I have updated relevant documentation (README, CHANGELOG, docs/, etc.).
- [ ] I have added a changelog entry under the "Unreleased" section.
- [ ] API changes include updated endpoint documentation in the README.

## How Has This Been Tested?

<!-- Describe the tests you ran to verify your changes. Provide instructions so reviewers can reproduce. -->

1. Steps to reproduce the test scenario:
2. Expected behavior:
3. Actual behavior:

### Test Environment
- OS:
- Node.js version:
- Browser (if frontend change):
- Docker version (if infrastructure change):

## Screenshots (if applicable)

<!-- For UI changes, add screenshots or screen recordings showing before/after. -->

| Before | After |
|--------|-------|
|        |       |

## Breaking Changes

<!-- If this PR contains breaking changes, describe the impact and migration path. -->

- **What breaks:**
- **Migration path:**
- **New behavior:**

## Additional Context

<!-- Add any other information that would help reviewers understand the change. -->
<!-- Examples: performance benchmarks, architecture decisions, alternative approaches considered. -->

## Commit Message

<!-- Suggest a commit message that follows our Conventional Commits format. -->
<!-- Examples:
     feat(api): add streaming session endpoint
     fix(pipeline): handle missing audio streams gracefully
     refactor(web): extract video player controls into separate component
     docs: add AWS deployment guide
-->

```
<type>(<scope>): <description>
```
