import axios, { type AxiosInstance } from "axios";
import { config } from "./config.js";

export type TestRailRecord = Record<string, unknown>;

export class TestRailClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: `${config.testRailUrl}/index.php?/api/v2/`,
      auth: { username: config.username, password: config.apiKey },
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 30_000
    });
  }

  private async request<T>(method: "GET" | "POST" | "DELETE", endpoint: string, data?: unknown): Promise<T> {
    try {
      const response = await this.http.request<T>({ method, url: endpoint, data });
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const detail = error.response?.data
          ? JSON.stringify(error.response.data)
          : error.message;
        throw new Error(`TestRail API request failed${status ? ` (${status})` : ""}: ${detail}`);
      }
      throw error;
    }
  }

  get<T = unknown>(endpoint: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const suffix = params.size ? `&${params.toString()}` : "";
    return this.request<T>("GET", `${endpoint}${suffix}`);
  }

  post<T = unknown>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>("POST", endpoint, data);
  }

  async getProjects(): Promise<unknown> {
    return this.get("get_projects");
  }

  async getProject(projectId: number): Promise<unknown> {
    return this.get(`get_project/${projectId}`);
  }

  async getSuites(projectId: number): Promise<unknown> {
    return this.get(`get_suites/${projectId}`);
  }

  async getSections(projectId: number, suiteId?: number): Promise<unknown> {
    return this.get(`get_sections/${projectId}`, { suite_id: suiteId });
  }

  async getCaseFields(): Promise<unknown> {
    return this.get("get_case_fields");
  }

  async getCases(projectId: number, options: {
    suiteId?: number; sectionId?: number; limit?: number; offset?: number;
  } = {}): Promise<unknown> {
    return this.get(`get_cases/${projectId}`, {
      suite_id: options.suiteId,
      section_id: options.sectionId,
      limit: options.limit ?? 250,
      offset: options.offset ?? 0
    });
  }

  async getCase(caseId: number): Promise<unknown> {
    return this.get(`get_case/${caseId}`);
  }

  async addCase(sectionId: number, body: TestRailRecord): Promise<unknown> {
    return this.post(`add_case/${sectionId}`, body);
  }

  async updateCase(caseId: number, body: TestRailRecord): Promise<unknown> {
    return this.post(`update_case/${caseId}`, body);
  }

  async getRuns(projectId: number): Promise<unknown> {
    return this.get(`get_runs/${projectId}`);
  }

  async addRun(projectId: number, body: TestRailRecord): Promise<unknown> {
    return this.post(`add_run/${projectId}`, body);
  }

  async addResult(testId: number, body: TestRailRecord): Promise<unknown> {
    return this.post(`add_result/${testId}`, body);
  }
}

export const testRail = new TestRailClient();
