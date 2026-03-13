/**
 * Agent Crews — Multi-Agent Team Orchestration
 * =============================================
 * Each "crew" coordinates specialized ReAct agents that can autonomously
 * call tools, observe results, and reason over multiple turns.
 *
 * Architecture upgrade: replaced single-turn llm.bindTools().invoke() with
 * proper ReAct agents via LangGraph's createReactAgent. Each agent now:
 *   1. Receives a task
 *   2. Decides which tools to call
 *   3. Executes tools and observes results
 *   4. Reasons and decides next action (or produces final answer)
 *   5. Loops until task is complete
 */

import { LLMConfig } from "../config.js";
import { buildReactAgent, runReactAgent } from "../agents/reactAgent.js";
import { getSearchTools } from "../tools/searchTools.js";
import { getFinanceTools } from "../tools/financeTools.js";
import { getMcpResearchTools, getMcpDeliveryTools } from "../tools/mcpTools.js";
import { createLLM } from "../config.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Research Crew — 3 ReAct agents run sequentially
// ═══════════════════════════════════════════════════════════════

export class ResearchCrew {
  async run(company: string, query: string): Promise<{
    researchData: Record<string, unknown>;
    researchSummary: string;
    sources: string[];
  }> {
    // Agent 1: Web Researcher — uses search tools to find real data
    const researcherAgent = buildReactAgent({
      model: LLMConfig.researchModel,
      role: "webResearcher",
      tools: [...getSearchTools(), ...getMcpResearchTools()],
    });

    const qualitativeResearch = await runReactAgent(
      researcherAgent,
      `Research ${company} thoroughly. Find:\n` +
        `1. Company overview and business model\n` +
        `2. Recent news (last 6 months)\n` +
        `3. Key products/services and revenue drivers\n` +
        `4. Leadership and strategic decisions\n` +
        `5. Market position\n\n` +
        `Additional focus: ${query}`
    );

    // Agent 2: Data Collector — uses finance tools to get real numbers
    const collectorAgent = buildReactAgent({
      model: LLMConfig.researchModel,
      role: "dataCollector",
      tools: getFinanceTools(),
    });

    const quantitativeData = await runReactAgent(
      collectorAgent,
      `Collect financial data for ${company}:\n` +
        `1. Current valuation metrics (P/E, P/S, market cap)\n` +
        `2. Revenue and earnings trends\n` +
        `3. Margins (gross, operating, net)\n` +
        `4. Balance sheet health\n` +
        `5. Analyst consensus and price targets`
    );

    // Agent 3: Synthesizer — no tools, pure reasoning over collected data
    const synthesizerAgent = buildReactAgent({
      model: LLMConfig.researchModel,
      role: "summarizer",
      tools: [], // No tools — synthesizes from provided data
    });

    const researchSummary = await runReactAgent(
      synthesizerAgent,
      `Synthesize the following research and data for ${company}:\n\n` +
        `=== QUALITATIVE RESEARCH ===\n${qualitativeResearch}\n\n` +
        `=== QUANTITATIVE DATA ===\n${quantitativeData}\n\n` +
        `Create a 500-800 word intelligence brief highlighting:\n` +
        `1. Top 5 findings\n2. Key strengths and concerns\n` +
        `3. Contradictions or gaps\n4. Preliminary assessment`
    );

    return {
      researchData: {
        qualitative: qualitativeResearch,
        quantitative: quantitativeData,
      },
      researchSummary,
      sources: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Analysis Crew — 3 ReAct analysts run in PARALLEL
// ═══════════════════════════════════════════════════════════════

export class AnalysisCrew {
  async run(company: string, researchSummary: string): Promise<{
    financialAnalysis: string;
    marketAnalysis: string;
    techAnalysis: string;
  }> {
    const contextBlock =
      `=== RESEARCH CONTEXT ===\n${researchSummary}\n=== END ===\n\n`;

    // Run all three analysts in PARALLEL
    const [financialAnalysis, marketAnalysis, techAnalysis] = await Promise.all([
      this.runFinancialAnalyst(company, contextBlock),
      this.runMarketAnalyst(company, contextBlock),
      this.runTechAnalyst(company, contextBlock),
    ]);

    return { financialAnalysis, marketAnalysis, techAnalysis };
  }

  private async runFinancialAnalyst(company: string, context: string): Promise<string> {
    const agent = buildReactAgent({
      model: LLMConfig.analysisModel,
      role: "financialAnalyst",
      tools: getFinanceTools(),
    });

    return runReactAgent(
      agent,
      `${context}Perform deep financial analysis of ${company}:\n` +
        `1. Valuation: overvalued/undervalued vs industry/historical\n` +
        `2. Growth: revenue CAGR, earnings trajectory\n` +
        `3. Profitability: margin trends, ROIC\n` +
        `4. Balance sheet: debt, cash generation\n` +
        `5. Bull/base/bear case price targets`
    );
  }

  private async runMarketAnalyst(company: string, context: string): Promise<string> {
    const agent = buildReactAgent({
      model: LLMConfig.analysisModel,
      role: "marketAnalyst",
      tools: getSearchTools(),
    });

    return runReactAgent(
      agent,
      `${context}Analyze ${company}'s market position:\n` +
        `1. TAM/SAM/SOM\n2. Competitive moat\n` +
        `3. Porter's Five Forces\n4. Top 3-5 competitors\n` +
        `5. Market tailwinds and headwinds`
    );
  }

  private async runTechAnalyst(company: string, context: string): Promise<string> {
    const agent = buildReactAgent({
      model: LLMConfig.analysisModel,
      role: "techAnalyst",
      tools: getSearchTools(),
    });

    return runReactAgent(
      agent,
      `${context}Evaluate ${company}'s technology:\n` +
        `1. Core technology stack\n2. R&D investment\n` +
        `3. Innovation pipeline\n4. Technology moat\n` +
        `5. Disruption risks`
    );
  }
}

// ═══════════════════════════════════════════════════════════════
// Risk Crew — 2 ReAct agents + structured risk score output
// ═══════════════════════════════════════════════════════════════

/** Zod schema for structured risk score extraction */
const RiskScoreSchema = z.object({
  overallScore: z.number().min(1).max(10).describe("Overall risk score from 1 (low risk) to 10 (high risk)"),
  dimensions: z.object({
    market: z.number().min(1).max(10),
    operational: z.number().min(1).max(10),
    competitive: z.number().min(1).max(10),
    financial: z.number().min(1).max(10),
    geopolitical: z.number().min(1).max(10),
  }),
  summary: z.string().describe("One-paragraph risk summary"),
});

export class RiskCrew {
  async run(
    company: string,
    researchSummary: string,
    analysisContext: string
  ): Promise<{ riskAssessment: string; riskScore: number }> {
    const context =
      `=== RESEARCH ===\n${researchSummary}\n\n` +
      `=== ANALYSIS ===\n${analysisContext}\n=== END ===\n\n`;

    // Agent 1: Risk Analyst — uses search tools for current risk data
    const riskAgent = buildReactAgent({
      model: LLMConfig.analysisModel,
      role: "riskAnalyst",
      tools: getSearchTools(),
    });

    const riskContent = await runReactAgent(
      riskAgent,
      `${context}Risk assessment for ${company}:\n` +
        `1. Market Risk (severity/likelihood/impact/mitigants)\n` +
        `2. Operational Risk\n3. Competitive Risk\n` +
        `4. Financial Risk\n5. Geopolitical Risk\n\n` +
        `Provide detailed analysis for each risk dimension.`
    );

    // Agent 2: Compliance Analyst — adds regulatory analysis
    const complianceAgent = buildReactAgent({
      model: LLMConfig.analysisModel,
      role: "complianceAnalyst",
      tools: getSearchTools(),
    });

    const riskAssessment = await runReactAgent(
      complianceAgent,
      `${context}\n=== RISK ANALYSIS ===\n${riskContent}\n\n` +
        `Add regulatory analysis for ${company}:\n` +
        `1. Regulatory environment\n2. Pending legislation\n` +
        `3. Antitrust risk\n4. Data privacy\n` +
        `5. ESG\n6. International compliance\n\n` +
        `Create unified risk picture.`
    );

    // Extract structured risk score via LLM with structured output
    const riskScore = await this.extractStructuredRiskScore(company, riskAssessment);

    return { riskAssessment, riskScore };
  }

  /**
   * Use LLM structured output (Zod schema) to extract a reliable risk score.
   * Replaces fragile regex parsing.
   */
  private async extractStructuredRiskScore(company: string, riskAssessment: string): Promise<number> {
    try {
      const llm = createLLM({ model: LLMConfig.analysisModel, temperature: 0 }) as any;
      const structuredLLM = llm.withStructuredOutput(RiskScoreSchema);

      const result = await structuredLLM.invoke([
        new SystemMessage(
          "You are a risk scoring specialist. Extract a structured risk score from the provided risk assessment. " +
          "Score each dimension from 1 (low risk) to 10 (high risk)."
        ),
        new HumanMessage(
          `Extract structured risk scores for ${company} from this assessment:\n\n${riskAssessment.slice(0, 4000)}`
        ),
      ]);

      return result.overallScore;
    } catch {
      // Fallback: if structured output fails, default to moderate risk
      return 5.0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Delivery Crew (MCP-powered)
// ═══════════════════════════════════════════════════════════════

export class DeliveryCrew {
  async run(
    company: string,
    report: string,
    riskScore: number
  ): Promise<{
    deliveryStatus: string;
    notionSaved: boolean;
    emailSent: boolean;
    meetingScheduled: boolean;
  }> {
    let notionSaved = false;
    let emailSent = false;
    let meetingScheduled = false;

    // Knowledge Manager Agent — saves to Notion
    try {
      const mcpDeliveryTools = getMcpDeliveryTools();
      if (mcpDeliveryTools.length > 0) {
        const kmAgent = buildReactAgent({
          model: LLMConfig.researchModel,
          role: "knowledgeManager",
          tools: [mcpDeliveryTools[0]],
        });

        await runReactAgent(
          kmAgent,
          `Save the ${company} investment analysis to Notion.\n` +
            `Title: "${company} Investment Analysis"\n` +
            `Tags: relevant sector tags\n` +
            `Risk Score: ${riskScore}/10\n\n` +
            `Report: ${report.slice(0, 2000)}`
        );
        notionSaved = true;
      }
    } catch {
      // Notion save failed — non-fatal
    }

    // Distribution Coordinator Agent — sends email, schedules meetings
    try {
      const mcpDeliveryTools = getMcpDeliveryTools();
      if (mcpDeliveryTools.length > 1) {
        const distAgent = buildReactAgent({
          model: LLMConfig.researchModel,
          role: "distributionCoordinator",
          tools: mcpDeliveryTools.slice(1),
        });

        await runReactAgent(
          distAgent,
          `Distribute ${company} analysis:\n` +
            `1. Email report to team@company.com\n` +
            `2. Schedule 30-min review meeting\n` +
            `3. Set follow-up reminders for key dates\n\n` +
            `Report summary: ${report.slice(0, 1500)}`
        );
        emailSent = true;
        meetingScheduled = true;
      }
    } catch {
      // Distribution failed — non-fatal
    }

    return {
      deliveryStatus: notionSaved || emailSent ? "completed" : "skipped",
      notionSaved,
      emailSent,
      meetingScheduled,
    };
  }
}
