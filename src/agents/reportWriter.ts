/**
 * Report Writer Agent (LangChain.js)
 * ====================================
 * Generates the final investment report using a prompt chain.
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { LLMConfig, createLLM } from "../config.js";

export class ReportWriterAgent {
  private chain: ReturnType<typeof this.buildChain>;
  private revisionChain: ReturnType<typeof this.buildRevisionChain>;

  constructor() {
    this.chain = this.buildChain();
    this.revisionChain = this.buildRevisionChain();
  }

  private buildChain() {
    const llm = createLLM({ model: LLMConfig.reportModel, temperature: 0.3 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", REPORT_SYSTEM_PROMPT],
      ["human", REPORT_USER_PROMPT],
    ]);
    return prompt.pipe(llm).pipe(new StringOutputParser());
  }

  private buildRevisionChain() {
    const llm = createLLM({ model: LLMConfig.reportModel, temperature: 0.3 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system",
        "You are a senior investment report editor. Revise based on feedback. " +
        "Maintain structure, improve quality and accuracy."],
      ["human",
        "## Current Draft:\n{draft}\n\n## Feedback:\n{feedback}\n\n" +
        "Provide revised report for {company}."],
    ]);
    return prompt.pipe(llm).pipe(new StringOutputParser());
  }

  async generate(params: {
    company: string;
    researchSummary: string;
    financialAnalysis: string;
    marketAnalysis: string;
    techAnalysis: string;
    riskAssessment: string;
    riskScore: number;
    reflexionContext?: string;
  }): Promise<string> {
    return this.chain.invoke({
      company: params.company,
      researchSummary: params.researchSummary,
      financialAnalysis: params.financialAnalysis,
      marketAnalysis: params.marketAnalysis,
      techAnalysis: params.techAnalysis,
      riskAssessment: params.riskAssessment,
      riskScore: String(params.riskScore),
      reflexionContext: params.reflexionContext ?? "First attempt.",
    });
  }

  async revise(draft: string, feedback: string, company: string): Promise<string> {
    return this.revisionChain.invoke({ draft, feedback, company });
  }
}

const REPORT_SYSTEM_PROMPT = `You are a senior investment analyst at a top-tier investment bank.
You produce clear, data-driven reports used by portfolio managers.

STRUCTURE (follow exactly):
1. Executive Summary (2-3 paragraphs)
2. Company Overview
3. Financial Analysis (include metrics table)
4. Market & Competitive Position
5. Technology & Innovation
6. Risk Assessment (include risk matrix)
7. Investment Thesis (Bull / Bear)
8. Recommendation & Price Target Range
9. Key Metrics Dashboard (table)`;

const REPORT_USER_PROMPT = `Generate investment report for **{company}**.

=== RESEARCH ===
{researchSummary}

=== FINANCIAL ===
{financialAnalysis}

=== MARKET ===
{marketAnalysis}

=== TECHNOLOGY ===
{techAnalysis}

=== RISK (Score: {riskScore}/10) ===
{riskAssessment}

=== REFLEXION CONTEXT ===
{reflexionContext}

Generate complete Markdown report with real numbers and clear insights.`;
