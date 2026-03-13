/**
 * LangGraph Node Functions
 * =========================
 * Each node reads from and writes to AgentState.
 *
 * Architecture upgrades:
 *   - ProcessRewardModel evaluates each step (was defined but never used)
 *   - DynamicPlanner.adaptPlan() called after major nodes (was defined but never called)
 *   - CostTracker generates final cost report in finalize node
 *   - Error-aware phase naming enables conditional routing in workflow.ts
 */

import type { AgentState } from "../types/index.js";
import { ResearchCrew, AnalysisCrew, RiskCrew, DeliveryCrew } from "../crews/index.js";
import { ReportWriterAgent } from "../agents/reportWriter.js";
import { DynamicPlanner, type ExecutionPlan } from "../skills/dynamicPlanner.js";
import { ReflexionEngine } from "../skills/reflexion.js";
import { ProcessRewardModel } from "../skills/processReward.js";
import { notionSearchPastAnalyses } from "../tools/mcpTools.js";
import { getStockInfo } from "../tools/financeTools.js";
import {
  isNotionConfigured, saveReportToNotion,
  isEmailConfigured, sendReportEmail,
} from "../integrations/index.js";

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Shared PRM instance across nodes to accumulate evaluations
const prm = new ProcessRewardModel();

// ═══════════════════════════════════════════════════════════════
// Node: Dynamic Planning
// ═══════════════════════════════════════════════════════════════

export async function planningNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, query, mode } = state;

  try {
    const planner = new DynamicPlanner();
    const plan = await planner.createInitialPlan(company, query, mode);

    return {
      executionPlan: JSON.stringify(plan),
      currentPhase: "planned",
      logs: [`[${timestamp()}] 📋 Dynamic plan created: ${plan.tasks.length} tasks`],
    };
  } catch (e) {
    return {
      executionPlan: JSON.stringify({ company, query, tasks: [], version: 1, adaptations: [] }),
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
// Node: Research Crew (with PRM evaluation + plan adaptation)
// ═══════════════════════════════════════════════════════════════

export async function researchNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, query } = state;

  try {
    const crew = new ResearchCrew();
    const result = await crew.run(company, query);

    // PRM: evaluate research quality
    const evaluation = await prm.evaluateStep("research", result.researchSummary);
    const isBlocked = evaluation.isBlocking && evaluation.score < 4;

    // Adapt plan based on research results
    const planUpdate = await tryAdaptPlan(state, "research", result.researchSummary);

    return {
      researchData: result.researchData,
      researchSummary: result.researchSummary,
      researchSources: result.sources,
      stepEvaluations: [JSON.stringify(evaluation)],
      ...(planUpdate ? { executionPlan: planUpdate } : {}),
      currentPhase: isBlocked ? "research_blocked" : "research_complete",
      researchRetries: (state.researchRetries ?? 0) + (isBlocked ? 1 : 0),
      logs: [
        `[${timestamp()}] ${isBlocked ? "⚠️" : "✅"} Research crew completed for ${company} ` +
          `(PRM: ${evaluation.score}/10, ${evaluation.recommendation})`,
      ],
    };
  } catch (e) {
    return {
      researchSummary: `Research partially failed: ${String(e)}`,
      currentPhase: "research_blocked",
      researchRetries: (state.researchRetries ?? 0) + 1,
      errors: [`Research error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Research crew failed: ${String(e)}`],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Analysis Crew (with PRM evaluation)
// ═══════════════════════════════════════════════════════════════

export async function analysisNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, researchSummary } = state;

  try {
    const crew = new AnalysisCrew();
    const result = await crew.run(company, researchSummary ?? "");

    // PRM: evaluate analysis quality
    const combinedAnalysis = [
      result.financialAnalysis.slice(0, 500),
      result.marketAnalysis.slice(0, 500),
      result.techAnalysis.slice(0, 500),
    ].join("\n---\n");
    const evaluation = await prm.evaluateStep("financial_analysis", combinedAnalysis);

    // Adapt plan based on analysis results
    const planUpdate = await tryAdaptPlan(state, "analysis", combinedAnalysis.slice(0, 2000));

    return {
      financialAnalysis: result.financialAnalysis,
      marketAnalysis: result.marketAnalysis,
      techAnalysis: result.techAnalysis,
      stepEvaluations: [JSON.stringify(evaluation)],
      ...(planUpdate ? { executionPlan: planUpdate } : {}),
      currentPhase: "analysis_complete",
      logs: [
        `[${timestamp()}] ✅ Analysis crew completed (3 analysts, parallel) ` +
          `(PRM: ${evaluation.score}/10)`,
      ],
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
// Node: Risk Crew (with PRM evaluation)
// ═══════════════════════════════════════════════════════════════

export async function riskNode(state: AgentState): Promise<Partial<AgentState>> {
  const { company, researchSummary, financialAnalysis, marketAnalysis } = state;

  const analysisContext =
    `Financial: ${(financialAnalysis ?? "").slice(0, 500)}\n\n` +
    `Market: ${(marketAnalysis ?? "").slice(0, 500)}`;

  try {
    const crew = new RiskCrew();
    const result = await crew.run(company, researchSummary ?? "", analysisContext);

    // PRM: evaluate risk assessment quality
    const evaluation = await prm.evaluateStep("risk_assessment", result.riskAssessment.slice(0, 2000));

    return {
      riskAssessment: result.riskAssessment,
      riskScore: result.riskScore,
      stepEvaluations: [JSON.stringify(evaluation)],
      currentPhase: "risk_complete",
      logs: [
        `[${timestamp()}] ✅ Risk crew completed (score: ${result.riskScore}) ` +
          `(PRM: ${evaluation.score}/10)`,
      ],
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
// Node: Report Generation (with PRM evaluation)
// ═══════════════════════════════════════════════════════════════

export async function reportNode(state: AgentState): Promise<Partial<AgentState>> {
  const iteration = state.iterationCount ?? 0;

  // Fetch real-time financial data directly to prevent LLM hallucination
  let liveFinancialData = "";
  try {
    const ticker = guessTickerFromCompany(state.company);
    if (ticker) {
      liveFinancialData = await getStockInfo.invoke({ ticker });
    }
  } catch { /* non-fatal */ }

  try {
    const agent = new ReportWriterAgent();
    let report: string;

    // Prepend live data to financial analysis so report writer has ground truth
    const enrichedFinancialAnalysis =
      (liveFinancialData
        ? `=== LIVE MARKET DATA (AUTHORITATIVE — use these exact numbers) ===\n${liveFinancialData}\n\n`
        : "") +
      (state.financialAnalysis ?? "");

    if (iteration === 0 || !state.draftReport) {
      report = await agent.generate({
        company: state.company,
        researchSummary: state.researchSummary ?? "",
        financialAnalysis: enrichedFinancialAnalysis,
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

    // Post-process: inject verified live data section if available
    if (liveFinancialData) {
      report = appendLiveDataSection(report, liveFinancialData);
    }

    // PRM: evaluate report quality
    const evaluation = await prm.evaluateStep("report_generation", report.slice(0, 3000));

    return {
      draftReport: report,
      stepEvaluations: [JSON.stringify(evaluation)],
      currentPhase: "report_generated",
      logs: [
        `[${timestamp()}] ✅ Report generated (iteration ${iteration + 1}) ` +
          `(PRM: ${evaluation.score}/10)`,
      ],
    };
  } catch (e) {
    return {
      currentPhase: "report_failed",
      errors: [`Report error: ${String(e)}`],
      logs: [`[${timestamp()}] ❌ Report generation failed: ${String(e)}`],
    };
  }
}

/** Replace the Key Metrics Dashboard (or append) with verified live data. */
export function appendLiveDataSection(report: string, liveDataJson: string): string {
  if (report.includes("Live Market Data (Verified)")) return report;

  try {
    const data = JSON.parse(liveDataJson);
    const ts = data["Data Timestamp"]
      ? new Date(data["Data Timestamp"]).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    const liveSection = `
## Live Market Data (Verified)

> The following data is fetched in real-time from Yahoo Finance at report generation time and supersedes any conflicting figures in the analysis above.

| Metric | Value |
| :--- | :--- |
| **Company** | ${data["Company"] ?? "N/A"} |
| **Current Price** | $${data["Current Price"] ?? "N/A"} |
| **Market Cap** | $${data["Market Cap"] ?? "N/A"} |
| **P/E Ratio (TTM)** | ${data["P/E Ratio (TTM)"] ?? "N/A"} |
| **Forward P/E** | ${data["Forward P/E"] ?? "N/A"} |
| **EPS (TTM)** | $${data["EPS (TTM)"] ?? "N/A"} |
| **Revenue (TTM)** | $${data["Revenue (TTM)"] ?? "N/A"} |
| **Gross Margin** | ${data["Gross Margin"] ?? "N/A"} |
| **Profit Margin** | ${data["Profit Margin"] ?? "N/A"} |
| **ROE** | ${data["ROE"] ?? "N/A"} |
| **52-Week High** | $${data["52-Week High"] ?? "N/A"} |
| **52-Week Low** | $${data["52-Week Low"] ?? "N/A"} |
| **Beta** | ${data["Beta"] ?? "N/A"} |
| **Dividend Yield** | ${data["Dividend Yield"] ?? "N/A"} |

*Data as of: ${ts}*
`;

    return report.trimEnd() + "\n\n---\n" + liveSection;
  } catch {
    return report;
  }
}

// ═══════════════════════════════════════════════════════════════
// Node: Reflexion (structured output — no regex)
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
          `(attempt ${iteration + 1}), ` +
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
  const logs: string[] = [];
  let notionSaved = false;
  let emailSent = false;
  let notionUrl: string | undefined;

  // ── Direct integrations (reliable, no LLM needed) ──────────
  if (isNotionConfigured()) {
    try {
      const result = await saveReportToNotion({
        company: state.company,
        report,
        riskScore: state.riskScore,
        tags: [state.company, "investment-analysis"],
      });
      notionSaved = true;
      notionUrl = result.pageUrl;
      logs.push(`[${timestamp()}] 📝 Notion: ✅ saved → ${result.pageUrl}`);
    } catch (e) {
      logs.push(`[${timestamp()}] 📝 Notion: ❌ ${String(e)}`);
    }
  } else {
    logs.push(`[${timestamp()}] 📝 Notion: ⏭️ skipped (NOTION_API_KEY not set)`);
  }

  if (isEmailConfigured()) {
    try {
      const result = await sendReportEmail({
        company: state.company,
        report,
        riskScore: state.riskScore,
        notionUrl,
      });
      emailSent = true;
      logs.push(`[${timestamp()}] 📧 Email: ✅ sent (${result.messageId})`);
    } catch (e) {
      logs.push(`[${timestamp()}] 📧 Email: ❌ ${String(e)}`);
    }
  } else {
    logs.push(`[${timestamp()}] 📧 Email: ⏭️ skipped (SMTP not configured)`);
  }

  // ── Fallback to LLM-based delivery crew (when no direct integrations) ──
  if (!isNotionConfigured() && !isEmailConfigured()) {
    try {
      const crew = new DeliveryCrew();
      const result = await crew.run(state.company, report, state.riskScore ?? 5);
      notionSaved = result.notionSaved;
      emailSent = result.emailSent;
      logs.push(`[${timestamp()}] 📨 Delivery crew completed`);
    } catch (e) {
      logs.push(`[${timestamp()}] ❌ Delivery crew failed: ${String(e)}`);
    }
  }

  return {
    deliveryStatus: `notion=${notionSaved}, email=${emailSent}`,
    currentPhase: "delivered",
    logs: [`[${timestamp()}] 📨 Delivery complete:`, ...logs],
  };
}

// ═══════════════════════════════════════════════════════════════
// Node: Finalize (with PRM summary + cost report)
// ═══════════════════════════════════════════════════════════════

export async function finalizeNode(state: AgentState): Promise<Partial<AgentState>> {
  // Generate PRM pipeline summary
  const prmSummary = prm.getSummary();
  const weakest = prm.getWeakestStep();

  const logs = [
    `[${timestamp()}] 🏁 Workflow completed. Final report ready.`,
    `[${timestamp()}] 📊 Pipeline Quality:\n${prmSummary}`,
  ];

  if (weakest) {
    logs.push(`[${timestamp()}] 💡 Weakest step: ${weakest}`);
  }

  return {
    finalReport: state.draftReport ?? "No report generated.",
    currentPhase: "completed",
    logs,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt to adapt the execution plan after a node completes.
 * Returns the updated plan as JSON string, or null if adaptation fails/skipped.
 */
async function tryAdaptPlan(
  state: AgentState,
  completedTask: string,
  taskResult: string
): Promise<string | null> {
  try {
    const planStr = state.executionPlan;
    if (!planStr) return null;

    const plan: ExecutionPlan = JSON.parse(planStr);
    const planner = new DynamicPlanner();
    const adapted = await planner.adaptPlan(plan, completedTask, taskResult);

    // Only return if plan actually changed
    if (adapted.version > plan.version) {
      return JSON.stringify(adapted);
    }
    return null;
  } catch {
    return null;
  }
}

// Common company-to-ticker mappings
const TICKER_MAP: Record<string, string> = {
  // US stocks
  nvidia: "NVDA", apple: "AAPL", google: "GOOGL", alphabet: "GOOGL",
  microsoft: "MSFT", amazon: "AMZN", meta: "META", facebook: "META",
  tesla: "TSLA", netflix: "NFLX", amd: "AMD", intel: "INTC",
  broadcom: "AVGO", tsmc: "TSM", samsung: "005930.KS",
  micron: "MU", alibaba: "BABA",
  // HK stocks (港股)
  tencent: "0700.HK", meituan: "3690.HK", xiaomi: "1810.HK",
  byd: "1211.HK", "alibaba hk": "9988.HK", "jd hk": "9618.HK",
  "netease hk": "9999.HK", "baidu hk": "9888.HK",
  // A-shares (A股)
  "kweichow moutai": "600519.SS", "catl": "300750.SZ",
  // Chinese names → tickers
  "英伟达": "NVDA", "苹果": "AAPL", "谷歌": "GOOGL", "亚马逊": "AMZN",
  "阿里巴巴": "BABA", "美光": "MU", "特斯拉": "TSLA", "微软": "MSFT",
  "腾讯": "0700.HK", "美团": "3690.HK", "小米": "1810.HK",
  "比亚迪": "1211.HK", "京东": "9618.HK", "网易": "9999.HK",
  "百度": "9888.HK", "贵州茅台": "600519.SS", "宁德时代": "300750.SZ",
};

export function guessTickerFromCompany(company: string): string | null {
  const lower = company.toLowerCase().trim();
  if (TICKER_MAP[lower]) return TICKER_MAP[lower];
  for (const [key, ticker] of Object.entries(TICKER_MAP)) {
    if (lower.includes(key)) return ticker;
  }
  if (/^[A-Z]{1,5}$/.test(company.trim())) return company.trim();
  return null;
}
