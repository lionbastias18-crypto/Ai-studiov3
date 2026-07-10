# Security Specification & Threat Model

This document outlines the data invariants, threat vectors, rogue payloads, and the validation strategy to secure the Infdev Voxel Engine multiplayer platform.

## 1. Data Invariants

1. **Identity & Creator Uniqueness**: Only the authentic user who created a world can delete it. A user cannot masquerade as another player by setting the `creator` ID to a different UID.
2. **Strict Session Presence**: Users can only write their own heartbeat presence under `/worlds/{worldId}/players/{userId}`. They cannot alter or spoof another active player's position, name, or metadata.
3. **Immutability of Key Metadata**: Once a world is created, its core properties (`id`, `creator`, `createdAt`, `worldType`) cannot be altered or corrupted via client-side updates.
4. **Role Access Control (RBAC)**: Only the admin (`lionbastias18@gmail.com`) can escalate permissions, assign user roles, or delete role descriptors. Other users can read roles or set their own biome parameters.

## 2. The "Dirty Dozen" Rogue Payloads

Here are 12 specific payloads designed to challenge and test the integrity of our security rules:

1. **Payload 01: Shadow Escalation**: A standard user attempting to write to `user_roles/other_user@gmail.com` setting their role to "staff" or "owner".
2. **Payload 02: Impersonate Creator**: Creating a world where the `creator` field is different from `request.auth.uid`.
3. **Payload 03: World Tampering**: Updating another player's world configuration (e.g. changing gameMode or name) when the current user is not the creator.
4. **Payload 04: Infinite ID Poisoning**: Registering a player presence with a massive, 1MB document ID string to exhaust cloud resources.
5. **Payload 05: Foreign Heartbeat Spoofing**: Overwriting another user's position coordinates under `/worlds/{worldId}/players/someone_else`.
6. **Payload 06: Invalid Game Mode**: Creating/updating a world with `gameMode: "god_mode"`.
7. **Payload 07: Invalid Generation Style**: Creating/updating a world with `worldType: "hyper_flat_galaxy"`.
8. **Payload 08: Orphaned Activity Log**: Injecting an activity log without a valid logged-in user session.
9. **Payload 09: Massive Activity Log Action**: Writing a 1MB action string inside an activity log.
10. **Payload 10: Unauthorized Log Inspection**: A standard user attempting to read the `/activity_logs` collection.
11. **Payload 11: Rogue Role Deletion**: A standard user attempting to delete a role descriptor under `/user_roles/{email}`.
12. **Payload 12: Custom Biome Escalation**: Setting the role property to "staff" while attempting to modify the biome configurations as a normal user.

---

## 3. Test Cases (TDD Verification)

Every one of these payloads will be rejected with `PERMISSION_DENIED` by our security rules.
