/**
 * LangGraph Node Functions
 * =========================
 * Each node reads from and writes to AgentState.
 * Thin adapter between LangGraph state and crews/skills.
 */

import type { AgentState } from "../types/index.js";
import { ResearchCrew, AnalysisCrew, RiskCrew, DeliveryCrew } from "../crews/index.js";
import { ReportWriterAgent } from "../agents/reportWriter.js";
import { DynamicPlanner } from "../skills/dynamicPlanner.js";
import { ReflexionEngine } from "../skills/reflexion.js";
import { notionSearchPastAnalyses } from "../tools/mcpTools.js";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// ═══════════════════════════════════════════════════════════════
// Node: Dynamic Planning
// ═══════════════════════════════════════════════════════════════

export async function planningNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, query, mode } = state;

  try {
    const planner = new DynamicPlanner();
    const plan = await planner.createInitialPlan(company, query, mode);

    return {
      executionPlan: planner.formatPlan(plan),
      currentPhase: "planned",
      logs: [`[${timestamp()}] 📋 Dynamic plan created: ${plan.tasks.length} tasks`],
    };
  } catch (e) {
    return {
      executionPlan: "Default plan (planning failed)",
      currentPhase: "planned",
      errors: [`Planning error: ${String(e)}`],
      logs: [`[${timestamp()}] ⚠️ Planning failed, using defaults`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Historical Context (Notion MCP)
// ═══════════════════════════════════════════════════════════════

export async function notionContextNode(state: AgentState): Promise<Partial<AgentState>> {
  try {
    const result = await notionSearchPastAnalyses.invoke({ query: state.company });
    return {
      historicalContext: result,
      currentPhase: "context_loaded",
      logs: [`[${timestamp()}] 📚 Historical context loaded from Notion`],
    };
  } catch {
    return {
      historicalContext: "No historical context available.",
      logs: [`[${timestamp()}] ℹ️ No historical context found`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Research Crew
// ═══════════════════════════════════════════════════════════════

export async function researchNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, query } = state;

  try {
    const crew = new ResearchCrew();
    const result = await crew.run(company, query);

    return {
      researchData: result.researchData,
      researchSummary: result.researchSummary,
      researchSources: result.sources,
      currentPhase: "research_complete",
      logs: [`[${timestamp()}] ✅ Research crew completed for ${company}`],
    };
  } catch (e) {
    return {
      researchSummary: `Research partially failed: ${String(e)}`,
      currentPhase: "research_failed",
      errors: [`Research error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Research crew failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Analysis Crew (with Promise.all parallelism!)
// ═══════════════════════════════════════════════════════════════

export async function analysisNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, researchSummary } = state;

  try {
    const crew = new AnalysisCrew();
    // Note: internally uses Promise.all for parallel execution
    const result = await crew.run(company, researchSummary ?? "");

    return {
      financialAnalysis: result.financialAnalysis,
      marketAnalysis: result.marketAnalysis,
      techAnalysis: result.techAnalysis,
      currentPhase: "analysis_complete",
      logs: [`[${timestamp()}] ✅ Analysis crew completed (3 analysts ran in parallel)`],
    };
  } catch (e) {
    return {
      currentPhase: "analysis_failed",
      errors: [`Analysis error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Analysis crew failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Risk Crew
// ═══════════════════════════════════════════════════════════════

export async function riskNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, researchSummary, financialAnalysis, marketAnalysis } = state;

  const analysisContext =
    `Financial: ${(financialAnalysis ?? "").slice(0, 500)}\n\n` +
    `Market: ${(marketAnalysis ?? "").slice(0, 500)}`;

  try {
    const crew = new RiskCrew();
    const result = await crew.run(company, researchSummary ?? "", analysisContext);

    return {
      riskAssessment: result.riskAssessment,
      riskScore: result.riskScore,
      currentPhase: "risk_complete",
      logs: [`[${timestamp()}] ✅ Risk crew completed (score: ${result.riskScore})`],
    };
  } catch (e) {
    return {
      riskScore: 5.0,
      currentPhase: "risk_failed",
      errors: [`Risk error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Risk crew failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Report Generation
// ═══════════════════════════════════════════════════════════════

export async function reportNode(state: AgentState): Promise<Partial<AgentState>> {
  const iteration = state.iterationCount ?? 0;

  try {
    const agent = new ReportWriterAgent();
    let report: string;

    if (iteration === 0 || !state.draftReport) {
      report = await agent.generate({
        company: state.company,
        researchSummary: state.researchSummary ?? "",
        financialAnalysis: state.financialAnalysis ?? "",
        marketAnalysis: state.marketAnalysis ?? "",
        techAnalysis: state.techAnalysis ?? "",
        riskAssessment: state.riskAssessment ?? "",
        riskScore: state.riskScore ?? 5.0,
        reflexionContext: state.reflexionMemory,
      });
    } else {
      const feedback = [state.qualityFeedback, state.humanFeedback]
        .filter(Boolean)
        .join("\n");
      report = await agent.revise(state.draftReport, feedback, state.company);
    }

    return {
      draftReport: report,
      currentPhase: "report_generated",
      logs: [`[${timestamp()}] ✅ Report generated (iteration ${iteration + 1})`],
    };
  } catch (e) {
    return {
      currentPhase: "report_failed",
      errors: [`Report error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Report generation failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Reflexion (replaces simple quality gate)
// ═══════════════════════════════════════════════════════════════

export async function reflexionNode(state: AgentState): Promise<Partial<AgentState>> {
  const draft = state.draftReport ?? "";
  const iteration = state.iterationCount ?? 0;

  if (!draft) {
    return {
      qualityScore: 0,
      iterationCount: iteration + 1,
      logs: [`[${timestamp()}] ⚠️ Reflexion: No draft to evaluate`],
    };
  }

  try {
    const engine = new ReflexionEngine();
    const result = await engine.evaluateAndReflect(
      `Investment analysis report for ${state.company}`,
      draft,
      iteration + 1
    );

    return {
      qualityScore: result.score,
      qualityFeedback: result.reflection,
      reflexionMemory: result.pastReflections,
      iterationCount: iteration + 1,
      currentPhase: "reflexion_complete",
      logs: [
        `[${timestamp()}] 🪞 Reflexion: score=${result.score}/10 ` +
          `(attempt ${result.attemptNumber}), ` +
          `retry=${result.shouldRetry}, ` +
          `actions=${result.actionItems.length}`,
      ],
    };
  } catch (e) {
    return {
      qualityScore: 7.0,
      iterationCount: iteration + 1,
      errors: [`Reflexion error: ${String(e)}`],
      logs: [`[${timestamp()}] ⚠️ Reflexion failed, defaulting to pass`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Delivery (MCP)
// ═══════════════════════════════════════════════════════════════

export async function deliveryNode(state: AgentState): Promise<Partial<AgentState>> {
  const report = state.finalReport || state.draftReport || "";

  try {
    const crew = new DeliveryCrew();
    const result = await crew.run(state.company, report, state.riskScore ?? 5);

    return {
      deliveryStatus: result.deliveryStatus,
      currentPhase: "delivered",
      logs: [
        `[${timestamp()}] 📨 Delivery complete:`,
        `  📝 Notion: ${result.notionSaved ? "✅" : "❌"}`,
        `  📧 Email: ${result.emailSent ? "✅" : "❌"}`,
        `  📅 Meeting: ${result.meetingScheduled ? "✅" : "❌"}`,
      ],
    };
  } catch (e) {
    return {
      deliveryStatus: `Failed: ${String(e)}`,
      errors: [`Delivery error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Delivery failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Finalize
// ═══════════════════════════════════════════════════════════════

export async function finalizeNode(state: AgentState): Promise<Partial<AgentState>> {
  return {
    finalReport: state.draftReport ?? "No report generated.",
    currentPhase: "completed",
    logs: [`[${timestamp()}] 🏁 Workflow completed. Final report ready.`],
  };
}
