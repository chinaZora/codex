# codex

Monorepo for multiple projects.

## Repository Layout

```text
.
├── projects/
│   └── connectivity-smoke/      # this round's CI connectivity smoke test project
│       ├── pom.xml
│       └── src/test/java/com/example/IntegrationSmokeTest.java
└── .github/workflows/test.yml   # runs smoke tests remotely on GitHub Actions
```

## Project Name (this test)

- **Display Name:** `Codex Connectivity Smoke`
- **Maven ArtifactId:** `connectivity-smoke`
- **Module Path:** `projects/connectivity-smoke`

## Branch Model

- `main`: stable/release branch
- `develop`: daily integration branch
- `feature/*`, `fix/*`, `hotfix/*`: work branches

## Run Remote Test

CI triggers on push/PR for `main` and `develop` (or run manually via `workflow_dispatch`).
