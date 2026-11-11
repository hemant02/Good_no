import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "./config.js";
import { createDraft, getDraft, listDrafts, updateDraft, type TestCaseDraft } from "./draft-store.js";
import { testRail } from "./testrail-client.js";

const server = new McpServer({
  name: "netmon-testrail-mcp",
  version: "0.1.0"
});

function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function register(
  name: string,
  description: string,
  schema: z.ZodTypeAny,
  handler: (args: any) => Promise<unknown>
): void {
  server.registerTool(name, { description, inputSchema: (schema as z.ZodObject<any>).shape }, async (args) => {
    try {
      return result(await handler(args));
    } catch (error) {
      return errorResult(error);
    }
  });
}

const positiveId = z.number().int().positive();
const moduleName = z.enum([
  "Authentication", "Packet Capture", "Rules Engine", "Replay",
  "Elasticsearch/OpenSearch", "Kibana/OpenSearch Dashboards", "Licensing",
  "Diagnostics", "ISO/LRP Upgrade", "User Management", "Reporting/Dashboards", "Other"
]);

function projectId(value?: number): number {
  const id = value ?? config.projectId;
  if (!id) throw new Error("Provide projectId or configure NETMON_PROJECT_ID");
  return id;
}

function toTestRailCase(draft: TestCaseDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: draft.title,
    custom_preconds: draft.preconditions ?? "",
    custom_steps_separated: draft.steps.map((step) => ({
      content: step.action,
      expected: step.expectedResult
    }))
  };
  if (draft.typeId) body.type_id = draft.typeId;
  if (draft.priorityId) body.priority_id = draft.priorityId;
  if (draft.refs) body.refs = draft.refs;
  if (draft.sourceReference) body.refs = [draft.refs, draft.sourceReference].filter(Boolean).join(", ");
  return body;
}

async function publishDraft(draftId: string): Promise<unknown> {
  const draft = await getDraft(draftId);
  if (draft.status === "created" && draft.createdCaseId) {
    return { message: "Draft was already created in TestRail", draft };
  }
  if (draft.status !== "approved") {
    throw new Error("Only QA-approved drafts can be published to TestRail");
  }

  try {
    const created = await testRail.addCase(draft.sectionId, toTestRailCase(draft)) as Record<string, unknown>;
    const caseId = Number(created.id);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      throw new Error(`TestRail response did not contain a valid case ID: ${JSON.stringify(created)}`);
    }
    const updated = await updateDraft(draftId, {
      status: "created",
      createdCaseId: caseId,
      lastError: undefined
    });
    return { message: "Approved test case created in TestRail", testRailCaseId: caseId, draft: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateDraft(draftId, { status: "approved", lastError: message });
    throw error;
  }
}

// Read-only TestRail tools.
register("testrail_get_projects", "List TestRail projects.", z.object({}), async () => testRail.getProjects());

register("testrail_get_project", "Get a TestRail project by ID.", z.object({
  projectId: positiveId
}), async ({ projectId }) => testRail.getProject(projectId));

register("testrail_get_suites", "List suites for a TestRail project.", z.object({
  projectId: positiveId.optional()
}), async ({ projectId: supplied }) => testRail.getSuites(projectId(supplied)));

register("testrail_get_sections", "List sections for the NetMon TestRail project, optionally within a suite.", z.object({
  projectId: positiveId.optional(),
  suiteId: positiveId.optional()
}), async ({ projectId: supplied, suiteId }) => testRail.getSections(projectId(supplied), suiteId ?? config.suiteId));

register("testrail_get_case_fields", "Get TestRail case fields and available custom fields. Run this before configuring the case template.", z.object({}), async () => testRail.getCaseFields());

register("testrail_get_cases", "List cases for the NetMon project. Supports suite/section filtering and pagination.", z.object({
  projectId: positiveId.optional(),
  suiteId: positiveId.optional(),
  sectionId: positiveId.optional(),
  limit: z.number().int().min(1).max(250).optional(),
  offset: z.number().int().min(0).optional()
}), async (args) => testRail.getCases(projectId(args.projectId), {
  suiteId: args.suiteId ?? config.suiteId,
  sectionId: args.sectionId,
  limit: args.limit,
  offset: args.offset
}));

register("testrail_get_case", "Get a TestRail case by case ID.", z.object({
  caseId: positiveId
}), async ({ caseId }) => testRail.getCase(caseId));

register("testrail_update_case", "Update an existing TestRail case. Supply TestRail API field names for fields specific to your project template.", z.object({
  caseId: positiveId,
  fields: z.record(z.unknown())
}), async ({ caseId, fields }) => testRail.updateCase(caseId, fields));

register("testrail_get_runs", "List test runs for the NetMon project.", z.object({
  projectId: positiveId.optional()
}), async ({ projectId: supplied }) => testRail.getRuns(projectId(supplied)));

register("testrail_create_run", "Create a TestRail run. Provide name and optionally suite_id, case_ids and milestone_id.", z.object({
  projectId: positiveId.optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  suiteId: positiveId.optional(),
  caseIds: z.array(positiveId).optional(),
  milestoneId: positiveId.optional(),
  includeAll: z.boolean().optional()
}), async (args) => {
  const body: Record<string, unknown> = { name: args.name, include_all: args.includeAll ?? false };
  if (args.description) body.description = args.description;
  if (args.suiteId ?? config.suiteId) body.suite_id = args.suiteId ?? config.suiteId;
  if (args.caseIds) body.case_ids = args.caseIds;
  if (args.milestoneId) body.milestone_id = args.milestoneId;
  return testRail.addRun(projectId(args.projectId), body);
});

register("testrail_add_result", "Record a result for a TestRail test ID.", z.object({
  testId: positiveId,
  statusId: positiveId,
  comment: z.string().optional(),
  version: z.string().optional(),
  elapsed: z.string().optional(),
  defects: z.string().optional()
}), async (args) => {
  const body: Record<string, unknown> = { status_id: args.statusId };
  for (const key of ["comment", "version", "elapsed", "defects"] as const) {
    if (args[key]) body[key] = args[key];
  }
  return testRail.addResult(args.testId, body);
});

// NetMon AI -> human review -> TestRail workflow.
register(
  "netmon_create_testcase_draft",
  "Save an AI-generated NetMon test case as pending QA review. This tool NEVER creates a TestRail case.",
  z.object({
    title: z.string().min(5),
    projectId: positiveId.optional(),
    suiteId: positiveId.optional(),
    sectionId: positiveId,
    module: moduleName,
    sourceReference: z.string().optional().describe("Jira issue key, such as NETMON-123"),
    preconditions: z.string().optional(),
    steps: z.array(z.object({
      action: z.string().min(1),
      expectedResult: z.string().min(1)
    })).min(1),
    priorityId: positiveId.optional(),
    typeId: positiveId.optional(),
    refs: z.string().optional()
  }),
  async (args) => createDraft({
    ...args,
    projectId: projectId(args.projectId),
    suiteId: args.suiteId ?? config.suiteId
  })
);

register("netmon_list_testcase_drafts", "List generated NetMon test case drafts, optionally filtered by review status.", z.object({
  status: z.enum(["pending_review", "approved", "rejected", "created"]).optional()
}), async ({ status }) => listDrafts(status));

register(
  "netmon_review_testcase",
  "Record QA approval or rejection. Approval automatically publishes the draft to TestRail; rejection never creates a TestRail case.",
  z.object({
    draftId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    reviewer: z.string().min(1),
    reviewNote: z.string().optional()
  }),
  async ({ draftId, decision, reviewer, reviewNote }) => {
    const draft = await getDraft(draftId);
    if (draft.status === "created") {
      return { message: "This draft has already been created in TestRail", draft };
    }
    if (draft.status !== "pending_review" && draft.status !== "approved") {
      throw new Error(`Cannot review a draft in status: ${draft.status}`);
    }
    if (decision === "reject") {
      return updateDraft(draftId, {
        status: "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewer,
        reviewNote
      });
    }
    await updateDraft(draftId, {
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewer,
      reviewNote,
      lastError: undefined
    });
    return publishDraft(draftId);
  }
);

register(
  "netmon_publish_approved_testcase",
  "Retry publishing a previously approved draft if the TestRail API call failed. Only approved drafts can be published.",
  z.object({ draftId: z.string().uuid() }),
  async ({ draftId }) => publishDraft(draftId)
);

register(
  "netmon_find_regression_candidates",
  "Find existing NetMon test cases related to changed modules or keywords. Use the output as a suggested regression shortlist, not as proof of full impact coverage.",
  z.object({
    modules: z.array(moduleName).min(1),
    keywords: z.array(z.string()).optional(),
    projectId: positiveId.optional(),
    suiteId: positiveId.optional(),
    limit: z.number().int().min(1).max(250).optional()
  }),
  async (args) => {
    const response = await testRail.getCases(projectId(args.projectId), {
      suiteId: args.suiteId ?? config.suiteId,
      limit: args.limit ?? 250,
      offset: 0
    }) as { cases?: Array<Record<string, unknown>> };
    const terms = [...args.modules, ...(args.keywords ?? [])].map((s) => s.toLowerCase());
    const cases = (response.cases ?? []).filter((item) => {
      const haystack = [item.title, item.refs, item.custom_preconds, item.custom_steps, item.custom_expected]
        .filter(Boolean).join(" ").toLowerCase();
      return terms.some((term) => haystack.includes(term));
    });
    return {
      note: "Keyword/module matching is a first-pass suggestion. Review impacted services and dependencies before deciding the final regression scope.",
      matchedCount: cases.length,
      cases
    };
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Do not log to stdout: stdout is reserved for MCP JSON-RPC messages.
  console.error("NetMon TestRail MCP server started");
}

main().catch((error: unknown) => {
  console.error("Failed to start NetMon TestRail MCP server:", error);
  process.exitCode = 1;
});
