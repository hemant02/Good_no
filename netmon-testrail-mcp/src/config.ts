import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalPositiveInteger(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export const config = {
  testRailUrl: required("TESTRAIL_URL").replace(/\/+$/, ""),
  username: required("TESTRAIL_USERNAME"),
  apiKey: required("TESTRAIL_API_KEY"),
  projectId: optionalPositiveInteger("NETMON_PROJECT_ID"),
  suiteId: optionalPositiveInteger("NETMON_SUITE_ID"),
  draftStorePath: process.env.DRAFT_STORE_PATH?.trim() || ".data/testcase-drafts.json"
};
