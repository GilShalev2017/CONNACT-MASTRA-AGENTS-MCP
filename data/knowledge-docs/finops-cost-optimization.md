---
documentType: finops-guide
source: "FinOps Cost Optimization Playbook (internal simplified edition)"
---

# FinOps and Cloud Cost Optimization Concepts

## The three FinOps phases

1. **Inform** - give every team visibility into their real cloud spend
   through consistent tagging and cost allocation. Without this, cost
   conversations are political rather than data-driven.
2. **Optimize** - act on that visibility: right-size instances, apply
   reserved capacity or savings plans, and eliminate idle resources.
3. **Operate** - make cost accountability an ongoing operating rhythm (e.g.,
   monthly spend reviews), not a one-time project.

## Idle and overprovisioned capacity

A very common pattern, especially in retail and seasonal businesses, is
provisioning ahead of a demand peak (holiday season, product launch) and
never scaling back down afterward. Signs of this include compute utilization
consistently below 40% outside of known peak windows. The fix is usually an
autoscaling redesign paired with a scheduled review before the next peak
season, not a one-time manual right-sizing pass.

## Reserved capacity and savings plans

For workloads with predictable, steady-state usage, reserved instances or
savings plans typically deliver 15-25% savings versus pay-as-you-go pricing.
These commitments work best after right-sizing is complete — committing to
reserved capacity before right-sizing risks locking in waste.

## Tagging and cost attribution

Cost attribution problems ("nobody can tell me which team owns which spend")
are usually an organizational blocker to optimization, not a technical one.
A minimal viable tagging taxonomy (owning team, environment, cost center)
is often enough to unlock internal accountability and build the case for
larger initiatives like Kubernetes cluster consolidation.

## Storage lifecycle management

Storage costs frequently grow faster than actual usage because organizations
default to "keep everything in hot storage." A tiering policy that
automatically moves infrequently accessed data to cool or archive tiers
based on access patterns is typically the single highest-leverage storage
cost optimization, especially for media, logging, and backup data.

## Kubernetes and container cost sprawl

Multiple Kubernetes clusters created organically by different teams
duplicate control-plane overhead and complicate cost attribution.
Consolidation is usually blocked more by organizational politics than
technical complexity — starting with visibility (tagging/cost attribution)
before proposing consolidation tends to succeed more often than leading with
a top-down technical mandate.
