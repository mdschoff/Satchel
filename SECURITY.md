# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, use GitHub's private reporting: go to the repo's **Security** tab →
**Report a vulnerability**. That opens a private thread with the maintainer.

You can expect an initial response within a few days. Please include enough
detail to reproduce the issue (affected version/commit, steps, and impact).

## Supported versions

Satchel is pre-1.0; only the latest release (and `main`) receive security
fixes.

## Scope notes

Things that make Satchel's attack surface unusual and are worth knowing when
reporting:

- Artifacts are untrusted content. They render inside a sandboxed iframe
  (`allow-scripts`, no `allow-same-origin`) - escapes from that sandbox are
  the highest-severity class of bug here.
- The MCP server binds to `127.0.0.1` only. Anything that makes it reachable
  from the network, or lets a remote page drive it (e.g. DNS rebinding /
  CORS issues), is in scope.
- API keys are stored in the OS keychain. Any path that writes them to disk
  or logs is a bug.
