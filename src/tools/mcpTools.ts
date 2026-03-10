/**
 * MCP (Model Context Protocol) Tool Integrations
 * =================================================
 * Wraps MCP server interactions as LangChain.js tools.
 *
 * Architecture:
 *   Agent → LangChain Tool → MCP Client → MCP Server → Service (Notion/Gmail/etc.)
 *
 * In production, these tools would use the @modelcontextprotocol/sdk
 * to communicate with real MCP servers. Here we show the integration
 * pattern with typed schemas.
 *
 * Available MCP servers:
 *   - Notion:  https://mcp.notion.com/mcp
 *   - Gmail:   https://gmail.mcp.claude.com/mcp
 *   - Calendar: https://gcal.mcp.claude.com/mcp
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ═══════════════════════════════════════════════════════════════
// Notion MCP Tools
// ═══════════════════════════════════════════════════════════════

export const notionSaveAnalysis = tool(
  async ({ title, content, tags }): Promise<string> => {
    // Production: Call Notion MCP server via @modelcontextprotocol/sdk
    // const client = new Client({ name: "research-agent" });
    // await client.callTool("notion-create-pages", { title, content, ... });

    const tagList = tags
      ? tags.split(",").map((t: string) => t.trim())
      : [];

    return JSON.stringify({
      status: "success",
      message: `Analysis "${title}" saved to Notion`,
      pageUrl: `https://notion.so/team/analysis-${title.toLowerCase().replace(/\s+/g, "-")}`,
      tags: tagList,
      mcpServer: "notion",
      note: "Production: calls Notion MCP server",
    });
  },
  {
    name: "notion_save_analysis",
    description:
      "Save an analysis report to the team's Notion knowledge base. " +
      "Creates a searchable page for institutional memory.",
    schema: z.object({
      title: z.string().describe('Page title, e.g. "NVIDIA Analysis Q1 2025"'),
      content: z.string().describe("Full analysis content in Markdown"),
      tags: z
        .string()
        .optional()
        .describe("Comma-separated tags: tech,semiconductors,AI"),
    }),
  }
);

export const notionSearchPastAnalyses = tool(
  async ({ query, limit }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      query,
      results: [
        {
          title: `Past analysis matching "${query}"`,
          date: "2024-12-15",
          summary: "Previous deep-dive analysis available in Notion",
          url: "https://notion.so/team/past-analysis",
        },
      ],
      mcpServer: "notion",
    });
  },
  {
    name: "notion_search_past_analyses",
    description:
      "Search Notion knowledge base for past analyses. " +
      "Retrieve historical context to avoid duplicate work.",
    schema: z.object({
      query: z.string().describe("Search query, e.g. 'NVIDIA', 'semiconductor'"),
      limit: z.number().optional().default(5).describe("Max results"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Gmail MCP Tools
// ═══════════════════════════════════════════════════════════════

export const gmailSendReport = tool(
  async ({ to, subject, body, cc }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      message: `Report email sent to ${to}`,
      subject,
      cc: cc ?? "",
      mcpServer: "gmail",
    });
  },
  {
    name: "gmail_send_report",
    description:
      "Send the analysis report via Gmail to stakeholders. " +
      "Supports CC and attachments.",
    schema: z.object({
      to: z.string().describe("Recipient email"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (HTML supported)"),
      cc: z.string().optional().describe("CC recipients, comma-separated"),
    }),
  }
);

export const gmailSearchNewsletters = tool(
  async ({ company, days }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      query: `subject:(${company}) newer_than:${days ?? 30}d`,
      resultsCount: 0,
      results: [],
      mcpServer: "gmail",
    });
  },
  {
    name: "gmail_search_newsletters",
    description:
      "Search Gmail for industry newsletters about a company. " +
      "Gathers additional intelligence during research phase.",
    schema: z.object({
      company: z.string().describe("Company name"),
      days: z.number().optional().default(30).describe("Days to search back"),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Calendar MCP Tools
// ═══════════════════════════════════════════════════════════════

export const calendarScheduleReview = tool(
  async ({ title, description, durationMinutes, attendees }): Promise<string> => {
    const attendeeList = attendees
      ? attendees.split(",").map((a: string) => a.trim())
      : [];

    return JSON.stringify({
      status: "success",
      message: `Review meeting "${title}" scheduled`,
      duration: `${durationMinutes ?? 30} minutes`,
      attendees: attendeeList,
      mcpServer: "calendar",
    });
  },
  {
    name: "calendar_schedule_review",
    description:
      "Schedule a review meeting on Google Calendar. " +
      "Includes analysis summary in the event.",
    schema: z.object({
      title: z.string().describe('Meeting title, e.g. "NVIDIA Analysis Review"'),
      description: z.string().describe("Meeting description with key findings"),
      durationMinutes: z.number().optional().default(30),
      attendees: z.string().optional().describe("Comma-separated emails"),
    }),
  }
);

export const calendarSetFollowup = tool(
  async ({ company, triggerEvent, reminderDate, notes }): Promise<string> => {
    return JSON.stringify({
      status: "success",
      company,
      trigger: triggerEvent,
      reminderDate,
      notes: notes ?? "",
      mcpServer: "calendar",
    });
  },
  {
    name: "calendar_set_followup",
    description:
      "Set a follow-up reminder for key catalyst dates " +
      "(earnings, regulatory decisions, price reviews).",
    schema: z.object({
      company: z.string(),
      triggerEvent: z.string().describe('e.g. "Q2 2025 Earnings"'),
      reminderDate: z.string().describe("ISO date format"),
      notes: z.string().optional(),
    }),
  }
);

// ═══════════════════════════════════════════════════════════════
// Tool Collections
// ═══════════════════════════════════════════════════════════════

export function getMcpResearchTools() {
  return [notionSearchPastAnalyses, gmailSearchNewsletters];
}

export function getMcpDeliveryTools() {
  return [
    notionSaveAnalysis,
    gmailSendReport,
    calendarScheduleReview,
    calendarSetFollowup,
  ];
}

export function getAllMcpTools() {
  return [...getMcpResearchTools(), ...getMcpDeliveryTools()];
}
