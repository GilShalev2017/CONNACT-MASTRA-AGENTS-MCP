# Agent Tool Routing Matrix

## Purpose
This matrix defines when the solution should use CRM tools versus RAG semantic search, and which agent should handle each request.

## Core routing rules
- Use CRM tools for specific customer lookups, customer history, customer profile data, spend, cloud usage, and portfolio prioritization.
- Use RAG semantic search when the answer needs migration guidance, architecture reasoning, security/compliance guidance, FinOps context, or playbook-style explanation.
- Avoid redundant CRM calls. For history-style questions, prefer the meeting-history tool only unless the prompt explicitly asks for profile or spend context.
- Use the specialist agents for their intended workloads rather than forcing every request through the general chat agent.

## Tool routing matrix

| User intent | Primary agent | Preferred CRM tool(s) | RAG semantic search needed? | Why / reasoning |
| --- | --- | --- | --- | --- |
| Portfolio prioritization: “which customers should we prioritize?” | CloudPartnershipAgent | getMigrationOpportunities | Yes | CRM identifies the candidate accounts; RAG adds migration-fit reasoning, architecture guidance, and next-step recommendations. |
| Specific customer profile: account, industry, cloud, spend, health, owner | CloudPartnershipAgent | getCustomer or getCustomerCloudUsage | Optional | The answer is grounded in the customer record; RAG is only needed if the user wants best-practice context. |
| Specific customer history: meetings, discussions, transcripts, latest call | historySummarizerAgent | getCustomerHistory | No | This is a direct history retrieval and summarization task and should not trigger unrelated profile lookups. |
| Customer blockers / technical concerns | CloudPartnershipAgent | getCustomerHistory + getCustomer or getCustomerCloudUsage | Yes, if the user wants architectural or migration guidance | The blocker is in CRM/customer context; RAG supplies external explanation and playbook context. |
| Portfolio overview / discover valid customer IDs | CloudPartnershipAgent | listCustomers | No | This is a discovery/listing task, not a specific-account lookup. |
| Executive briefing creation | executiveBriefingAgent | CRM context from the workflow | Yes | This agent is for reporting-style outputs that synthesize CRM context plus knowledge-base evidence. |
| Raw transcript analysis | meetingAnalysisAgent | None | No | This agent is for structured transcript analysis, not CRM tool routing. |

## Example mappings from the current UI

| Example prompt | Primary agent | CRM tool(s) | RAG semantic search | Reasoning |
| --- | --- | --- | --- | --- |
| “Which customers are good candidates for Azure migration?” | CloudPartnershipAgent | getMigrationOpportunities | Yes | CRM finds the relevant customers; RAG explains why they are strong migration candidates. |
| “What technical blockers were mentioned by Acme Manufacturing?” | CloudPartnershipAgent | getCustomerHistory | Optional | The blockers are likely captured in meeting history; RAG helps explain how to address them. |
| “Summarize the latest discussion with Northwind Retail Group.” | historySummarizerAgent | getCustomerHistory | No | This is a direct history-summary question. |
| “Which customers have cloud optimization opportunities?” | CloudPartnershipAgent | getMigrationOpportunities | Yes | CRM finds the accounts; RAG adds optimization best-practice context. |
| “What’s driving Summit Logistics’ urgency to move off GCP?” | CloudPartnershipAgent | getCustomer + getCustomerHistory | Optional | The core evidence comes from customer profile and history; RAG adds deeper explanation. |

## Agent responsibilities

### CloudPartnershipAgent
Used for general customer / portfolio interactions, CRM lookups, and mixed CRM + RAG questions.

### historySummarizerAgent
Used for direct meeting-history and discussion-summary questions based on CRM data only.

### meetingAnalysisAgent
Used for structured analysis of raw meeting transcripts, including summaries, sentiment, action items, and risks.

### executiveBriefingAgent
Used for executive-style summaries and recommendations based on CRM context plus knowledge-base evidence.

## Practical routing policy
- Use CloudPartnershipAgent for “which customers”, “what’s driving”, and “what blockers” style prompts.
- Use historySummarizerAgent for “summarize the latest discussion / meeting / call” style prompts.
- Use meetingAnalysisAgent for transcript analysis workflows.
- Use executiveBriefingAgent for briefing and reporting workflows.
