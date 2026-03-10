/**
 * Dynamic Planner: Adaptive Task Planning
 * ==========================================
 * Creates and adapts execution plans at runtime.
 * Addresses the "static DAG" limitation.
 *
 * Key difference from Python version: Uses Zod for plan validation.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config.js";
import { z } from "zod";
import type { PlannedTask, TaskType } from "../types/index.js";

// Zod schema for LLM plan output validation
const PlannedTaskSchema = z.object({
  type: z.string(),
  description: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  reasoning: z.string().optional().default(""),
});

export interface ExecutionPlan {
  company: string;
  query: string;
  tasks: PlannedTask[];
  version: number;
  adaptations: string[];
}

export class DynamicPlanner {
  private llm: ReturnType<typeof createLLM>;

  constructor(model = "deepseek-chat") {
    this.llm = createLLM({ model, temperature: 0.1 });
  }

  async createInitialPlan(
    company: string,
    query: string,
    mode: "quick" | "full" = "full"
  ): Promise<ExecutionPlan> {
    const result = await this.llm.invoke([
      new SystemMessage(PLANNING_PROMPT),
      new HumanMessage(
        `Create plan for:\nCompany: ${company}\nQuery: ${query}\nMode: ${mode}\n\n` +
          `Available task types: research, financial_analysis, market_analysis, ` +
          `tech_analysis, risk_assessment, competitor_deep_dive, ` +
          `regulatory_analysis, report_generation, delivery\n\n` +
          `Respond with JSON array only.`
      ),
    ]);

    const content = typeof result.content === 'string' ? result.content : String(result.content);
    const tasks = this.parsePlan(content, company);

    return {
      company,
      query,
      tasks,
      version: 1,
      adaptations: [],
    };
  }

  async adaptPlan(
    plan: ExecutionPlan,
    completedTask: string,
    taskResult: string
  ): Promise<ExecutionPlan> {
    const remaining = plan.tasks.filter(
      (t) => t.status === "pending" && t.priority !== "skip"
    );

    if (remaining.length === 0) return plan;

    const result = await this.llm.invoke([
      new SystemMessage(REPLANNING_PROMPT),
      new HumanMessage(
        `Company: ${plan.company}\nQuery: ${plan.query}\n\n` +
          `Completed: ${completedTask}\n` +
          `Result summary: ${taskResult.slice(0, 2000)}\n\n` +
          `Remaining: ${JSON.stringify(remaining.map((t) => ({ type: t.type, priority: t.priority })))}\n\n` +
          `Respond with JSON array of adaptations (or []).`
      ),
    ]);

    const content = typeof result.content === 'string' ? result.content : String(result.content);
    const adaptations = this.parseAdaptations(content);

    for (const adaptation of adaptations) {
      if (adaptation.action === "skip") {
        const task = plan.tasks.find(
          (t) => t.type === adaptation.task && t.status === "pending"
        );
        if (task) {
          task.priority = "skip";
          task.status = "skipped";
          task.reasoning = `Skipped: ${adaptation.reason}`;
          plan.adaptations.push(`⏭️ Skipped ${adaptation.task}: ${adaptation.reason}`);
        }
      } else if (adaptation.action === "add") {
        plan.tasks.push({
          type: adaptation.task as TaskType,
          description: adaptation.reason,
          priority: "high",
          reasoning: `Dynamically added: ${adaptation.reason}`,
          status: "pending",
        });
        plan.adaptations.push(`➕ Added ${adaptation.task}: ${adaptation.reason}`);
      }
    }

    plan.version++;
    return plan;
  }

  formatPlan(plan: ExecutionPlan): string {
    const lines = [`=== Execution Plan v${plan.version} for ${plan.company} ===\n`];
    const icons: Record<string, string> = {
      pending: "⏳", running: "🔄", completed: "✅", skipped: "⏭️",
    };

    plan.tasks.forEach((task, i) => {
      lines.push(
        `${icons[task.status] ?? "❓"} ${i + 1}. [${task.priority.toUpperCase()}] ${task.type}: ${task.description}`
      );
      if (task.reasoning) lines.push(`     └─ ${task.reasoning}`);
    });

    if (plan.adaptations.length > 0) {
      lines.push(`\n📝 Adaptations:`);
      plan.adaptations.forEach((a) => lines.push(`  ${a}`));
    }

    return lines.join("\n");
  }

  private parsePlan(response: string, company: string): PlannedTask[] {
    try {
      const cleaned = response.replace(/```json?|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed.map((t: any) => ({
          type: t.type ?? "research",
          description: t.description ?? "",
          priority: t.priority ?? "medium",
          reasoning: t.reasoning ?? "",
          status: "pending" as const,
        }));
      }
    } catch {}

    // Fallback default plan
    return [
      { type: "research", description: `Research ${company}`, priority: "critical", reasoning: "", status: "pending" },
      { type: "financial_analysis", description: "Financial analysis", priority: "critical", reasoning: "", status: "pending" },
      { type: "market_analysis", description: "Market analysis", priority: "high", reasoning: "", status: "pending" },
      { type: "tech_analysis", description: "Tech assessment", priority: "high", reasoning: "", status: "pending" },
      { type: "risk_assessment", description: "Risk assessment", priority: "high", reasoning: "", status: "pending" },
      { type: "report_generation", description: "Generate report", priority: "critical", reasoning: "", status: "pending" },
      { type: "delivery", description: "Deliver to stakeholders", priority: "medium", reasoning: "", status: "pending" },
    ];
  }

  private parseAdaptations(response: string): Array<{ action: string; task: string; reason: string }> {
    try {
      const cleaned = response.replace(/```json?|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

const PLANNING_PROMPT = `You are an expert task planner for investment analysis.
Create an OPTIMIZED plan — not every query needs every task.

Examples:
- "Quick sentiment check" → Only research + brief summary
- "Full due diligence" → Everything + extra management analysis
- "Is NVIDIA overvalued?" → Heavy financial, light tech

Respond with JSON array:
[{"type":"research","description":"...","priority":"critical","reasoning":"..."}]`;

const REPLANNING_PROMPT = `You are an adaptive replanner.
Review completed task results and decide if remaining plan needs changes.

Signals: acquisition → add M&A analysis; pre-revenue → skip earnings;
major regulatory action → add regulatory deep-dive.

Respond with JSON: [{"action":"skip|add","task":"type","reason":"why"}]
Or [] if no changes needed.`;
