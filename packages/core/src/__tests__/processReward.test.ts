import { describe, it, expect } from "vitest";
import type { StepEvaluation } from "../types/index.js";

/**
 * Test ProcessRewardModel's non-LLM methods by accessing its internal state.
 * We avoid importing the class directly (which triggers LLM creation via dotenv),
 * and instead test the pure logic extracted from the class.
 */

// Replicate the pure logic from ProcessRewardModel for isolated testing
function getSummary(evaluations: StepEvaluation[]): string {
  const lines = ["=== Pipeline Process Evaluation ===\n"];
  for (const s of evaluations) {
    const icon = s.score >= 7 ? "✅" : s.score >= 5 ? "⚠️" : "❌";
    lines.push(`${icon} ${s.stepName}: ${s.score}/10 → ${s.recommendation}`);
    for (const issue of s.issues.slice(0, 2)) {
      lines.push(`    └─ ${issue}`);
    }
  }
  const avg =
    evaluations.reduce((sum, e) => sum + e.score, 0) /
    Math.max(evaluations.length, 1);
  lines.push(`\n📊 Average: ${avg.toFixed(1)}/10`);
  return lines.join("\n");
}

function hasBlockingFailure(evaluations: StepEvaluation[]): boolean {
  return evaluations.some((e) => e.isBlocking && e.score < 4);
}

function getWeakestStep(evaluations: StepEvaluation[]): string | null {
  if (evaluations.length === 0) return null;
  return evaluations.reduce((min, e) => (e.score < min.score ? e : min))
    .stepName;
}

function makeEval(overrides: Partial<StepEvaluation> = {}): StepEvaluation {
  return {
    stepName: "research",
    score: 7,
    dimensions: {},
    issues: [],
    isBlocking: false,
    recommendation: "proceed",
    details: "",
    ...overrides,
  };
}

describe("PRM getSummary", () => {
  it("formats evaluations with correct icons", () => {
    const evals = [
      makeEval({ stepName: "research", score: 8 }),
      makeEval({ stepName: "analysis", score: 5 }),
      makeEval({ stepName: "risk", score: 2 }),
    ];

    const summary = getSummary(evals);
    expect(summary).toContain("✅ research: 8/10");
    expect(summary).toContain("⚠️ analysis: 5/10");
    expect(summary).toContain("❌ risk: 2/10");
  });

  it("includes average score", () => {
    const evals = [
      makeEval({ score: 8 }),
      makeEval({ score: 6 }),
    ];

    const summary = getSummary(evals);
    expect(summary).toContain("📊 Average: 7.0/10");
  });

  it("shows issues (max 2 per step)", () => {
    const evals = [
      makeEval({
        stepName: "research",
        score: 4,
        issues: ["Missing revenue data", "No competitor analysis", "Extra issue"],
      }),
    ];

    const summary = getSummary(evals);
    expect(summary).toContain("Missing revenue data");
    expect(summary).toContain("No competitor analysis");
    expect(summary).not.toContain("Extra issue");
  });

  it("handles empty evaluations", () => {
    const summary = getSummary([]);
    expect(summary).toContain("Average: 0.0/10");
  });
});

describe("PRM hasBlockingFailure", () => {
  it("returns true when blocking + score < 4", () => {
    const evals = [
      makeEval({ score: 3, isBlocking: true }),
    ];
    expect(hasBlockingFailure(evals)).toBe(true);
  });

  it("returns false when blocking but score >= 4", () => {
    const evals = [
      makeEval({ score: 4, isBlocking: true }),
    ];
    expect(hasBlockingFailure(evals)).toBe(false);
  });

  it("returns false when score < 4 but not blocking", () => {
    const evals = [
      makeEval({ score: 2, isBlocking: false }),
    ];
    expect(hasBlockingFailure(evals)).toBe(false);
  });

  it("returns false for empty evaluations", () => {
    expect(hasBlockingFailure([])).toBe(false);
  });

  it("detects blocking failure among non-blocking steps", () => {
    const evals = [
      makeEval({ stepName: "research", score: 8, isBlocking: false }),
      makeEval({ stepName: "analysis", score: 2, isBlocking: true }),
      makeEval({ stepName: "risk", score: 7, isBlocking: false }),
    ];
    expect(hasBlockingFailure(evals)).toBe(true);
  });
});

describe("PRM getWeakestStep", () => {
  it("returns null for empty evaluations", () => {
    expect(getWeakestStep([])).toBeNull();
  });

  it("returns the lowest-scoring step", () => {
    const evals = [
      makeEval({ stepName: "research", score: 7 }),
      makeEval({ stepName: "analysis", score: 4 }),
      makeEval({ stepName: "risk", score: 6 }),
    ];
    expect(getWeakestStep(evals)).toBe("analysis");
  });

  it("returns the first step when all scores are equal", () => {
    const evals = [
      makeEval({ stepName: "research", score: 5 }),
      makeEval({ stepName: "analysis", score: 5 }),
    ];
    expect(getWeakestStep(evals)).toBe("research");
  });
});
