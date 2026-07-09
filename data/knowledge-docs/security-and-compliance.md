---
documentType: security-guide
source: "Security & Compliance Handbook (internal simplified edition)"
---

# Security and Compliance Considerations for Cloud Adoption

## Vendor risk assessments

Most enterprise security organizations require a formal vendor risk
assessment before any workload or data can move to a new cloud provider.
Typical duration is 2-4 weeks, but can extend if the assessment reveals
open questions about encryption, access control, or subprocessor chains.
Account teams should plan proposal timelines assuming this review runs in
parallel with commercial discussions, not after them.

## HIPAA-regulated workloads

Healthcare customers moving patient data must ensure:

- A signed Business Associate Agreement (BAA) is in place with the cloud
  provider.
- Data is encrypted at rest and in transit using approved standards.
- Access is scoped with least-privilege role-based access control and fully
  audited.
- **Azure Health Data Services** is purpose-built for FHIR-compliant,
  HIPAA-eligible storage of patient records, reducing the compliance
  engineering burden versus a general-purpose storage design.

A managed landing zone approach is strongly recommended for healthcare
customers with small internal cloud teams, since it centralizes compliance
controls (network isolation, logging, identity) rather than requiring each
workload team to reimplement them.

## Financial services regulatory approval

Banking and financial services customers frequently operate under regulatory
frameworks that require formal approval before data crosses regions or
providers. Observed timelines are commonly **60-90 days** for data movement
approval. Recommended mitigation: identify a use case that does not require
moving primary regulated data, such as a **disaster recovery (DR) target**,
to build cloud presence and trust ahead of a full migration ask.

## Data residency

When a customer operates across jurisdictions (e.g., EU manufacturing
plants, EU customer data), architecture must ensure data generated in a
region stays within that region's approved boundary unless a valid legal
transfer mechanism applies. This typically means provisioning a dedicated
regional landing zone rather than relying on a single global environment.

## Multi-cloud governance

Regulated or risk-averse customers may mandate multi-cloud strategies at
the board level to avoid single-vendor lock-in. Architecture should support
this rather than push against it: **Azure Arc** enables a consistent
governance and management plane across multiple clouds, and **Azure
ExpressRoute** provides low-latency, private connectivity between
environments without requiring the customer to abandon their existing
provider.
