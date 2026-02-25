---
name: TeamAdmin
description: Team and agent management workflows. USE WHEN manage team OR add member OR create agent OR team settings OR agent autonomy OR team permissions.
---

# TeamAdmin

Administrative workflows for managing teams, agents, and their configurations within the Engram enterprise layer.

- **CreateTeam**: Set up a new team with shared resources
- **ManageMembers**: Invite, remove, or change member roles
- **ConfigureAgent**: Create or modify agent principals
- **ReviewAutonomy**: Check and adjust autonomy levels

## Workflow Routing

| Intent | Workflow | When to use |
|--------|----------|-------------|
| Create a team | [CreateTeam](Workflows/CreateTeam.md) | "create a team", "set up a new team", "start a team" |
| Manage members | [ManageMembers](Workflows/ManageMembers.md) | "add member", "remove member", "change role", "invite" |
| Configure agent | [ConfigureAgent](Workflows/ConfigureAgent.md) | "create agent", "set up agent", "configure bot" |
| Review autonomy | [ReviewAutonomy](Workflows/ReviewAutonomy.md) | "check autonomy", "what can this agent do", "autonomy level" |

## Examples

**Example 1: Create a team**
> User: "Create a research team for our AI projects"
Routes to: `CreateTeam` — prompts for team name, description, creates shared directories.

**Example 2: Add a team member**
> User: "Invite sarah@company.com to the research team"
Routes to: `ManageMembers` — adds member record, assigns default role.

**Example 3: Check agent permissions**
> User: "What can our CodeBot agent do?"
Routes to: `ReviewAutonomy` — shows autonomy level, permitted actions, Vouch score.
