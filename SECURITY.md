# Security Policy

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security vulnerability in Kraken Agent, please report it responsibly:

1. **Email:** security@kraken-agent.com
2. **Subject:** `[SECURITY] Brief description of the issue`
3. **Include:**
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within **48 hours** and aim to provide a fix or mitigation within **7 days** for critical issues.

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Scope

The following are in scope for security reports:

- **API server** — Authentication bypass, injection, unauthorized access
- **Sandbox** — Container escape, privilege escalation
- **Browser automation** — SSRF bypass, unauthorized network access
- **SDK** — Credential leakage, insecure defaults
- **Docker configuration** — Insecure defaults, exposed services

## Out of Scope

- Vulnerabilities in third-party dependencies (report upstream, but let us know)
- Social engineering attacks
- Denial of service via rate limiting (expected behavior until rate limiting is implemented)

## Security Best Practices

When deploying Kraken Agent:

- Always set `KRAKEN_API_KEY` to protect the API
- Use strong, unique passwords for PostgreSQL and Neo4j
- Do not expose the Docker socket to untrusted containers
- Run behind a reverse proxy (nginx, Caddy) with TLS in production
- Keep the Docker images updated
