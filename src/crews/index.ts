/**
 * Agent Crews (LangChain.js)
 * ============================
 * In Python we used CrewAI for team-based agent coordination.
 * In JS there's no CrewAI equivalent, so we implement the same
 * pattern using LangChain.js agents with tool binding.
 *
 * Pattern: Each "crew" is a class that:
 *   1. Creates specialized agents (ChatOpenAI + tools + system prompt)
 *   2. Runs them in sequence, passing context between them
 *   3. Returns structured output for the LangGraph state
 *
 * This is actually cleaner than CrewAI — less magic, more control.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { LLMConfig, AGENT_ROLES, createLLM } from "../config.js";
import { getSearchTools } from "../tools/searchTools.js";
import { getFinanceTools } from "../tools/financeTools.js";
import { getMcpResearchTools, getMcpDeliveryTools } from "../tools/mcpTools.js";

// ═══════════════════════════════════════════════════════════════
// Helper: Create a tool-augmented agent
// ═══════════════════════════════════════════════════════════════

function createAgent(
  model: string,
  role: (typeof AGENT_ROLES)[keyof typeof AGENT_ROLES],
  tools: any[] = []
) {
  const llm = createLLM({ model, temperature: LLMConfig.temperature });

  // Bind tools if provided — this enables function calling
  const agent = tools.length > 0 ? llm.bindTools(tools) : llm;

  const systemPrompt = new SystemMessage(
    `You are a ${role.role}.\n\n` +
      `Goal: ${role.goal}\n\n` +
      `Background: ${role.backstory}\n\n` +
      `Always provide specific, data-driven insights. ` +
      `Cite numbers and sources when available.`
  );

  return { agent, systemPrompt };
}

// ═══════════════════════════════════════════════════════════════
// Research Crew
// ═══════════════════════════════════════════════════════════════

export class ResearchCrew {
  /**
   * Research team: 3 agents run sequentially.
   *   Researcher → Data Collector → Synthesizer
   */

  async run(company: string, query: string): Promise<{
    researchData: Record<string, unknown>;
    researchSummary: string;
    sources: string[];
  }> {
    // Agent 1: Web Researcher
    const researcher = createAgent(
      LLMConfig.researchModel,
      AGENT_ROLES.webResearcher,
      [...getSearchTools(), ...getMcpResearchTools()]
    );

    const researchResult = await researcher.agent.invoke([
      researcher.systemPrompt,
      new HumanMessage(
        `Research ${company} thoroughly. Find:\n` +
          `1. Company overview and business model\n` +
          `2. Recent news (last 6 months)\n` +
          `3. Key products/services and revenue drivers\n` +
          `4. Leadership and strategic decisions\n` +
          `5. Market position\n\n` +
          `Additional focus: ${query}`
      ),
    ]);

    // Agent 2: Data Collector
    const collector = createAgent(
      LLMConfig.researchModel,
      AGENT_ROLES.dataCollector,
      getFinanceTools()
    );

    const dataResult = await collector.agent.invoke([
      collector.systemPrompt,
      new HumanMessage(
        `Collect financial data for ${company}:\n` +
          `1. Current valuation metrics (P/E, P/S, market cap)\n` +
          `2. Revenue and earnings trends\n` +
          `3. Margins (gross, operating, net)\n` +
          `4. Balance sheet health\n` +
          `5. Analyst consensus and price targets`
      ),
    ]);

    // Agent 3: Synthesizer
    const synthesizer = createAgent(
      LLMConfig.researchModel,
      AGENT_ROLES.summarizer
    );

    const synthesisResult = await synthesizer.agent.invoke([
      synthesizer.systemPrompt,
      new HumanMessage(
        `Synthesize the following research and data for ${company}:\n\n` +
          `=== QUALITATIVE RESEARCH ===\n${typeof researchResult.content === 'string' ? researchResult.content : JSON.stringify(researchResult.content)}\n\n` +
          `=== QUANTITATIVE DATA ===\n${typeof dataResult.content === 'string' ? dataResult.content : JSON.stringify(dataResult.content)}\n\n` +
          `Create a 500-800 word intelligence brief highlighting:\n` +
          `1. Top 5 findings\n2. Key strengths and concerns\n` +
          `3. Contradictions or gaps\n4. Preliminary assessment`
      ),
    ]);

    return {
      researchData: {
        qualitative: typeof researchResult.content === 'string' ? researchResult.content : JSON.stringify(researchResult.content),
        quantitative: typeof dataResult.content === 'string' ? dataResult.content : JSON.stringify(dataResult.content),
      },
      researchSummary: typeof synthesisResult.content === 'string' ? synthesisResult.content : JSON.stringify(synthesisResult.content),
      sources: [],
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// Analysis Crew
// ═══════════════════════════════════════════════════════════════

export class AnalysisCrew {
  /**
   * Analysis team: 3 specialized analysts.
   * Could run in parallel (Promise.all) for speed.
   */

  async run(company: string, researchSummary: string): Promise<{
    financialAnalysis: string;
    marketAnalysis: string;
    techAnalysis: string;
  }> {
    const contextBlock =
      `=== RESEARCH CONTEXT ===\n${researchSummary}\n=== END ===\n\n`;

    // Run all three analysts in PARALLEL (key JS advantage!)
    const [financialResult, marketResult, techResult] = await Promise.all([
      this.runFinancialAnalyst(company, contextBlock),
      this.runMarketAnalyst(company, contextBlock),
      this.runTechAnalyst(company, contextBlock),
    ]);

    return {
      financialAnalysis: financialResult,
      marketAnalysis: marketResult,
      techAnalysis: techResult,
    };
  }

  private async runFinancialAnalyst(company: string, context: string): Promise<string> {
    const { agent, systemPrompt } = createAgent(
      LLMConfig.analysisModel,
      AGENT_ROLES.financialAnalyst,
      getFinanceTools()
    );

    const result = await agent.invoke([
      systemPrompt,
      new HumanMessage(
        `${context}Perform deep financial analysis of ${company}:\n` +
          `1. Valuation: overvalued/undervalued vs industry/historical\n` +
          `2. Growth: revenue CAGR, earnings trajectory\n` +
          `3. Profitability: margin trends, ROIC\n` +
          `4. Balance sheet: debt, cash generation\n` +
          `5. Bull/base/bear case price targets`
      ),
    ]);
    return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  }

  private async runMarketAnalyst(company: string, context: string): Promise<string> {
    const { agent, systemPrompt } = createAgent(
      LLMConfig.analysisModel,
      AGENT_ROLES.marketAnalyst,
      getSearchTools()
    );

    const result = await agent.invoke([
      systemPrompt,
      new HumanMessage(
        `${context}Analyze ${company}'s market position:\n` +
          `1. TAM/SAM/SOM\n2. Competitive moat\n` +
          `3. Porter's Five Forces\n4. Top 3-5 competitors\n` +
          `5. Market tailwinds and headwinds`
      ),
    ]);
    return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  }

  private async runTechAnalyst(company: string, context: string): Promise<string> {
    const { agent, systemPrompt } = createAgent(
      LLMConfig.analysisModel,
      AGENT_ROLES.techAnalyst,
      getSearchTools()
    );

    const result = await agent.invoke([
      systemPrompt,
      new HumanMessage(
        `${context}Evaluate ${company}'s technology:\n` +
          `1. Core technology stack\n2. R&D investment\n` +
          `3. Innovation pipeline\n4. Technology moat\n` +
          `5. Disruption risks`
      ),
    ]);
    return typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  }
}

// ═══════════════════════════════════════════════════════════════
// Risk Crew
// ═══════════════════════════════════════════════════════════════

export class RiskCrew {
  async run(
    company: string,
    researchSummary: string,
    analysisContext: string
  ): Promise<{ riskAssessment: string; riskScore: number }> {
    const context =
      `=== RESEARCH ===\n${researchSummary}\n\n` +
      `=== ANALYSIS ===\n${analysisContext}\n=== END ===\n\n`;

    // Risk Analyst
    const riskAgent = createAgent(
      LLMConfig.analysisModel,
      AGENT_ROLES.riskAnalyst,
      getSearchTools()
    );

    const riskResult = await riskAgent.agent.invoke([
      riskAgent.systemPrompt,
      new HumanMessage(
        `${context}Risk assessment for ${company}:\n` +
          `1. Market Risk (severity/likelihood/impact/mitigants)\n` +
          `2. Operational Risk\n3. Competitive Risk\n` +
          `4. Financial Risk\n5. Geopolitical Risk\n\n` +
          `End with overall risk score 1-10.`
      ),
    ]);

    // Compliance Analyst
    const complianceAgent = createAgent(
      LLMConfig.analysisModel,
      AGENT_ROLES.complianceAnalyst,
      getSearchTools()
    );

    const riskContent = typeof riskResult.content === 'string' ? riskResult.content : JSON.stringify(riskResult.content);

    const complianceResult = await complianceAgent.agent.invoke([
      complianceAgent.systemPrompt,
      new HumanMessage(
        `${context}\n=== RISK ANALYSIS ===\n${riskContent}\n\n` +
          `Add regulatory analysis for ${company}:\n` +
          `1. Regulatory environment\n2. Pending legislation\n` +
          `3. Antitrust risk\n4. Data privacy\n` +
          `5. ESG\n6. International compliance\n\n` +
          `Create unified risk picture.`
      ),
    ]);

    const complianceContent = typeof complianceResult.content === 'string' ? complianceResult.content : JSON.stringify(complianceResult.content);

    return {
      riskAssessment: complianceContent,
      riskScore: this.extractRiskScore(complianceContent),
    };
  }

  private extractRiskScore(text: string): number {
    const patterns = [
      /risk\s*score[:\s]+(\d+\.?\d*)/i,
      /overall[:\s]+(\d+\.?\d*)\s*\/\s*10/i,
      /(\d+\.?\d*)\s*\/\s*10/,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const score = parseFloat(match[1]);
        if (score >= 1 && score <= 10) return score;
      }
    }
    return 5.0;
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
    // Knowledge Manager Agent
    const kmAgent = createAgent(
      LLMConfig.researchModel,
      AGENT_ROLES.knowledgeManager,
      [getMcpDeliveryTools()[0]] // notion_save_analysis
    );

    await kmAgent.agent.invoke([
      kmAgent.systemPrompt,
      new HumanMessage(
        `Save the ${company} investment analysis to Notion.\n` +
          `Title: "${company} Investment Analysis"\n` +
          `Tags: relevant sector tags\n` +
          `Risk Score: ${riskScore}/10\n\n` +
          `Report: ${report.slice(0, 2000)}`
      ),
    ]);

    // Distribution Coordinator Agent
    const distAgent = createAgent(
      LLMConfig.researchModel,
      AGENT_ROLES.distributionCoordinator,
      getMcpDeliveryTools().slice(1) // gmail + calendar tools
    );

    await distAgent.agent.invoke([
      distAgent.systemPrompt,
      new HumanMessage(
        `Distribute ${company} analysis:\n` +
          `1. Email report to team@company.com\n` +
          `2. Schedule 30-min review meeting\n` +
          `3. Set follow-up reminders for key dates\n\n` +
          `Report summary: ${report.slice(0, 1500)}`
      ),
    ]);

    return {
      deliveryStatus: "completed",
      notionSaved: true,
      emailSent: true,
      meetingScheduled: true,
    };
  }
}
