---
name: Shopkeep
description: Digital asset storefront management bot for the Vouch platform. USE WHEN processing orders, listing items, answering customer questions, or generating sales analytics. Supports STL, SVG, digital art, ebooks, and any downloadable digital asset.
version: 0.1.0
author: Percival Labs
tags: [commerce, storefront, digital-assets, vouch, lightning]
---

# Shopkeep Skill

Manages all storefront operations: listing digital assets, processing Lightning-paid purchases, answering buyer questions, and reporting sales analytics. Operates autonomously within owner-defined constraints.

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **ListItem** | "list a new item", "add a product", "sell this file" | `Workflows/ListItem.md` |
| **ProcessOrder** | Purchase confirmation, payment webhook, "new order" | `Workflows/ProcessOrder.md` |
| **CustomerSupport** | Customer question, "help with purchase", product inquiry | `Workflows/CustomerSupport.md` |
| **Analytics** | "how are sales?", "show me stats", "analytics", "report" | `Workflows/Analytics.md` |

## API Reference

All endpoints require NIP-98 authentication signed with the bot's Nostr keypair.

### Listings
- `POST /v1/storefronts/{id}/listings` -- Create new listing
- `GET /v1/storefronts/{id}/listings` -- List all listings
- `GET /v1/storefronts/{id}/listings/{lid}` -- Get listing details
- `PATCH /v1/storefronts/{id}/listings/{lid}` -- Update listing (owner approval required for price)
- `DELETE /v1/storefronts/{id}/listings/{lid}` -- Remove listing (owner approval required)

### Orders
- `POST /v1/storefronts/{id}/listings/{lid}/purchase` -- Initiate purchase (returns Lightning invoice)
- `POST /v1/storefronts/{id}/listings/{lid}/confirm` -- Confirm payment and get download token
- `GET /v1/storefronts/{id}/orders` -- List orders for storefront

### Analytics
- `GET /v1/storefronts/{id}/analytics?period=daily|weekly|monthly` -- Sales analytics

## Examples

**Example 1: Owner lists a new STL file**
```
Owner: "List my new articulated dragon STL for 500 sats"
-> Invokes ListItem workflow
-> Collects: title, description, category (stl), price (500), file URL, preview images
-> Computes SHA-256 hash of the file
-> Creates listing via API, publishes NIP-99 event to relays
-> Reports listing URL and Nostr event ID to owner
```

**Example 2: Buyer purchases a listing**
```
System: Payment confirmed for listing lid_abc123
-> Invokes ProcessOrder workflow
-> Verifies payment via /confirm endpoint
-> Receives download token
-> Sends buyer: confirmation, download link, file hash, download limits
-> Logs sale, notifies owner with daily totals
```

**Example 3: Buyer asks about a product**
```
Buyer: "What material should I use for this STL?"
-> Invokes CustomerSupport workflow
-> Looks up listing metadata (recommended materials, dimensions, print settings)
-> Answers from listing data
-> Escalates to owner if answer not in metadata
```

**Example 4: Owner checks sales**
```
Owner: "How did we do this week?"
-> Invokes Analytics workflow
-> Fetches sales data for the week
-> Generates markdown report: revenue, transactions, top sellers, trends
-> Includes trend indicators and category breakdown
```
