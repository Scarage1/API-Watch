# Security Policy

## Supported Versions

| Version | Supported          |
|:--------|:-------------------|
| 2.x     | ✅ Active support  |
| 1.x     | ⚠️ Critical fixes only |
| < 1.0   | ❌ No support      |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them responsibly via one of:

1. **GitHub Security Advisories**: [Create a private advisory](https://github.com/Scarage1/API-Watch/security/advisories/new)
2. **Email**: security@apiwatch.dev (if available)

### What to Include

- Type of vulnerability (XSS, SQL injection, SSRF, auth bypass, etc.)
- Full path to the affected source file(s)
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment

### Response Timeline

| Step | Timeline |
|:-----|:---------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 1 week |
| Fix development | Within 2 weeks |
| Public disclosure | After fix is released |

### What We Promise

- We will acknowledge your report promptly
- We will keep you informed of progress
- We will credit you in the security advisory (unless you prefer anonymity)
- We will not take legal action against good-faith security researchers

## Security Best Practices

When deploying API-Watch:

1. **Set `JWT_SECRET_KEY`** — Use a strong, unique secret (≥64 characters)
2. **Use HTTPS** in production — Never expose the API over plain HTTP
3. **Restrict CORS** — Set `CORS_ALLOWED_ORIGINS` to your specific domain
4. **Database credentials** — Use strong passwords, never commit to git
5. **AI API keys** — Store in environment variables, never in source code
6. **Rate limiting** — Keep rate limiting enabled in production
7. **Network isolation** — Use Docker networks to isolate services
8. **Regular updates** — Enable Dependabot and apply security patches promptly

## Known Security Measures

- SSRF protection on request execution (URL validation)
- SQL injection prevention (SQLAlchemy parameterized queries)
- XSS prevention (React auto-escaping)
- Rate limiting on authentication endpoints
- Non-root Docker container
- Secret scanning in pre-commit hooks
