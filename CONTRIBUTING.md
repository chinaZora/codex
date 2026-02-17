# Contributing Guide

## Branch Strategy

- `main`: production-ready branch, only merge via Pull Request.
- `develop`: integration branch for daily development.
- `feature/<name>`: new features
- `fix/<name>`: bug fixes
- `hotfix/<name>`: urgent fixes from production issues

## Workflow

1. Create branch from `develop`:
   - `git checkout develop`
   - `git checkout -b feature/your-feature`
2. Commit with clear message.
3. Push and open PR to `develop`.
4. Release PR from `develop` to `main` when stable.

## Commit Message Convention

Recommended format:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `test: ...`
- `refactor: ...`
- `chore: ...`

## CI

- CI runs on push/PR to `main` and `develop`.
- Ensure tests pass before merge.
