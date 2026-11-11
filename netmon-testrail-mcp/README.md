# NetMon TestRail MCP Server (POC)

A TypeScript MCP server for managing NetMon test cases in TestRail. It is based on the tool coverage and TestRail API integration approach in [bun913/mcp-testrail](https://github.com/bun913/mcp-testrail), with an additional QA review gate for AI-generated test cases.

## Workflow

1. Generate test cases from a NetMon Jira story, requirement, API specification, or code change using your preferred LLM.
2. Save each generated case with `netmon_create_testcase_draft`. This creates a local draft only; it does **not** call TestRail.
3. QA reviews drafts using `netmon_list_testcase_drafts`.
4. QA approves or rejects with `netmon_review_testcase`.
5. An approved draft is created in TestRail. Rejected or pending drafts are never published.
6. If a TestRail API call fails, retry an approved draft using `netmon_publish_approved_testcase`.

## NetMon module taxonomy

- Authentication (JWT / Keycloak)
- Packet Capture
- Rules Engine
- Replay
- Elasticsearch / OpenSearch
- Kibana / OpenSearch Dashboards
- Licensing
- Diagnostics
- ISO / LRP Upgrade
- User Management
- Reporting / Dashboards
- Other

## Requirements

- Node.js 20.18.1 or later
- TestRail instance with API access enabled
- TestRail user credentials and API key
- A TestRail project, plus a section where approved cases will be created

## Setup

```bash
cd netmon-testrail-mcp
npm install
cp .env.example .env
```

Update `.env`:

```env
TESTRAIL_URL=https://your-instance.testrail.io
TESTRAIL_USERNAME=qa-user@company.com
TESTRAIL_API_KEY=your-api-key
NETMON_PROJECT_ID=1
NETMON_SUITE_ID=
DRAFT_STORE_PATH=.data/testcase-drafts.json
```

Build and run:

```bash
npm run build
npm start
```

For local development:

```bash
npm run dev
```

## MCP client configuration

Configure your MCP host to launch the built server using an absolute path:

```json
{
  "mcpServers": {
    "netmon-testrail": {
      "command": "node",
      "args": ["/absolute/path/to/netmon-testrail-mcp/dist/index.js"],
      "env": {
        "TESTRAIL_URL": "https://your-instance.testrail.io",
        "TESTRAIL_USERNAME": "qa-user@company.com",
        "TESTRAIL_API_KEY": "YOUR_API_KEY",
        "NETMON_PROJECT_ID": "1",
        "NETMON_SUITE_ID": ""
      }
    }
  }
}
```

Never commit `.env` or a real API key.

## Available MCP tools

| Tool | Purpose |
|---|---|
| `testrail_get_projects` | List TestRail projects |
| `testrail_get_project` | Get a project |
| `testrail_get_suites` | List suites |
| `testrail_get_sections` | List project sections |
| `testrail_get_case_fields` | Inspect available case fields |
| `testrail_get_cases` | List/filter/paginate cases |
| `testrail_get_case` | Get a case |
| `testrail_update_case` | Update an existing case |
| `testrail_get_runs` | List test runs |
| `testrail_create_run` | Create a test run |
| `testrail_add_result` | Add a result for a TestRail test |
| `netmon_create_testcase_draft` | Save AI-generated case for review only |
| `netmon_list_testcase_drafts` | List drafts by status |
| `netmon_review_testcase` | Approve/reject; approval publishes to TestRail |
| `netmon_publish_approved_testcase` | Retry publishing an approved draft |
| `netmon_find_regression_candidates` | Keyword/module-based regression shortlist |

## TestRail template and custom fields

Before creating cases, run `testrail_get_case_fields` and inspect your project's case template. This POC currently sends the separated-steps field `custom_steps_separated`. TestRail projects can require other custom fields or use another template; adapt `toTestRailCase` in `src/index.ts` to match your project configuration before using it with a real project.

Each approved draft is created in the TestRail section specified by `sectionId`. Provide the correct section ID for the target NetMon module.

## POC limitations / production considerations

- Drafts are stored in a local JSON file. This is suitable for a single-process POC, not concurrent or multi-user production use. Use a database with transactions for shared deployments.
- `reviewer` is supplied by the MCP caller; add authenticated identity/role checks before treating it as an auditable approval.
- Regression candidates are selected through simple module/keyword matching. This is a shortlist, not full code dependency or change-impact analysis.
- TestRail API calls have not been validated against your private TestRail instance. Verify required fields, template and API permissions with a non-production project first.
- No test case is sent to TestRail before approval. The approval step is explicit and the publish tool rejects drafts that are not approved.

## Reference

Inspired by the API coverage and MCP integration pattern from [bun913/mcp-testrail](https://github.com/bun913/mcp-testrail) (MIT-licensed reference repository). This POC is a NetMon-oriented implementation, not a fork or a copy of the reference source.


## CI

A repository-level GitHub Actions workflow runs TypeScript type-checking and a production build when files under this directory change.
