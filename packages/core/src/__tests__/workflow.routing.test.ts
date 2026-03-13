import { describe, it, expect } from "vitest";
import { routeAfterResearch, shouldSkipRisk, routeAfterReflexion } from "../graph/workflow.js";
import type { AgentState } from "../types/index.js";

/** Create a minimal state object for routing tests */
function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    company: "TestCo",
    query: "test",
    mode: "full",
    executionPlan: "",
    historicalContext: "",
    researchData: {},
    researchSources: [],
    researchSummary: "",
    financialAnalysis: "",
    marketAnalysis: "",
    techAnalysis: "",
    riskAssessment: "",
    riskScore: 0,
    draftReport: "",
    finalReport: "",
    reflexionMemory: "",
    stepEvaluations: [],
    deliveryStatus: "",
    qualityScore: 0,
    qualityFeedback: "",
    humanFeedback: "",
    iterationCount: 0,
    researchRetries: 0,
    analysisRetries: 0,
    costReport: "",
    errors: [],
    logs: [],
    currentPhase: "",
    ...overrides,
  };
}

describe("routeAfterResearch", () => {
  it("retries when blocked with retries < 2", () => {
    const state = makeState({ currentPhase: "research_blocked", researchRetries: 0 });
    expect(routeAfterResearch(state)).toBe("research");
  });

  it("retries again when blocked with retries = 1", () => {
    const state = makeState({ currentPhase: "research_blocked", researchRetries: 1 });
    expect(routeAfterResearch(state)).toBe("research");
  });

  it("degrades to report when blocked with retries >= 2", () => {
    const state = makeState({ currentPhase: "research_blocked", researchRetries: 2 });
    expect(routeAfterResearch(state)).toBe("report");
  });

  it("degrades to report when blocked with retries > 2", () => {
    const state = makeState({ currentPhase: "research_blocked", researchRetries: 5 });
    expect(routeAfterResearch(state)).toBe("report");
  });

  it("proceeds to analysis when not blocked", () => {
    const state = makeState({ currentPhase: "research_complete" });
    expect(routeAfterResearch(state)).toBe("analysis");
  });

  it("proceeds to analysis regardless of retry count when not blocked", () => {
    const state = makeState({ currentPhase: "research_complete", researchRetries: 3 });
    expect(routeAfterResearch(state)).toBe("analysis");
  });
});

describe("shouldSkipRisk", () => {
  it("skips risk in quick mode", () => {
    const state = makeState({ mode: "quick" });
    expect(shouldSkipRisk(state)).toBe("report");
  });

  it("includes risk in full mode", () => {
    const state = makeState({ mode: "full" });
    expect(shouldSkipRisk(state)).toBe("risk");
  });
});

describe("routeAfterReflexion", () => {
  it("delivers when score meets threshold", () => {
    const state = makeState({ qualityScore: 7.0, iterationCount: 1 });
    expect(routeAfterReflexion(state)).toBe("delivery");
  });

  it("delivers when score exceeds threshold", () => {
    const state = makeState({ qualityScore: 9.0, iterationCount: 1 });
    expect(routeAfterReflexion(state)).toBe("delivery");
  });

  it("retries report when score below threshold and iterations remain", () => {
    const state = makeState({ qualityScore: 5.0, iterationCount: 1 });
    expect(routeAfterReflexion(state)).toBe("report");
  });

  it("retries at score just below threshold", () => {
    const state = makeState({ qualityScore: 6.9, iterationCount: 2 });
    expect(routeAfterReflexion(state)).toBe("report");
  });

  it("forces delivery at max iterations even with low score", () => {
    const state = makeState({ qualityScore: 3.0, iterationCount: 3 });
    expect(routeAfterReflexion(state)).toBe("delivery");
  });

  it("forces delivery when iterations exceed max", () => {
    const state = makeState({ qualityScore: 2.0, iterationCount: 5 });
    expect(routeAfterReflexion(state)).toBe("delivery");
  });

  it("delivers with score=0 at max iterations", () => {
    const state = makeState({ qualityScore: 0, iterationCount: 3 });
    expect(routeAfterReflexion(state)).toBe("delivery");
  });
});
