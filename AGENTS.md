# Agent Notes

- For every user-visible change, bump the app version in `package.json` (and lockfile).
- Keep the UI version label in sync by sourcing it from the package version (`__APP_VERSION__`), not a hardcoded string.
