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

## Run Remote Test

Push to `main` (or run manually via GitHub Actions `workflow_dispatch`).
