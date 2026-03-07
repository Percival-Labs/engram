# Process Order Workflow

Handle a purchase confirmation: verify payment, deliver the download, and update records.

## Steps

1. **Receive Payment Notification**
   - Source: webhook callback or heartbeat polling of pending orders
   - Extract: `paymentHash`, `listingId`, `buyerPubkey`
   - Validate: all three fields present and well-formed

2. **Verify Payment**
   - `POST /v1/storefronts/{storefrontId}/listings/{listingId}/confirm`
   - Headers: `Authorization: Nostr <NIP98_EVENT>`, `Content-Type: application/json`
   - Body:
     ```json
     {
       "paymentHash": "<payment_hash_from_lightning_invoice>"
     }
     ```
   - API checks that the Lightning invoice is fully settled
   - Response includes:
     - `downloadToken` -- one-time use token for file access
     - `downloadUrl` -- token-gated download endpoint
     - `expiresAt` -- token expiry timestamp (7 days from now)
     - `remainingDownloads` -- starts at 5

3. **Notify Buyer**
   - Send purchase confirmation message including:
     - Listing title and description summary
     - Download URL with token: `{downloadUrl}?token={downloadToken}`
     - File hash for integrity verification: `sha256:{hash}`
     - Download limits: 5 downloads within 7 days
     - Support contact: reply to this message for help
   - Format as clean, scannable message (not a wall of text)

4. **Update Records**
   - Log sale locally:
     - Timestamp (ISO 8601)
     - Listing ID and title
     - Price in sats
     - Buyer pubkey (hex)
     - Payment hash
   - Update running totals: daily revenue, weekly revenue, transaction count
   - Check if listing has inventory limits -- if limited edition, decrement remaining count

5. **Notify Owner**
   - Send sale notification:
     - Listing title and price
     - Transaction number (e.g., "Sale #47")
     - Running daily total (e.g., "Today: 3 sales, 1,500 sats")
     - Running weekly total if significant milestone
   - Do NOT notify for every sale if volume is high -- batch into hourly summaries above 10 sales/hour

6. **Report Vouch Outcome**
   - After successful delivery, report outcome to Vouch:
     ```bash
     POST /v1/outcomes
     {
       "counterparty": "<buyer_hex_pubkey>",
       "role": "performer",
       "task_type": "digital-commerce",
       "task_ref": "storefront:{storefrontId}:order:{paymentHash}",
       "success": true,
       "rating": 5
     }
     ```
   - This builds the shopkeep's trust score through verified commerce

## Verification

- [ ] Payment hash verified as settled before any file access granted
- [ ] Buyer received download link with valid token
- [ ] File hash included in buyer notification
- [ ] Download limits enforced (5 downloads, 7-day expiry)
- [ ] Sale logged in local analytics
- [ ] Owner notified of the sale
- [ ] Vouch outcome reported for the transaction
