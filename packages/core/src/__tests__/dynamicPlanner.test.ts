import { describe, it, expect } from "vitest";
import { DynamicPlanner, type ExecutionPlan } from "../skills/dynamicPlanner.js";

describe("DynamicPlanner.formatPlan", () => {
  const planner = new DynamicPlanner();

  it("formats a basic plan with version and tasks", () => {
    const plan: ExecutionPlan = {
      company: "NVIDIA",
      query: "Full analysis",
      tasks: [
        { type: "research", description: "Research NVIDIA", priority: "critical", reasoning: "Essential", status: "completed" },
        { type: "financial_analysis", description: "Financial deep dive", priority: "high", reasoning: "", status: "running" },
        { type: "risk_assessment", description: "Risk eval", priority: "medium", reasoning: "", status: "pending" },
        { type: "delivery", description: "Deliver report", priority: "low", reasoning: "Skipped by user", status: "skipped" },
      ],
      version: 2,
      adaptations: ["⏭️ Skipped tech_analysis: pre-revenue company"],
    };

    const output = planner.formatPlan(plan);

    expect(output).toContain("v2");
    expect(output).toContain("NVIDIA");
    expect(output).toContain("✅"); // completed
    expect(output).toContain("🔄"); // running
    expect(output).toContain("⏳"); // pending
    expect(output).toContain("⏭️"); // skipped
    expect(output).toContain("[CRITICAL]");
    expect(output).toContain("[HIGH]");
    expect(output).toContain("[MEDIUM]");
    expect(output).toContain("[LOW]");
    expect(output).toContain("Adaptations:");
    expect(output).toContain("pre-revenue company");
  });

  it("formats plan without adaptations", () => {
    const plan: ExecutionPlan = {
      company: "Apple",
      query: "Quick check",
      tasks: [
        { type: "research", description: "Research Apple", priority: "critical", reasoning: "", status: "pending" },
      ],
      version: 1,
      adaptations: [],
    };

    const output = planner.formatPlan(plan);
    expect(output).toContain("v1");
    expect(output).toContain("Apple");
    expect(output).not.toContain("Adaptations:");
  });

  it("shows reasoning for tasks that have it", () => {
    const plan: ExecutionPlan = {
      company: "Tesla",
      query: "test",
      tasks: [
        { type: "research", description: "Research", priority: "critical", reasoning: "Core requirement", status: "pending" },
      ],
      version: 1,
      adaptations: [],
    };

    const output = planner.formatPlan(plan);
    expect(output).toContain("Core requirement");
  });
});
