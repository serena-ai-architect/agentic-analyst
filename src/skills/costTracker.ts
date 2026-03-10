/**
 * Cost Tracker & Token Economics
 * ================================
 * Per-agent cost tracking, budget enforcement, optimization recommendations.
 */

import type { LLMCallRecord, CostReport } from "../types/index.js";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.8, output: 4.0 },
};

export interface CostBudget {
  maxTotalCost: number;      // $
  maxPerAgentCost: number;   // $
  maxTotalTokens: number;
  warnThreshold: number;     // 0-1
}

const DEFAULT_BUDGET: CostBudget = {
  maxTotalCost: 5.0,
  maxPerAgentCost: 1.0,
  maxTotalTokens: 500_000,
  warnThreshold: 0.8,
};

export class CostTracker {
  private calls: LLMCallRecord[] = [];
  private budget: CostBudget;
  private startTime = Date.now();

  constructor(budget: Partial<CostBudget> = {}) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  recordCall(call: LLMCallRecord): { warnings: string[]; abort: boolean } {
    this.calls.push(call);

    const total = this.totalCost;
    const utilization = total / this.budget.maxTotalCost;
    const warnings: string[] = [];
    let abort = false;

    if (utilization >= 1.0) {
      warnings.push("🚨 BUDGET EXCEEDED");
      abort = true;
    } else if (utilization >= this.budget.warnThreshold) {
      warnings.push(`⚠️ Budget ${(utilization * 100).toFixed(0)}% used ($${total.toFixed(3)} / $${this.budget.maxTotalCost})`);
    }

    const agentCost = this.getAgentCost(call.agentName);
    if (agentCost > this.budget.maxPerAgentCost) {
      warnings.push(`⚠️ Agent '${call.agentName}' exceeded per-agent budget ($${agentCost.toFixed(3)})`);
    }

    return { warnings, abort };
  }

  get totalCost(): number {
    return this.calls.reduce((sum, c) => sum + this.callCost(c), 0);
  }

  get totalTokens(): number {
    return this.calls.reduce((sum, c) => sum + c.inputTokens + c.outputTokens, 0);
  }

  getAgentCost(name: string): number {
    return this.calls
      .filter((c) => c.agentName === name)
      .reduce((sum, c) => sum + this.callCost(c), 0);
  }

  isBudgetExceeded(): boolean {
    return this.totalCost >= this.budget.maxTotalCost;
  }

  generateReport(): CostReport {
    const byAgent: Record<string, { cost: number; calls: number }> = {};
    const byPhase: Record<string, number> = {};

    for (const call of this.calls) {
      const cost = this.callCost(call);
      if (!byAgent[call.agentName]) byAgent[call.agentName] = { cost: 0, calls: 0 };
      byAgent[call.agentName].cost += cost;
      byAgent[call.agentName].calls += 1;

      byPhase[call.phase] = (byPhase[call.phase] ?? 0) + cost;
    }

    return {
      totalCost: this.totalCost,
      totalTokens: this.totalTokens,
      totalCalls: this.calls.length,
      byAgent,
      byPhase,
      optimizations: this.getOptimizations(),
    };
  }

  formatReport(): string {
    const report = this.generateReport();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    const lines = [
      "═══════════════════════════════════════════",
      "       💰 Cost & Performance Report        ",
      "═══════════════════════════════════════════",
      "",
      `  Total Cost:        $${report.totalCost.toFixed(4)}`,
      `  Total Tokens:      ${report.totalTokens.toLocaleString()}`,
      `  Total API Calls:   ${report.totalCalls}`,
      `  Wall Clock Time:   ${elapsed}s`,
      "",
      "── Cost by Agent ──────────────────────────",
    ];

    const sortedAgents = Object.entries(report.byAgent).sort(
      ([, a], [, b]) => b.cost - a.cost
    );
    for (const [name, stats] of sortedAgents) {
      const pct = ((stats.cost / Math.max(report.totalCost, 0.001)) * 100).toFixed(1);
      lines.push(`  ${name.padEnd(25)} $${stats.cost.toFixed(4)} (${pct}%) [${stats.calls} calls]`);
    }

    if (report.optimizations.length > 0) {
      lines.push("", "── Optimization Suggestions ───────────────");
      for (const opt of report.optimizations) lines.push(`  ${opt}`);
    }

    lines.push("\n═══════════════════════════════════════════");
    return lines.join("\n");
  }

  private callCost(call: LLMCallRecord): number {
    const pricing = MODEL_PRICING[call.model] ?? { input: 5, output: 15 };
    return (
      (call.inputTokens / 1_000_000) * pricing.input +
      (call.outputTokens / 1_000_000) * pricing.output
    );
  }

  private getOptimizations(): string[] {
    const recs: string[] = [];
    const agentCosts: Record<string, number> = {};
    for (const c of this.calls) {
      agentCosts[c.agentName] = (agentCosts[c.agentName] ?? 0) + this.callCost(c);
    }

    const total = this.totalCost;
    for (const [agent, cost] of Object.entries(agentCosts)) {
      if (cost > total * 0.4) {
        recs.push(`💡 '${agent}' uses ${((cost / total) * 100).toFixed(0)}% of total. Consider gpt-4o-mini.`);
      }
    }

    const failed = this.calls.filter((c) => !c.success).length;
    if (failed > 2) {
      recs.push(`💡 ${failed} failed calls. Add input validation before LLM calls.`);
    }

    return recs;
  }
}
