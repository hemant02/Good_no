# NetMon TestRail MCP Server

NetMon-focused Model Context Protocol (MCP) server for TestRail. This starter includes a QA review gate: AI-generated test cases are saved as drafts and are created in TestRail only after explicit approval.

## Features
- TestRail project, suite, section, case-field and case retrieval.
- NetMon module-aware test case drafts.
- QA review workflow: pending review -> approved/rejected -> created.
- Approved test cases are created through the TestRail API.
- TestRail runs and execution results.

## NetMon module taxonomy
Authentication/JWT/Keycloak; Packet Capture; Rules Engine; Replay; Elasticsearch/OpenSearch; Kibana/OpenSearch Dashboards; Licensing; Diagnostics; ISO/LRP Upgrade; User Management; Reporting/Dashboards; Other.

## Setup
Requires Node.js 20+.

```bash
npm install
cp .env.example .env
# Set TestRail URL, username, API key, project ID and optional suite ID
npm run build
npm start
```

## Environment
See `.env.example`. Never commit TestRail credentials.

## QA approval workflow
1. Generate test cases from Jira requirements, API specifications, or change descriptions.
2. Call `netmon_create_test_case_draft` to save each proposed case for review.
3. Call `netmon_list_test_case_drafts` to retrieve pending drafts.
4. QA explicitly approves or rejects using `netmon_review_and_approve_test_case`.
5. Only an approved draft is posted to TestRail. Rejected and pending drafts are never posted.

## Available MCP tools
- `netmon_get_projects`, `netmon_get_project`
- `netmon_get_suites`, `netmon_get_sections`, `netmon_get_case_fields`
- `netmon_get_cases`, `netmon_get_case`, `netmon_update_case`
- `netmon_create_test_case_draft`, `netmon_list_test_case_drafts`, `netmon_review_and_approve_test_case`
- `netmon_get_runs`, `netmon_add_run`, `netmon_add_result`

## MCP client config example
```json
{
  "mcpServers": {
    "netmon-testrail": {
      "command": "node",
      "args": ["/absolute/path/netmon-testrail-mcp/dist/index.js"],
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

## Important
This is a starter implementation and has not yet been verified against your private TestRail instance. TestRail case templates and required custom fields vary by project. Call `netmon_get_case_fields` and validate the separated-step payload against your configured template before production use. Draft storage uses a local JSON file; production/multi-user deployment should use a shared database and authenticated reviewer identities.

Inspired by the tool coverage and usage model in [bun913/mcp-testrail](https://github.com/bun913/mcp-testrail). The reference project is archived/read-only.
