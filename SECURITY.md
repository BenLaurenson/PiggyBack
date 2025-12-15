# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities via one of these methods:

1. **GitHub Private Vulnerability Reporting** — use the [Security Advisories](https://github.com/BenLaurenson/PiggyBack/security/advisories) tab to privately report the issue
2. **Email** — contact the maintainer directly (see GitHub profile)

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **48 hours** — acknowledgement of your report
- **1 week** — initial assessment and severity rating
- **30 days** — target for a fix, depending on complexity

You will be credited in the release notes (unless you prefer otherwise).

## Security Measures

PiggyBack implements the following security practices:

- **AES-256-GCM encryption** — Up Bank API tokens are encrypted at rest in the database
- **Row Level Security (RLS)** — all user-facing Supabase tables are protected with RLS policies
- **HMAC-SHA256 webhook verification** — Up Bank webhook payloads are verified with timing-safe comparison
- **Server-side secrets** — encryption keys and API credentials are never exposed to client-side code
- **Supabase Auth with SSR** — cookie-based sessions with secure defaults

## Responsible Disclosure

We follow responsible disclosure practices. We ask that you:

- Allow reasonable time for us to address the issue before public disclosure
- Avoid accessing or modifying other users' data
- Act in good faith to avoid degradation of the service
