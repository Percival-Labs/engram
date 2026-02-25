# ManageMembers

Invite, remove, or change roles for team members.

## Steps

1. **Identify team** — Which team to modify
2. **Identify action** — invite, remove, or change role
3. **Execute** — Run the appropriate CLI command
4. **Confirm** — Show updated member list

## Roles

| Role | Permissions |
|------|-------------|
| owner | Full control, can delete team |
| admin | Manage members, change settings |
| member | Use shared resources |
| observer | Read-only access to shared memory |

## CLI Equivalent

```bash
engram team invite <team> <email>
engram team remove <team> <member-id>
```
