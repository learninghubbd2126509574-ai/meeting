# Security Specification: Unity Earning Counselling Meeting System

## 1. Data Invariants

- **Meetings**: Anyone can retrieve a meeting document (to verify active status and get Google Meet link details) but only authenticated Admins can create, delete, or update meetings.
- **Participants**: Any public user can create a participant record when joining a meeting. However, access to list or read other participants is strictly restricted to authenticated Admins to isolate PII (Name, IP, User Agent). No standard user should be able to shadow-update or wipe out a participant's record.
- **Blocked IPs**: Public users can retrieve (get) an IP block status for their own device's IP string to see if they are blocked. Only authenticated Admins can write, list, delete, or modify blocked IPs.
- **Admin Settings**: Authenticated Admins can read and update settings (such as the panel password). Non-authenticated users can only `get` the `settings` document for security verification in password-login mode, but cannot modify, list, or delete it.

---

## 2. The "Dirty Dozen" Payloads

Here are 12 specific payloads attempting to violate our security model:

1. **Unauthenticated Meeting Creation**: A non-admin trying to issue `setDoc()` to write a new `/meetings/sessionX`.
2. **Unauthenticated Meeting Deletion**: A non-admin trying to delete `/meetings/sessionX`.
3. **Malicious Participant Read (PII Siphon)**: An unauthenticated user querying or listing all participant records in `/participants`.
4. **Malicious Participant Delete**: A user trying to delete their own or someone else's participant profile to bypass restrictions.
5. **Participant Hijacking**: Attempting to update another participant's existing record (IP, name) after it was created.
6. **Malicious Unblock (Self-Unblocking)**: An unauthenticated or standard user trying to delete a block record `/blockedIPs/1.2.3.4`.
7. **Malicious Block Insertion**: A visitor trying to block another visitor's IP directly by writing to `/blockedIPs/9.9.9.9`.
8. **Malicious Admin Setting Override**: Overwriting the admin password settings document `/adminSettings/settings`.
9. **Anomalous Document IDs**: Attempting to inject a huge 10KB string as a meeting ID or participant ID.
10. **Spoofed Join Time**: A participant posting a join time (`joinedAt`) that is in the future instead of matching `request.time`.
11. **Spoofed Block Status**: A participant joining with `blocked: true` and then trying to flip it to `false` in an update.
12. **Ghost Admin Write**: A user trying to sign in using an unverified or fake email claiming to be `learninghubbd2126509574@gmail.com` to bypass Google Sign-In checks.

---

## 3. The Test Runner Reference

These scenarios represent how permission rules must return `PERMISSION_DENIED` on all invalid attempts.

```typescript
// Example test cases mapping to security rules
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// All Dirty Dozen scenarios must assertFails
```
