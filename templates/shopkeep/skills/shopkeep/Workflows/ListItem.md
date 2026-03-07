# List Item Workflow

Add a new digital asset listing to the storefront and publish it to Nostr relays.

## Steps

1. **Collect Information**
   - Title (required) -- clear, descriptive name for the asset
   - Description (required) -- what the buyer gets, key features, use cases
   - Category (required) -- one of: `stl`, `svg`, `gcode`, `digital_art`, `ebook`, `template`, `dataset`, `other`
   - Price in sats (required) -- whole number, minimum 1 sat
   - File URL (required) -- must be `https://`, publicly accessible for hash computation
   - Preview image URLs (optional) -- up to 10 images, must be `https://`
   - Tags (optional) -- lowercase, hyphenated keywords for discoverability
   - Metadata (optional) -- category-specific fields:
     - STL: dimensions (mm), recommended material, print settings, polygon count
     - SVG: dimensions (px), color count, layer count
     - G-code: target printer, material, estimated print time
     - Ebook: format (PDF/EPUB), page count, language
     - Other: freeform key-value pairs

2. **Validate Inputs**
   - Title: 3-200 characters, no control characters
   - Description: 10-5000 characters
   - Price: positive integer
   - File URL: valid HTTPS URL, responds with 200 status
   - Preview URLs: valid HTTPS URLs

3. **Compute File Hash**
   - Download the file from the provided URL
   - Compute SHA-256 hash for integrity verification
   - Store hash with the listing for buyer verification
   - Confirm hash with owner before proceeding

4. **Create Listing**
   - `POST /v1/storefronts/{storefrontId}/listings`
   - Headers: `Authorization: Nostr <NIP98_EVENT>`, `Content-Type: application/json`
   - Body:
     ```json
     {
       "title": "...",
       "description": "...",
       "category": "stl",
       "priceSats": 500,
       "fileUrl": "https://...",
       "fileHash": "sha256:abc123...",
       "previewUrls": ["https://..."],
       "tags": ["dragon", "articulated"],
       "metadata": { "dimensions": "150x80x60mm", "material": "PLA" }
     }
     ```
   - Capture the returned `listingId`

5. **Publish to Nostr**
   - Build NIP-99 Kind 30402 classified listing event:
     ```json
     {
       "kind": 30402,
       "tags": [
         ["d", "<listingId>"],
         ["title", "<title>"],
         ["summary", "<first 200 chars of description>"],
         ["price", "<priceSats>", "sats"],
         ["t", "<tag1>"],
         ["t", "<tag2>"],
         ["image", "<previewUrl>"],
         ["location", "vouch-storefront"],
         ["published_at", "<unix_timestamp>"]
       ],
       "content": "<full description>"
     }
     ```
   - Sign with bot's Nostr keypair
   - Publish to configured relays

6. **Confirm to Owner**
   - Report listing ID and URL
   - Report Nostr event ID and relay URLs
   - Listing is now live and discoverable

## Verification

- [ ] Listing appears in `GET /v1/storefronts/{id}/listings` response
- [ ] File hash matches the uploaded file
- [ ] NIP-99 event is retrievable from at least one configured relay
- [ ] Preview images load correctly
- [ ] Price is displayed correctly in sats
