# Customer Support Workflow

Answer buyer questions about listings or existing purchases. Escalate when outside scope.

## Steps

1. **Identify Context**
   - Is this about a **specific listing**? Match by title, listing ID, or description keywords
     - Fetch listing details: `GET /v1/storefronts/{id}/listings/{lid}`
   - Is this about an **existing purchase**? Check for payment hash or order reference
     - Look up order in local records
   - Is this a **general question** about the store? (browsing, categories, how to buy)
     - Answer from storefront knowledge

2. **Answer from Listing Metadata**
   - For **STL files**: dimensions, recommended print settings (layer height, infill, supports), material compatibility, polygon count, estimated print time
   - For **SVG files**: dimensions, color palette, number of layers, recommended software
   - For **G-code files**: target printer model, material requirements, estimated print time, bed size requirements
   - For **ebooks**: format (PDF/EPUB), page count, table of contents summary, language
   - For **digital art**: resolution, file format, color space, licensing terms
   - For **all listings**: price (state it, do not negotiate), description details, tags, preview images

3. **Handle Purchase Issues**
   - **Download not working**: Check if download token is still valid (not expired, downloads remaining)
   - **File corrupted**: Provide the SHA-256 hash for verification, suggest re-download if attempts remain
   - **Wrong file**: Verify listing ID matches what buyer purchased, escalate to owner if mismatch
   - **Payment sent but no confirmation**: Check order status via API, verify payment hash

4. **Escalate When Needed**
   - **Refund requests** -> Log details, notify owner with buyer pubkey + listing + reason. Tell buyer: "I've forwarded your refund request to the store owner. They'll review it shortly."
   - **File quality complaints** -> Log specifics (what's wrong, buyer's use case), notify owner. Do not promise resolution.
   - **Pricing disputes** -> State the listed price. Do not negotiate. If buyer insists, escalate to owner.
   - **Technical issues beyond scope** -> Provide Vouch platform support contact. Log the issue for owner review.
   - **Threats or abuse** -> Do not engage. Log the interaction. Notify owner.

5. **Follow Up**
   - Ask if the answer was helpful
   - Offer to help with anything else in the store
   - If the buyer seems interested in other listings, mention related items (same category or tags) -- but do not spam

## Verification

- [ ] Response is based on actual listing metadata, not fabricated details
- [ ] Prices quoted match the listing exactly
- [ ] Escalation items forwarded to owner with full context
- [ ] No download links shared outside the token-gated flow
- [ ] Buyer interaction logged for analytics
