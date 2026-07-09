---
documentType: architecture-guide
source: "Cloud Architecture Recommendations (internal simplified edition)"
---

# Cloud Architecture Recommendations by Workload Pattern

## IoT and telemetry workloads

For factory floor or edge telemetry, prefer an event-driven ingestion pattern:

- **Azure IoT Hub** for device connectivity and message ingestion.
- **Azure IoT Edge** or **Azure Arc** for hybrid management when devices must
  stay physically on-prem.
- Downstream, route telemetry into **Azure Stream Analytics** or **Azure
  Synapse** for near-real-time dashboards, keeping raw data in a data lake tier
  for later reprocessing.

## Analytics workloads migrating from other warehouses

When a customer is moving analytics workloads off of a warehouse like BigQuery
or Redshift, **Azure Synapse Analytics** is the standard target. Key migration
considerations:

- Separate storage and compute so ad-hoc query spikes don't require
  permanently larger clusters.
- Migrate schema and pipelines incrementally, validating query results against
  the legacy system before cutting over reporting workloads.
- Watch for cost overruns driven by unrestricted ad-hoc querying; apply
  workload management and query governance early.

## Machine learning and GPU workloads

For GPU-intensive workloads (route optimization, computer vision, model
training), **Azure Machine Learning** managed compute clusters allow
on-demand GPU provisioning without customers owning physical GPU capacity.
This is typically far more cost-competitive than reserving GPUs on a
warehouse-oriented cloud provider not optimized for ML workloads.

## Kubernetes sprawl

Organizations that grow organically often end up with many small, regionally
siloed Kubernetes clusters, each carrying its own control-plane overhead and
inconsistent policies. The recommended remediation path:

1. Establish a shared cost-attribution/tagging baseline so each team can see
   its real spend (this alone often builds the political case for
   consolidation).
2. Consolidate clusters by region or business unit, not globally in one step.
3. Standardize on a shared platform team owning cluster lifecycle, while
   product teams retain workload-level autonomy via namespaces.

## Compliance-sensitive workloads (healthcare, financial services)

For healthcare workloads subject to HIPAA, **Azure Health Data Services**
provides FHIR-compliant storage designed for patient records. Pair this with
a **managed landing zone** so customers with limited internal cloud
engineering capacity are not responsible for building compliance controls
from scratch.

For financial services, **Azure Confidential Computing** and strict
network isolation (private endpoints, ExpressRoute) are typically required
before any regulated workload can move, and mainframe-adjacent core banking
systems should be treated as out of scope for early migration waves.

## Media and content workloads

Media companies frequently over-retain content in hot storage tiers. A
lifecycle/tiering policy (hot -> cool -> archive based on access patterns) is
usually the single highest-leverage cost optimization. AI-based video
indexing (automatic tagging, transcript-based search) is a common
complementary opportunity that also creates new content monetization paths.
