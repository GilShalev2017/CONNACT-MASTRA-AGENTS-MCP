---
documentType: migration-guide
source: "Azure Cloud Adoption Playbook (internal simplified edition)"
---

# Azure Migration Guide: Phased Approach for Enterprise Workloads

## Why phased migration beats big-bang cutovers

Enterprise workloads rarely migrate cleanly in a single event. A phased migration
reduces blast radius, lets teams validate assumptions on low-risk workloads first,
and creates natural checkpoints for security and compliance sign-off. The
recommended sequence is:

1. **Assess** - inventory workloads, dependencies, and data classification.
2. **Pilot** - migrate a small, non-critical workload to validate networking,
   identity, and monitoring.
3. **Migrate in waves** - group workloads by dependency and business criticality.
   Stateless and low-dependency workloads move first.
4. **Optimize** - right-size compute, apply reserved capacity, and clean up
   temporary bridge infrastructure (e.g., VPN tunnels used only during cutover).

## Handling tightly coupled on-prem or SCADA-adjacent systems

Manufacturing and industrial customers often have factory-floor systems (SCADA,
historians, PLUCs) that are tightly coupled to on-premises networks via dedicated
circuits such as AWS Direct Connect or ExpressRoute. These systems should not be
part of an initial migration wave. Instead:

- Start with **telemetry and analytics workloads** that read from these systems
  rather than control them directly.
- Use **Azure IoT Hub** or **Azure IoT Edge** to bridge factory floor data without
  re-architecting control systems immediately.
- Treat control-plane migration (anything that can affect physical equipment) as
  a separate, later-phase project with its own risk review.

## Data residency considerations

When customers operate in multiple regions (for example, EU manufacturing
plants), migration plans must account for data residency law. A common pattern
is to stand up a regional **landing zone** so that data generated in a
jurisdiction stays within approved regions, even when the broader migration
program is managed centrally.

## Multi-cloud and disaster recovery entry points

Not every customer wants a full migration. Regulated industries (banking,
insurance) often mandate multi-cloud strategies to avoid vendor lock-in. In these
cases, a lower-risk entry point is to use the new cloud as a **disaster
recovery (DR) target** rather than a primary environment. This satisfies
resilience requirements without triggering the full regulatory approval process
associated with moving primary data.

## Typical blockers observed in migration discovery calls

- Security/vendor risk assessments in queue (often 2-4 weeks)
- Data residency requirements not yet scoped
- Legacy system coupling (SCADA, mainframes) with no clear decoupling plan
- Lack of internal cloud engineering headcount to execute
- Regulatory approval requirements for regulated industries (60-90 days is
  common in financial services)
