# V1 Deferrals & Simplifications

This document tracks features that were intentionally deferred or simplified in V1 of the authentication system. These are **not bugs or oversights**—they are conscious decisions to ship a secure, functional V1 while deferring advanced features to future iterations.

---

## Refresh Token Reuse Detection

### Status: **Simplified**

**What was deferred**: Advanced refresh token reuse heuristics beyond basic detection.

**Current V1 implementation**:
- ✅ Detects immediate reuse (same `jti` used twice)
- ✅ Invalidates entire token family on detection
- ✅ Logs `refresh.reuse_detected` security event

**Deferred for future**:
- ❌ Temporal analysis (e.g., flagging reuse after long periods)
- ❌ Probabilistic scoring (distinguishing theft vs. clock skew)
- ❌ Grace periods for edge cases

**Rationale**: Basic reuse detection provides strong security. Advanced heuristics add complexity with marginal benefit for V1.

**Future consideration**: Revisit if reuse false-positives become an issue in production.

---

## Pairwise Subject Identifiers

### Status: **Deferred**

**What was deferred**: Privacy-focused pairwise `sub` claims per OAuth client.

**Current V1 implementation**:
- ✅ Uses global user ID as `sub` in `id_token`
- ✅ Consistent across all clients

**Deferred for future**:
- ❌ Client-specific subject identifiers
- ❌ Sector identifier URI support
- ❌ Subject type negotiation (`pairwise` vs `public`)

**Rationale**: 
- First-party clients only in V1 (no third-party OAuth apps)
- No privacy concern with internal clients seeing real user IDs
- Adds complexity to implement and test

**Future consideration**: Required if/when third-party OAuth clients are supported.

**Spec reference**: Noted in Phase 9 as acceptable deferral for first-party-only systems.

---

## PAT-First Integration Workflows

### Status: **Simplified**

**What was deferred**: Optimized workflows for Personal Access Token (PAT) creation and management.

**Current V1 implementation**:
- ✅ PATs can be created via API
- ✅ PATs authenticate service-to-service requests
- ✅ Basic CRUD operations supported

**Deferred for future**:
- ❌ Guided PAT setup flows in UI
- ❌ Scope templates for common use cases
- ❌ PAT rotation tooling/notifications
- ❌ PAT usage analytics dashboard

**Rationale**: Core PAT functionality exists. Advanced tooling can be added based on user feedback.

**Future consideration**: Monitor PAT adoption; add tooling if becomes heavily used.

---

## Advanced MFA Challenges

### Status: **Deferred**

**What was deferred**: Step-up authentication and conditional MFA challenges.

**Current V1 implementation**:
- ✅ MFA level tracking in tokens (`mfa_level`)
- ✅ Basic reauthentication support (`reauth_at`)

**Deferred for future**:
- ❌ Dynamic MFA step-up (e.g., require MFA for sensitive operations)
- ❌ Conditional challenges based on risk signals
- ❌ Biometric authentication methods

**Rationale**: Infrastructure for future MFA in place. Advanced flows deferred until MFA is fully implemented.

**Future consideration**: Phase 2 of MFA rollout.

---

## Identity Unlinking

### Status: **Deferred**

**What was deferred**: Ability for users to unlink OAuth identities from their account.

**Current V1 implementation**:
- ✅ Email cooling-off period logic in place (defensive)
- ❌ No UI or API to actually unlink identities

**Deferred for future**:
- ❌ Unlink API endpoint
- ❌ UI for managing linked identities
- ❌ `SecurityEvent` emission for `identity.unlinked`

**Rationale**: Cooling-off protection is implemented defensively. Unlinking feature itself deferred to reduce V1 scope.

**Future consideration**: Required for user privacy controls; implement if users request it.

---

## Session Device Management

### Status: **Deferred**

**What was deferred**: Rich device/session management UI.

**Current V1 implementation**:
- ✅ Sessions track `userAgent` and `ipAddress`
- ✅ Basic revocation via `/oauth/revoke`

**Deferred for future**:
- ❌ "Active Sessions" dashboard showing all devices
- ❌ Remote session revocation (kill sessions from other devices)
- ❌ Device naming/recognition
- ❌ Suspicious login notifications

**Rationale**: Core session security is sound. User-facing management UI is nice-to-have for V2.

**Future consideration**: Common user request; prioritize for V2.

---

## Webhook/Event Streaming

### Status: **Deferred**

**What was deferred**: Real-time event streaming for security events.

**Current V1 implementation**:
- ✅ `SecurityEvent` table logs all security events
- ✅ Can be queried via admin tools

**Deferred for future**:
- ❌ Webhook subscriptions for events
- ❌ Real-time streaming (e.g., WebSocket, SSE)
- ❌ Event replay/audit trail UI

**Rationale**: Events are logged. Real-time delivery is enhancement for monitoring/alerting.

**Future consideration**: Useful for security operations team in larger deployments.

---

## Summary

All deferrals are **intentional** and **documented**. V1 provides a secure, production-ready authentication system. Deferred features can be prioritized in future releases based on user needs and feedback.

**Last updated**: December 4, 2025
