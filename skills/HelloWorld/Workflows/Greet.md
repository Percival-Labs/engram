# Greet

Respond with a personalized greeting.

## Steps

1. Read the user's name from settings.json `principal.name` (default: "there")
2. Read the AI's name from settings.json `identity.name` (default: "Assistant")
3. Respond: "Hello, {user}! I'm {ai}, your AI assistant. How can I help today?"

## Verification

- [ ] Greeting includes both user and AI names
- [ ] Falls back gracefully if settings.json is missing
