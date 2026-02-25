# CreateTeam

Set up a new team with shared resources and initial configuration.

## Steps

1. **Gather info** — Ask for team name and description
2. **Generate team** — Create team with UUID, set creator as owner
3. **Create shared dirs** — Set up shared-skills/ and shared-memory/
4. **Update config** — Add team_id to user's config.json
5. **Confirm** — Show team ID and next steps

## CLI Equivalent

```bash
engram team create <name>
```

## Output Format

```
✓ Team created: {name}
  ID: {uuid}
  Shared skills: ~/.engram/teams/{id}/shared-skills/
  Shared memory: ~/.engram/teams/{id}/shared-memory/

Next steps:
  engram team invite {name} <email>
  engram agent create <name> --team {name}
```
