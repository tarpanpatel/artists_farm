# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Enhancements & Platform Optimization

- [ ] **GST Billing Support**
  - **Problem:** No way to generate a GST-compliant bill for guests who need one (common for business travelers billing their company). No GSTIN field exists anywhere in the backend yet.
  - **Action:** Add a GSTIN field on `properties` (the property's own registration number, needed on any GST invoice regardless of guest) and an optional per-guest/per-receipt GSTIN + billing name (for guests who want the invoice addressed to their company, not themselves personally) - likely on `guests` or captured at checkout time on the receipt record. Frontend: an optional "GST Bill" toggle in the checkout/receipt flow that, when the guest provides a GSTIN, generates a proper tax invoice (property GSTIN, guest/company GSTIN, tax breakdown - CGST/SGST or IGST depending on same-state vs. inter-state) instead of the regular receipt. Needs the correct GST rate(s) for this business category - not hardcoded, should come from a config value so it can be updated if rates change.

---
*Last Updated: August 2026*
