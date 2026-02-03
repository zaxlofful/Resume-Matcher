# Security, Vulnerability & Pitfall Analysis

## Executive Summary

This document provides a comprehensive security analysis of the Resume-Matcher repository, assuming it could be a potential threat vector from a forked repository. The analysis covers critical security vulnerabilities, potential backdoors, supply chain risks, and recommended mitigations.

**Risk Assessment**: Medium-High for self-hosted deployments due to lack of authentication, with specific high-risk areas in API key handling and LLM prompt injection.

---

## Table of Contents

1. [Critical Vulnerabilities](#critical-vulnerabilities)
2. [High-Risk Areas](#high-risk-areas)
3. [Medium-Risk Areas](#medium-risk-areas)
4. [Low-Risk Areas](#low-risk-areas)
5. [Supply Chain Security](#supply-chain-security)
6. [Threat Scenarios](#threat-scenarios)
7. [Recommended Mitigations](#recommended-mitigations)
8. [Defense in Depth Checklist](#defense-in-depth-checklist)

---

## Critical Vulnerabilities

### 1. No Authentication/Authorization (CRITICAL)

**Location**: All API endpoints (`apps/backend/app/routers/*.py`)

**Issue**: The entire API is unauthenticated. Any user who can reach the backend can:
- Access all resumes (personal information, work history, contact details)
- Delete all data via `/api/v1/config/reset`
- Steal API keys (partially masked, but accessible)
- Upload malicious content
- Exhaust LLM API credits

**Evidence**:
```python
# apps/backend/app/routers/config.py:459-485
@router.post("/reset")
async def reset_database_endpoint(request: ResetDatabaseRequest) -> dict:
    """Reset the database and clear all data.
    ...
    Note:
        This is a local-only endpoint for single-user deployments.
        In production/multi-user scenarios, add proper authentication.
    """
```

**Threat Scenario**: An attacker on the same network can enumerate and exfiltrate all resume data, delete the database, or steal API keys.

**Mitigation Priority**: CRITICAL

---

### 2. API Key Exposure via Config Endpoint (CRITICAL)

**Location**: `apps/backend/app/routers/config.py`, `apps/backend/app/config.py`

**Issue**: API keys are stored in plain text in `config.json` file and partially exposed via API endpoints.

**Evidence** (Original - Now Fixed):
```python
# apps/backend/app/routers/config.py - BEFORE (exposed first 4 + last 4 chars)
def _mask_api_key(key: str) -> str:
    return key[:4] + "*" * (len(key) - 8) + key[-4:]

# AFTER (only exposes last 4 chars)
def _mask_api_key(key: str) -> str:
    """SEC-002: Enhanced masking to prevent partial key exposure."""
    if len(key) <= 4:
        return "*" * len(key)
    return "*" * (len(key) - 4) + key[-4:]  # Only last 4 chars visible
```

**Risks** (Partially Mitigated):
- ~~First 4 and last 4 characters revealed~~ **FIXED**: Only last 4 chars now visible
- Keys stored in plain text on disk (still a concern)
- No encryption at rest (still a concern)
- File permissions not enforced (still a concern)

**Mitigation Priority**: MEDIUM (masking improved, storage encryption still needed)

---

### 3. CORS Misconfiguration Potential (HIGH)

**Location**: `apps/backend/app/main.py:51-58`

**Issue**: CORS is configured to allow all methods and headers, with credentials enabled.

**Evidence**:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Risk**: If CORS_ORIGINS is misconfigured (e.g., `["*"]`), any website can make authenticated requests to the API.

**Mitigation Priority**: HIGH

---

## High-Risk Areas

### 4. LLM Prompt Injection (Significantly Improved)

**Location**: `apps/backend/app/services/improver.py`, `apps/backend/app/llm.py`

**Issue**: User-provided job descriptions are passed to LLM prompts. Sanitization has been significantly enhanced.

**Evidence** (After Improvements):
```python
# apps/backend/app/services/improver.py - ENHANCED with 30+ patterns
_INJECTION_PATTERNS = [
    # Instruction override attempts
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"override\s+(previous\s+)?instructions?",
    # System prompt extraction attempts
    r"what\s+(is|are)\s+(your|the)\s+(system\s+)?prompt",
    r"repeat\s+(your\s+)?instructions",
    # Model-specific injection markers
    r"<\|im_start\|>", r"<\|im_end\|>", r"<<SYS>>",
    # Role-play escape attempts
    r"pretend\s+(you\s+are|to\s+be)\s+a",
    r"jailbreak", r"dan\s+mode",
    # ... and many more
]

# ADDED: Unicode normalization to prevent homoglyph attacks
def _normalize_unicode(text: str) -> str:
    return unicodedata.normalize("NFKC", text)
```

**Mitigations Applied**:
- ✅ Unicode normalization (NFKC) added to catch obfuscated attacks
- ✅ Role-play/jailbreak detection patterns added
- ✅ Model-specific markers detected (Llama, GPT, etc.)
- ✅ 30+ injection patterns vs original 8

**Remaining Gaps**:
- Base64 encoded instructions not detected
- Indirect injection via resume content not sanitized

**Threat Scenario**: Attacker crafts job description to extract system prompts, modify LLM behavior, or generate malicious content.

**Mitigation Priority**: MEDIUM (significantly improved)

---

### 5. File Upload Vulnerabilities (Improved)

**Location**: `apps/backend/app/routers/resumes.py`

**Issue**: File uploads were processed with limited validation. Now includes magic byte validation.

**Evidence** (After Improvements):
```python
# SEC-001: Magic bytes for file type validation
FILE_SIGNATURES = {
    b"%PDF": {".pdf"},  # PDF files
    b"PK\x03\x04": {".docx"},  # DOCX (ZIP-based Office Open XML)
    b"\xd0\xcf\x11\xe0": {".doc"},  # Legacy DOC (OLE format)
}

def _validate_file_signature(content: bytes, filename: str) -> bool:
    """Validates file content matches expected magic bytes."""
    # Requires extension to be present
    # Verifies signature matches expected type
    # Rejects unknown signatures
```

**Mitigations Applied**:
- ✅ Magic byte validation added (SEC-001)
- ✅ Extension required for all uploads
- ✅ Signature-extension matching enforced
- ✅ Unknown signatures rejected

**Remaining Risks**:
- PDF/DOCX can contain malicious macros/scripts
- `markitdown` library processes untrusted files (library-level risk)

**Threat Scenario**: Attacker uploads crafted PDF that exploits vulnerabilities in markitdown/pdfminer.six libraries.

**Mitigation Priority**: MEDIUM (magic byte validation added)

---

### 6. SSRF via PDF Rendering (HIGH)

**Location**: `apps/backend/app/pdf.py`, `apps/backend/app/routers/resumes.py:1015-1095`

**Issue**: PDF rendering fetches URLs from configuration, potentially allowing SSRF.

**Evidence**:
```python
# apps/backend/app/routers/resumes.py:1078
url = f"{settings.frontend_base_url}/print/resumes/{resume_id}?{params}"
# ...
pdf_bytes = await render_resume_pdf(url, pageSize, margins=pdf_margins)
```

**Risks**:
- If `FRONTEND_BASE_URL` is manipulated, internal services can be accessed
- Headless Chromium has full browser capabilities

**Threat Scenario**: Attacker manipulates environment or request to make Chromium fetch internal URLs (cloud metadata, internal services).

**Mitigation Priority**: HIGH

---

## Medium-Risk Areas

### 7. No Rate Limiting (MEDIUM)

**Location**: All API endpoints

**Issue**: No rate limiting implemented anywhere.

**Risks**:
- DoS attacks
- LLM API credit exhaustion
- Brute force attacks on API key patterns
- Data scraping

**Mitigation Priority**: MEDIUM

---

### 8. Insecure Data Storage (MEDIUM)

**Location**: `apps/backend/app/database.py`, TinyDB JSON files

**Issue**: All data stored in unencrypted JSON files.

**Evidence**:
```python
# Data stored at: apps/backend/data/database.json, config.json
```

**Risks**:
- Anyone with file system access can read all data
- No encryption at rest
- Resumes contain PII (name, email, phone, address)

**Mitigation Priority**: MEDIUM

---

### 9. XSS Prevention Review (MEDIUM)

**Location**: `apps/frontend/lib/utils/html-sanitizer.ts`, `apps/frontend/components/resume/safe-html.tsx`

**Current Mitigation**: DOMPurify is used with strict whitelist.

**Evidence**:
```typescript
const ALLOWED_TAGS = ['strong', 'em', 'u', 'a'];
const ALLOWED_ATTR = ['href', 'target', 'rel'];
```

**Assessment**: Well-implemented, but verify all user content rendering uses `SafeHtml` component.

**Mitigation Priority**: MEDIUM (monitoring)

---

### 10. Logging Sensitive Data (MEDIUM)

**Location**: Various files with logging

**Issue**: Some log statements may include sensitive information.

**Evidence**:
```python
# apps/backend/app/llm.py:377-380
logging.exception(
    "LLM health check failed",
    extra={"provider": config.provider, "model": config.model},
)
```

**Risk**: Logs could contain API responses with personal data.

**Mitigation Priority**: MEDIUM

---

## Low-Risk Areas

### 11. Docker Security (LOW-MEDIUM)

**Location**: `Dockerfile`, `docker-compose.yml`

**Positive**:
- Non-root user created (`appuser`)
- Multi-stage build
- Health checks configured

**Issues**:
- Uses `curl -fsSL https://deb.nodesource.com/setup_22.x | bash -` (supply chain risk)
- Playwright browsers installed (large attack surface)

**Mitigation Priority**: LOW

---

### 12. Dependency Versions (LOW)

**Location**: `apps/backend/pyproject.toml`, `apps/frontend/package.json`

**Current Dependencies** (Notable):
- `litellm>=1.56.0` - LLM proxy (check for CVEs)
- `markitdown>=0.1.0` - Document conversion (potential file parsing vulnerabilities)
- `playwright>=1.50.0` - Browser automation (attack surface)
- `isomorphic-dompurify>=2.22.0` - XSS prevention (good choice)

**Recommendation**: Run `npm audit` and `pip audit` regularly.

---

## Supply Chain Security

### Potential Backdoor Vectors

1. **Hidden Files**: Checked `.agent/`, `.claude/` - contain legitimate AI agent configurations
2. **Post-Install Scripts**: `package.json` has no suspicious scripts
3. **pyproject.toml**: No suspicious build hooks
4. **Docker**: `start.sh` is clean, no outbound connections except `curl` for health check

### NPM Package Review

The `package.json` uses reputable packages. Notable security-relevant ones:
- `isomorphic-dompurify` - ✓ Good for XSS prevention
- `@tiptap/*` - Rich text editor, evaluate for XSS risks

### Python Package Review

- `litellm` - Trusted LLM orchestration library
- `pydantic` - Strong validation library
- `markitdown` - Newer library, evaluate carefully

---

## Threat Scenarios

### Scenario 1: Network Attacker
**Threat**: Attacker on same network/VPN
**Impact**: Full data access, API key theft, database destruction
**Likelihood**: HIGH (no authentication)

### Scenario 2: Malicious Job Description
**Threat**: Attacker submits crafted job description
**Impact**: LLM prompt injection, data exfiltration via LLM responses
**Likelihood**: MEDIUM

### Scenario 3: Malicious Resume Upload
**Threat**: Attacker uploads crafted PDF/DOCX
**Impact**: Server-side code execution via parsing vulnerabilities
**Likelihood**: LOW-MEDIUM

### Scenario 4: Supply Chain Attack
**Threat**: Compromised dependency
**Impact**: Full system compromise
**Likelihood**: LOW

### Scenario 5: LLM API Key Theft
**Threat**: Attacker extracts LLM API keys
**Impact**: Financial loss from API abuse, potential prompt injection on other systems
**Likelihood**: MEDIUM (masking improved to show only last 4 chars - SEC-002)

---

## Recommended Mitigations

### Immediate Actions (Do Now)

1. **Add Authentication**
   ```python
   # Implement OAuth2 or API key authentication
   from fastapi.security import OAuth2PasswordBearer
   ```

2. **Restrict Network Access**
   - Bind only to localhost: `HOST=127.0.0.1`
   - Use reverse proxy with authentication (nginx, Caddy)

3. **Encrypt API Keys at Rest**
   - Use environment variables instead of config.json
   - Consider HashiCorp Vault or similar

4. **Add Rate Limiting**
   ```python
   from slowapi import Limiter
   limiter = Limiter(key_func=get_remote_address)
   ```

### Short-Term (Within 1 Week)

5. **Validate File Content**
   - Use magic byte detection: `python-magic`
   - Sandbox file processing

6. **Strengthen Prompt Injection Defenses**
   - Add Unicode normalization before sanitization
   - Implement output validation for LLM responses

7. **Configure Strict CORS**
   - Explicitly list allowed origins
   - Disable `allow_credentials` if not needed

8. **Add Security Headers**
   ```python
   from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
   app.add_middleware(HTTPSRedirectMiddleware)
   ```

### Long-Term (Within 1 Month)

9. **Audit Dependencies**
   - Run `npm audit --audit-level high`
   - Run `pip-audit`
   - Set up Dependabot/Snyk

10. **Add Security Monitoring**
    - Implement audit logging
    - Set up anomaly detection

11. **Encrypt Data at Rest**
    - Consider SQLite with encryption
    - Or move to encrypted database

---

## Defense in Depth Checklist

### Network Layer
- [ ] API bound to localhost only
- [ ] Reverse proxy with TLS
- [ ] Firewall rules in place
- [ ] Rate limiting at proxy level

### Application Layer
- [ ] Authentication implemented
- [ ] Authorization (RBAC) implemented
- [ ] Input validation on all endpoints
- [ ] Output encoding for all responses
- [ ] CSRF protection enabled

### Data Layer
- [ ] Encryption at rest
- [ ] Encryption in transit
- [ ] Secure backup procedures
- [ ] Data retention policy

### Secrets Management
- [ ] No hardcoded secrets
- [ ] Environment variables for configuration
- [ ] Secrets rotation policy
- [ ] Audit trail for secret access

### Monitoring & Response
- [ ] Security logging enabled
- [ ] Alert on suspicious activity
- [ ] Incident response plan
- [ ] Regular security assessments

---

## Conclusion

This forked repository is designed for **local, single-user deployments** and explicitly notes this in several places. However, if deployed in a network-accessible environment or multi-user scenario, it presents significant security risks.

**Key Takeaways**:
1. **Never expose this application to the internet** without adding authentication
2. API key handling needs immediate improvement
3. LLM prompt injection defenses are basic but present
4. XSS prevention is well-implemented
5. No obvious backdoors or malicious code detected

**Overall Assessment**: Safe for local development use. Requires security hardening before any production or shared deployment.
