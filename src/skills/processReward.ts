/**
 * Process Reward Model (PRM): Step-Level Evaluation
 * ====================================================
 * Evaluates EACH step, not just the final output.
 * Ref: "Let's Verify Step by Step" (Lightman et al., 2023)
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config.js";
import type { StepEvaluation } from "../types/index.js";

const STEP_RUBRICS: Record<string, string> = {
  research: `Evaluate RESEARCH: Coverage (all areas?), Recency (< 6 months?), Source quality, Contradiction handling. Blocking if: missed primary business or zero financial data.`,
  financial_analysis: `Evaluate FINANCIAL ANALYSIS: Data accuracy, Valuation rigor (DCF/comps?), Trend analysis, Margin context, Forward projections. Blocking if: no specific figures.`,
  market_analysis: `Evaluate MARKET: TAM/SAM defined?, Competitive moat articulated?, Competitors named?, Industry trends with evidence? Blocking if: no competitors or market size.`,
  risk_assessment: `Evaluate RISK: 5+ risk dimensions?, Scored by likelihood/impact?, Company-specific (not generic)?, Mitigants discussed? Blocking if: entirely generic.`,
  report_generation: `Evaluate REPORT: All sections present?, Data synthesized from all phases?, Clear recommendation?, Professional tone?, Actionable? Blocking if: missing exec summary or recommendation.`,
};

export class ProcessRewardModel {
  private llm: ReturnType<typeof createLLM>;
  private evaluations: StepEvaluation[] = [];

  constructor(model = "deepseek-chat") {
    this.llm = createLLM({ model, temperature: 0 });
  }

  async evaluateStep(
    stepName: string,
    stepOutput: string,
    context?: Record<string, unknown>
  ): Promise<StepEvaluation> {
    const rubric = STEP_RUBRICS[stepName] ?? "Evaluate: completeness, quality, usefulness. Score 1-10.";

    try {
      const result = await this.llm.invoke([
        new SystemMessage(
          `You are a Process Reward Model evaluator.\n` +
            `Evaluate a SINGLE STEP in a multi-agent pipeline.\n` +
            `Calibration: 9-10 exceptional, 7-8 good, 5-6 weak, 3-4 retry, 1-2 blocking.\n` +
            `Respond ONLY with valid JSON.`
        ),
        new HumanMessage(
          `Step: ${stepName}\nRubric:\n${rubric}\n\n` +
            `Output:\n${stepOutput.slice(0, 3000)}\n\n` +
            `Respond as JSON: {"score":N,"dimensions":{},"issues":[],"isBlocking":bool,"recommendation":"proceed|retry|abort","details":"..."}`
        ),
      ]);

      const content = typeof result.content === 'string' ? result.content : String(result.content);
      const data = JSON.parse(content.replace(/```json?|```/g, "").trim());

      const evaluation: StepEvaluation = {
        stepName,
        score: data.score ?? 5.0,
        dimensions: data.dimensions ?? {},
        issues: data.issues ?? [],
        isBlocking: data.isBlocking ?? false,
        recommendation: data.recommendation ?? "proceed",
        details: data.details ?? "",
      };

      this.evaluations.push(evaluation);
      return evaluation;
    } catch {
      const fallback: StepEvaluation = {
        stepName,
        score: 6.0,
        dimensions: {},
        issues: ["Evaluation parsing failed"],
        isBlocking: false,
        recommendation: "proceed",
        details: "Auto-pass due to evaluation error",
      };
      this.evaluations.push(fallback);
      return fallback;
    }
  }

  getSummary(): string {
    const lines = ["=== Pipeline Process Evaluation ===\n"];
    for (const s of this.evaluations) {
      const icon = s.score >= 7 ? "✅" : s.score >= 5 ? "⚠️" : "❌";
      lines.push(`${icon} ${s.stepName}: ${s.score}/10 → ${s.recommendation}`);
      for (const issue of s.issues.slice(0, 2)) {
        lines.push(`    └─ ${issue}`);
      }
    }
    const avg = this.evaluations.reduce((sum, e) => sum + e.score, 0) / Math.max(this.evaluations.length, 1);
    lines.push(`\n📊 Average: ${avg.toFixed(1)}/10`);
    return lines.join("\n");
  }

  hasBlockingFailure(): boolean {
    return this.evaluations.some((e) => e.isBlocking && e.score < 4);
  }

  getWeakestStep(): string | null {
    if (this.evaluations.length === 0) return null;
    return this.evaluations.reduce((min, e) => (e.score < min.score ? e : min)).stepName;
  }
}
