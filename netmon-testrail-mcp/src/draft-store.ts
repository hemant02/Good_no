import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { config } from "./config.js";

export type DraftStatus = "pending_review" | "approved" | "rejected" | "created";

export interface DraftStep {
  action: string;
  expectedResult: string;
}

export interface TestCaseDraft {
  id: string;
  title: string;
  projectId: number;
  suiteId?: number;
  sectionId: number;
  module: string;
  sourceReference?: string;
  preconditions?: string;
  steps: DraftStep[];
  priorityId?: number;
  typeId?: number;
  refs?: string;
  status: DraftStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  createdCaseId?: number;
  lastError?: string;
}

interface DraftFile {
  drafts: TestCaseDraft[];
}

let writeQueue: Promise<void> = Promise.resolve();

async function readAll(): Promise<DraftFile> {
  try {
    const raw = await readFile(config.draftStorePath, "utf8");
    const parsed = JSON.parse(raw) as DraftFile;
    return { drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { drafts: [] };
    throw error;
  }
}

async function persist(value: DraftFile): Promise<void> {
  const directory = dirname(config.draftStorePath);
  await mkdir(directory, { recursive: true });
  const tempPath = `${config.draftStorePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await rename(tempPath, config.draftStorePath);
}

async function mutate<T>(fn: (file: DraftFile) => T): Promise<T> {
  let result!: T;
  const operation = writeQueue.then(async () => {
    const file = await readAll();
    result = fn(file);
    await persist(file);
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
  return result;
}

export async function createDraft(input: Omit<TestCaseDraft, "id" | "status" | "createdAt">): Promise<TestCaseDraft> {
  return mutate((file) => {
    const draft: TestCaseDraft = {
      ...input,
      id: randomUUID(),
      status: "pending_review",
      createdAt: new Date().toISOString()
    };
    file.drafts.push(draft);
    return draft;
  });
}

export async function listDrafts(status?: DraftStatus): Promise<TestCaseDraft[]> {
  await writeQueue;
  const file = await readAll();
  return status ? file.drafts.filter((draft) => draft.status === status) : file.drafts;
}

export async function getDraft(id: string): Promise<TestCaseDraft> {
  const draft = (await listDrafts()).find((item) => item.id === id);
  if (!draft) throw new Error(`Draft not found: ${id}`);
  return draft;
}

export async function updateDraft(id: string, patch: Partial<TestCaseDraft>): Promise<TestCaseDraft> {
  return mutate((file) => {
    const index = file.drafts.findIndex((item) => item.id === id);
    if (index < 0) throw new Error(`Draft not found: ${id}`);
    file.drafts[index] = { ...file.drafts[index], ...patch, id };
    return file.drafts[index];
  });
}
