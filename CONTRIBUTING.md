# Contributing to YT Player

Thank you for your interest in contributing to YT Player! We welcome contributions of all kinds — bug fixes, feature additions, documentation improvements, and more.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Architecture](#project-architecture)
- [Code Conventions](#code-conventions)
- [Package-Specific Guidelines](#package-specific-guidelines)
- [Testing](#testing)
- [Pull Request Workflow](#pull-request-workflow)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Review Process](#review-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

This project is committed to providing a welcoming, inclusive, and harassment-free experience for everyone. By participating, you agree to:

- **Be respectful** — Disagreement is fine, personal attacks are not.
- **Be constructive** — Criticism should be specific and actionable.
- **Be collaborative** — Help others learn and grow.
- **Be inclusive** — Use welcoming language and assume good intent.

Unacceptable behavior will not be tolerated and may result in a permanent ban from the project.

---

## Getting Started

### Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| [Node.js](https://nodejs.org/) | 22 | JavaScript runtime |
| [pnpm](https://pnpm.io/) | 9 | Package manager |
| [Docker](https://www.docker.com/) | Latest | PostgreSQL, Redis, MinIO |
| [FFmpeg](https://ffmpeg.org/) | Latest | Video processing |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Latest | Video downloading |
| [Git](https://git-scm.com/) | Latest | Version control |

### One-Time Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/yt-player.git
cd yt-player

# 2. Add upstream remote
git remote add upstream https://github.com/afzalimdad9/yt-player.git

# 3. Install dependencies
pnpm install

# 4. Generate Prisma client
pnpm db:generate

# 5. Start infrastructure (PostgreSQL, Redis, MinIO)
docker compose -f docker/docker-compose.yml up -d postgres redis minio minio-init

# 6. Push database schema
pnpm db:push

# 7. (Optional) Install Whisper for caption generation
./scripts/setup-whisper.sh --model base

# 8. Verify everything works
pnpm typecheck
pnpm build
```

### Daily Development Workflow

```bash
# Start infrastructure
docker compose -f docker/docker-compose.yml up -d postgres redis minio

# Start dev servers (in separate terminals)
pnpm --filter @yt-player/api dev        # API → http://localhost:4000
pnpm --filter @yt-player/web dev        # Frontend → http://localhost:5173
pnpm --filter @yt-player/api dev:worker # Background worker

# Or use the all-in-one script
./scripts/dev.sh
```

---

## Project Architecture

### Monorepo Structure

```
yt-player/
├── packages/
│   ├── shared/       # Types, enums, Zod schemas (no deps)
│   ├── database/     # Prisma ORM + PostgreSQL
│   ├── storage/      # S3/MinIO abstraction (AWS SDK)
│   ├── queue/        # BullMQ + Redis infrastructure
│   ├── pipeline/     # Video processing (FFmpeg, Whisper, VLM)
│   ├── api/          # Fastify REST API
│   └── web/          # React frontend (Vite + shadcn/ui)
├── docker/           # Docker Compose, Dockerfiles, Nginx
├── scripts/          # Dev and deployment scripts
├── terraform/        # AWS Infrastructure-as-Code
├── steering/         # Build/deploy automation configs
└── skills/           # AI agent skills
```

### Dependency Graph

```
shared (no deps)
  ↑
database ──┐
storage ───┤
queue ─────┼──→ pipeline ──→ api ──→ web
           │
           └─────────────────┘
```

### Key Design Decisions

1. **Monorepo with pnpm workspaces** — All packages share a single lockfile and consistent dependency versions.
2. **Turborepo** — Parallel builds with intelligent caching. Only rebuild what changed.
3. **TypeScript strict mode** — Every package uses strict TypeScript with no implicit any.
4. **ESM-only** — All packages use `"type": "module"` with `.js` extensions in imports.
5. **Fastify over Express** — Better performance, built-in schema validation, plugin architecture.
6. **BullMQ over direct Redis** — Durable job queues with retries, scheduling, and monitoring.
7. **whisper.cpp over Python-only** — ~10× faster inference with smaller memory footprint.
8. **HLS over DASH** — Broader browser support; DASH served as fallback.

---

## Code Conventions

### TypeScript

- **Strict mode** — All tsconfig files extend `tsconfig.base.json` with `"strict": true`.
- **ESM imports** — Use `.js` extensions for all relative imports: `import { foo } from './bar.js'`.
- **Named exports** — Prefer named exports over default exports for better tree-shaking and IDE support.
- **Explicit types** — Avoid `any`. Use `unknown` if the type truly isn't known. Cast sparingly.
- **Interfaces over types** — Use `interface` for object shapes, `type` for unions and aliases.
- **Satisfies operator** — Use `satisfies` instead of type annotations where it preserves the literal type.
- **No unused variables** — Enable `noUnusedLocals` and `noUnusedParameters` (configured in tsconfig).

```typescript
// ✅ Good
import { VideoStatus, type VideoMetadata } from '@yt-player/shared'

export interface ProcessResult {
  videoId: string
  success: boolean
  error?: string
}

export async function processVideo(id: string): Promise<ProcessResult> {
  // ...
}

// ❌ Bad
import Foo from './bar'           // Default export
import { doThing } from './utils' // Missing .js extension
function baz(data: any) { }       // Using any
```

### Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Files/Directories | kebab-case | `video-player.ts`, `thumbnail-sprite.ts` |
| Classes | PascalCase | `StorageClient`, `HlsMasterPlaylist` |
| Functions/Methods | camelCase | `runPipeline()`, `getVideoById()` |
| Variables | camelCase | `videoId`, `transcodeResult` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_CONFIG`, `MAX_FILE_SIZE` |
| Types/Interfaces | PascalCase | `StreamManifest`, `TranscodeResult` |
| Enums | PascalCase | `VideoStatus`, `QueueName` |
| Enum values | UPPER_SNAKE_CASE | `VideoStatus.READY` |

### Imports Order

1. External dependencies (react, fastify, bullmq)
2. Internal workspace packages (`@yt-player/*`)
3. Relative imports (./foo, ../bar)
4. Node.js builtins (node:fs, node:path)

Each group separated by a blank line:

```typescript
import { useState, useEffect } from 'react'
import { z } from 'zod'

import { prisma } from '@yt-player/database'
import { VideoStatus } from '@yt-player/shared'

import { downloadVideo } from './downloader.js'
import { transcodeVideo } from './transcoder.js'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
```

### Async/Await

- Use `async/await` over raw promises (`.then()` / `.catch()`).
- Handle errors with try/catch, not `.catch()` chaining.
- Use `Promise.all()` for parallel independent operations.

```typescript
// ✅ Good
async function loadVideo(id: string) {
  try {
    const [video, session] = await Promise.all([
      getVideo(id),
      getStreamingSession(id).catch(() => null),
    ])
    return { video, session }
  } catch (error) {
    console.error(`Failed to load video ${id}:`, error)
    throw error
  }
}

// ❌ Bad
function loadVideo(id: string) {
  return getVideo(id).then(video => {
    return getStreamingSession(id).then(session => ({ video, session }))
  })
}
```

### File Organization

- One module per file, named after the main export.
- Group related files in directories.
- Index files re-export public API.
- Keep files focused — if a file exceeds 400 lines, consider splitting.

```
whisper/
├── index.ts              # Re-exports public API
├── caption-generator.ts  # Main caption generation logic
├── audio-converter.ts    # Audio format conversion
└── models.ts             # Model management
```

### Error Handling

- Use **Zod** for API input validation (clear error messages with field-level details).
- Use Fastify's error middleware for consistent error responses.
- Pipeline errors update the database record with the error message.
- Log errors at appropriate levels: `console.error` for failures, `console.warn` for recoverable issues.
- All API responses follow `{ data, error, message, requestId }` format.

---

## Package-Specific Guidelines

### `@yt-player/shared`

This package has **zero runtime dependencies**. It defines:

- **Enums** — `VideoStatus`, `VideoQuality`, `StreamingProtocol`, `TrackType`, `QueueName`, `PipelineEvent`
- **Interfaces** — `VideoMetadata`, `StreamManifest`, `Chapter`, `ThumbnailSprite`, job data types
- **Type exports only** — No runtime code, no logic

When modifying shared types:
1. Keep enums alphabetically sorted.
2. Add JSDoc comments for public types.
3. Ensure backward compatibility — prefer adding optional fields over changing required ones.
4. Update corresponding Prisma schema and frontend API types in tandem.

### `@yt-player/database`

**Prisma ORM** with PostgreSQL. Guidelines:

- **No raw SQL** — All queries go through Prisma.
- **Schema changes** — Create a migration, don't use `db:push` in production: `pnpm db:migrate --name description_of_change`
- **Include relations** — Use Prisma's `include` for eager loading, not multiple queries.
- **Soft deletes** — Not implemented yet; if adding, discuss with the team first.
- **Indexes** — Add `@@index` for all foreign key columns (already done for `videoId`).

### `@yt-player/storage`

**S3 abstraction** with AWS SDK. Guidelines:

- **MinIO compatible** — All code must work with both MinIO (dev) and AWS S3 (prod).
- **`forcePathStyle`** — Enabled for MinIO; AWS SDK automatically disables it for AWS endpoints.
- **Error handling** — Wrap S3 calls in try/catch; bucket operations should be resilient.
- **Pre-signed URLs** — Use for temporary access; public URLs for permanent assets.

### `@yt-player/queue`

**BullMQ + Redis** infrastructure. Guidelines:

- **Queue naming** — Define queue names in `QueueName` enum in shared.
- **Job data types** — Define job data interfaces in shared (e.g., `VideoIngestJobData`).
- **Concurrency** — Be conservative; video processing is CPU/memory intensive.
- **Retries** — Use exponential backoff; avoid infinite retries for non-recoverable errors.
- **Graceful shutdown** — Workers must close cleanly on SIGTERM.

### `@yt-player/pipeline`

**Video processing pipeline**. Guidelines:

- **FFmpeg is the backbone** — All video/audio processing goes through FFmpeg subprocesses.
- **whisper.cpp preferred** — Use whisper.cpp when available; Python openai-whisper is the fallback.
- **Temp files** — All temp files go under `TEMP_DIR/{videoId}/`. Clean up in `finally` blocks.
- **Progress reporting** — Log progress at 10% intervals for long operations.
- **Resource limits** — Be mindful of CPU/memory. Transcode one quality at a time to avoid saturation.
- **Error resilience** — Each pipeline step should fail independently and be retryable.

### `@yt-player/api`

**Fastify 5** server. Guidelines:

- **Route registration** — Group routes by domain (videos, stream, health) with prefix.
- **Zod validation** — Always validate request bodies and params with Zod schemas.
- **Error handler** — The global error handler handles Zod errors, Fastify errors, and 500s.
- **Response format** — Consistent `{ data, pagination }` for GET, `{ success, videoId, message }` for mutations.
- **Worker separation** — API and Worker are separate processes. API enqueues jobs, Worker processes them.

### `@yt-player/web`

**React 19 + Vite + Tailwind CSS 4**. Guidelines:

- **Component structure** — Page components in `pages/`, reusable in `components/`.
- **API client** — All API calls go through `services/api.ts`.
- **State management** — Use `useState`/`useEffect`; no external state library needed.
- **Dark mode** — Use CSS variables for theme; respect `prefers-reduced-motion`.
- **Accessibility** — Include skip-to-content links, ARIA labels, focus-visible rings.
- **Performance** — Lazy load images, use `loading="lazy"`, debounce search.

---

## Testing

### Type Checking

```bash
# Check all packages (recommended before committing)
pnpm typecheck

# Check a single package
pnpm --filter @yt-player/api typecheck
pnpm --filter @yt-player/web typecheck
```

### Building

```bash
# Build all packages
pnpm build

# Build a single package
pnpm --filter @yt-player/pipeline build
```

### Linting

```bash
# Run all linters
pnpm lint
```

### Manual Testing

Since the project involves video processing and streaming, manual testing is important:

1. **API testing** — Use curl or httpie to test endpoints
2. **Frontend testing** — Open the browser dev tools, check console for errors
3. **Pipeline testing** — Submit a short video URL and monitor worker logs
4. **Streaming test** — Once pipeline completes, verify HLS playback works

### Before Submitting a PR

- [ ] `pnpm typecheck` passes with no errors
- [ ] `pnpm build` completes successfully
- [ ] No `console.log` left in production code (use `console.debug` or `console.error` appropriately)
- [ ] New files follow naming conventions (kebab-case)
- [ ] Imports use `.js` extensions
- [ ] No `any` types introduced
- [ ] API changes include Zod validation
- [ ] Database changes include a Prisma migration
- [ ] Docker changes have been tested with Docker Compose

---

## Pull Request Workflow

### Branch Naming

```
feature/short-description    # New features
fix/short-description        # Bug fixes
docs/short-description       # Documentation changes
refactor/short-description   # Code refactoring
chore/short-description      # Build/tooling changes
```

### Creating a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** following the code conventions above.

3. **Commit your changes** with clear commit messages (see [Commit Message Guidelines](#commit-message-guidelines)).

4. **Rebase on latest main**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

5. **Push your branch** and open a PR:
   ```bash
   git push origin feature/my-feature
   ```
   Then open a pull request on GitHub.

### PR Checklist

- [ ] Title follows conventional commits format
- [ ] Description explains what and why
- [ ] All typechecks pass
- [ ] All builds pass
- [ ] No merge conflicts
- [ ] Self-reviewed your own code
- [ ] Added/updated relevant documentation

### PR Description Template

```markdown
## Description
Briefly describe the change and why it's needed.

## Related Issue
Fixes #(issue number)

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] pnpm typecheck passes
- [ ] pnpm build passes
- [ ] Tested manually (describe how)

## Screenshots (if applicable)
<!-- Add screenshots for UI changes -->

## Additional Notes
<!-- Any other information -->
```

---

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Usage |
|------|-------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, missing semicolons, etc. (no code change) |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Code change that improves performance |
| `test` | Adding or updating tests |
| `chore` | Build process, tooling, dependency updates |

### Scopes

| Scope | Package |
|-------|---------|
| `shared` | `@yt-player/shared` |
| `db` | `@yt-player/database` |
| `storage` | `@yt-player/storage` |
| `queue` | `@yt-player/queue` |
| `pipeline` | `@yt-player/pipeline` |
| `api` | `@yt-player/api` |
| `web` | `@yt-player/web` |
| `docker` | Docker/infrastructure |
| `tf` | Terraform |
| `ci` | GitHub Actions / CI |
| `docs` | Documentation |

### Examples

```
feat(api): add streaming session endpoint
fix(pipeline): handle missing audio streams gracefully
refactor(web): extract video player controls into separate component
docs: add AWS deployment guide
chore(deps): update bullmq to v5.78.1
feat(tf): add staging environment module
perf(pipeline): parallelize caption generation across audio chunks
```

---

## Review Process

### What Reviewers Look For

1. **Correctness** — Does the code do what it claims?
2. **Type safety** — No `any`, no type assertions where avoidable
3. **Error handling** — Are all error paths handled?
4. **Performance** — Are there any obvious performance issues?
5. **Maintainability** — Is the code readable and well-structured?
6. **Testing** — Has the change been tested (typecheck, build, manual)?
7. **Conventions** — Does the code follow project conventions?

### Review Timeline

- Small PRs (< 100 lines) — Reviewed within 24 hours
- Medium PRs (100–500 lines) — Reviewed within 48 hours
- Large PRs (> 500 lines) — Reviewed within 72 hours, may be asked to split

### Review Etiquette

- Be respectful and constructive in comments
- Explain why a change is needed, not just what to change
- Use "suggestion" mode in GitHub for non-blocking feedback
- Thank contributors for their work

---

## Reporting Bugs

### Before Reporting

1. **Check existing issues** — Search open/closed issues for similar reports.
2. **Check the docs** — Verify the behavior isn't documented.
3. **Try the latest version** — Ensure you're on the latest `main` branch.
4. **Check Docker services** — Ensure PostgreSQL, Redis, and MinIO are running.

### Bug Report Template

```markdown
## Description
A clear and concise description of the bug.

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
What should have happened.

## Actual Behavior
What actually happened.

## Screenshots / Logs
If applicable, add screenshots or error logs.

## Environment
- OS: [e.g., Ubuntu 24.04, macOS 15]
- Node.js version: [e.g., 22.x]
- Browser: [e.g., Chrome 124, Safari 17]
- Docker version: [e.g., 27.x]

## Additional Context
Add any other context about the problem.
```

---

## Feature Requests

Feature requests are welcome! Before submitting:

1. **Check existing issues** — Search for similar requests first.
2. **Describe the problem** — What issue does this feature solve?
3. **Propose a solution** — How would you implement it?
4. **Consider alternatives** — Are there other ways to solve the problem?

### Feature Request Template

```markdown
## Problem Statement
What problem would this feature solve? Who would benefit?

## Proposed Solution
Describe the feature and how it would work.

## Alternatives Considered
What other approaches were considered?

## Implementation Notes
Any technical details, architecture considerations, or affected packages.

## Additional Context
Screenshots, mockups, or references to similar features in other projects.
```

---

## Additional Resources

- [Project README](./README.md) — Overview, setup, and architecture
- [AGENTS.md](./AGENTS.md) — Developer/agent guidelines
- [AWS Deployment Guide](./docs/aws-deployment-guide.md) — Production deployment
- [Steering Configuration](./steering/deploy.yml) — Environment settings
- [Pipeline Configuration](./steering/pipeline.yml) — Pipeline step definitions

---

## Getting Help

If you need help with anything:

- **Open a Discussion** on GitHub for questions and general topics
- **Open an Issue** for bug reports and feature requests
- **Tag a maintainer** in your PR if it's been pending for more than 72 hours

---

> **Last updated:** June 2026
> **Maintainer:** [@afzalimdad9](https://github.com/afzalimdad9)
