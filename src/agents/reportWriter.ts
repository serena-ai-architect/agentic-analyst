/**
 * Report Writer Agent (LangChain.js)
 * ====================================
 * Generates the final investment report using a prompt chain.
 * Supports translation to Chinese for dual-language output.
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { LLMConfig, createLLM, getTodayString } from "../config.js";

export class ReportWriterAgent {
  private chain: ReturnType<typeof this.buildChain>;
  private revisionChain: ReturnType<typeof this.buildRevisionChain>;
  private translationChain: ReturnType<typeof this.buildTranslationChain>;

  constructor() {
    this.chain = this.buildChain();
    this.revisionChain = this.buildRevisionChain();
    this.translationChain = this.buildTranslationChain();
  }

  private buildChain() {
    const llm = createLLM({ model: LLMConfig.reportModel, temperature: 0.3 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", getReportSystemPrompt()],
      ["human", REPORT_USER_PROMPT],
    ]);
    return prompt.pipe(llm).pipe(new StringOutputParser());
  }

  private buildRevisionChain() {
    const llm = createLLM({ model: LLMConfig.reportModel, temperature: 0.3 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system",
        `Today's date: ${getTodayString()}. ` +
        "You are a senior investment report editor. Revise based on feedback. " +
        "Maintain structure, improve quality and accuracy. " +
        "Do NOT add data that was not in the original research — only reorganize, clarify, and improve what exists."],
      ["human",
        "## Current Draft:\n{draft}\n\n## Feedback:\n{feedback}\n\n" +
        "Provide revised report for {company}."],
    ]);
    return prompt.pipe(llm).pipe(new StringOutputParser());
  }

  private buildTranslationChain() {
    const llm = createLLM({ model: LLMConfig.reportModel, temperature: 0.3 });
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", TRANSLATION_SYSTEM_PROMPT],
      ["human",
        "Translate the following investment report to Chinese (Simplified).\n" +
        "Maintain ALL formatting, Markdown structure, tables, and numerical data exactly as-is.\n" +
        "Do NOT alter any financial figures, ticker symbols, or proper nouns.\n\n" +
        "{report}"],
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
    const report = await this.chain.invoke({
      company: params.company,
      reportDate: getTodayString(),
      researchSummary: params.researchSummary,
      financialAnalysis: params.financialAnalysis,
      marketAnalysis: params.marketAnalysis,
      techAnalysis: params.techAnalysis,
      riskAssessment: params.riskAssessment,
      riskScore: String(params.riskScore),
      reflexionContext: params.reflexionContext ?? "First attempt.",
    });
    return fixReportDate(report);
  }

  async revise(draft: string, feedback: string, company: string): Promise<string> {
    const report = await this.revisionChain.invoke({ draft, feedback, company });
    return fixReportDate(report);
  }

  async translate(report: string): Promise<string> {
    return this.translationChain.invoke({ report });
  }
}

function getReportSystemPrompt(): string {
  return `Today's date: ${getTodayString()}.

You are a senior investment analyst at a top-tier investment bank.
You produce clear, data-driven reports used by portfolio managers.

STRUCTURE (follow exactly):
1. Executive Summary (2-3 paragraphs) — Report date MUST be: ${getTodayString()}
2. Company Overview
3. Financial Analysis (include metrics table)
4. Market & Competitive Position
5. Technology & Innovation
6. Risk Assessment (include risk matrix)
7. Investment Thesis (Bull / Bear)
8. Recommendation & Price Target Range
9. Key Metrics Dashboard (table)

IMPORTANT: The report date in the header MUST be exactly ${getTodayString()}. Do NOT use any other date.

CRITICAL: This report must be based EXCLUSIVELY on the data provided below.
Do NOT supplement with data from training knowledge. If data for a section
is missing or insufficient, explicitly state "Data not available" rather than
fabricating figures. Every number in this report must trace back to the
provided research, financial, market, technology, or risk data.`;
}

const REPORT_USER_PROMPT = `Generate investment report for **{company}**.

The report header MUST start with exactly:
# Investment Analysis Report: {company}
**Report Date:** {reportDate}

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

Generate complete Markdown report using ONLY the data provided above.
If any section has insufficient data, note it as "Insufficient data available" rather than fabricating content.`;

const TRANSLATION_SYSTEM_PROMPT = `You are a professional financial translator specializing in investment analysis reports.
Translate from English to Simplified Chinese (简体中文).
Rules:
1. Preserve all Markdown formatting, headings, tables, bullet points, and code blocks exactly.
2. Keep all numbers, ticker symbols, financial metrics, and formulas unchanged.
3. Use standard Chinese financial terminology (e.g., "市盈率" for P/E ratio, "市值" for market cap).
4. Translate proper nouns using their widely-accepted Chinese names (e.g., NVIDIA = 英伟达, Apple = 苹果).
5. Keep the same section structure and numbering.`;

/** Post-process: force the Report Date line to use the actual current date. */
function fixReportDate(report: string): string {
  const today = getTodayString();
  // Match "**Report Date:**" or "**Report Date**:" followed by any date string on the same line
  return report.replace(
    /(\*\*Report Date[:\s]*\*\*[:\s]*).+/i,
    `$1${today}`
  );
}
