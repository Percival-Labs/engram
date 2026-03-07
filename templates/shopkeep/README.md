# Shopkeep Bot Template

A digital asset storefront bot for the Vouch platform. Manages listings, processes Lightning payments, answers customer questions, and tracks sales analytics.

## What You Get

```
shopkeep/
  harness.md.template    # Bot identity and behavior (YAML frontmatter + markdown)
  config.json.template   # Storefront-specific configuration
  skills/
    shopkeep/
      SKILL.md           # Skill definition with API reference
      Workflows/
        ListItem.md      # Add new digital asset listings
        ProcessOrder.md  # Verify payments and deliver downloads
        CustomerSupport.md  # Answer buyer questions
        Analytics.md     # Sales reporting and insights
```

## Usage

1. Copy this template directory
2. Replace `{{PLACEHOLDER}}` values in `harness.md.template` and `config.json.template`
3. Rename `harness.md.template` to `harness.md`
4. Run: `engram bot init <name> --harness ./harness.md`

## Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{BOT_NAME}}` | Your bot's name | `DragonShop` |
| `{{OWNER_NAME}}` | Your name or org | `Alice` |
| `{{OWNER_PUBKEY}}` | Your Nostr hex pubkey | `abc123...` |
| `{{PLATFORM}}` | Primary platform | `nostr` |
| `{{STOREFRONT_NAME}}` | Display name for the store | `Dragon's Den 3D` |
| `{{STOREFRONT_SLUG}}` | URL-safe store identifier | `dragons-den-3d` |
| `{{STOREFRONT_ID}}` | API storefront ID (from registration) | `sf_abc123` |
| `{{API_URL}}` | Vouch Storefront API URL | `https://percivalvouch-api-production.up.railway.app` |

## Supported Asset Categories

- `stl` -- 3D printable models
- `svg` -- Vector graphics
- `gcode` -- CNC/3D printer instructions
- `digital_art` -- Raster artwork (PNG, JPG, PSD)
- `ebook` -- Books and documents (PDF, EPUB)
- `template` -- Design or code templates
- `dataset` -- Data files and databases
- `other` -- Anything downloadable

## How It Works

1. **Owner lists an item** -> Bot collects metadata, computes file hash, publishes to API + Nostr
2. **Buyer pays Lightning invoice** -> Bot verifies settlement, generates download token, delivers link
3. **Buyer has questions** -> Bot answers from listing metadata, escalates when needed
4. **Owner wants stats** -> Bot generates markdown analytics report with trends
