/**
 * Multi-Agent Research & Analysis System (TypeScript)
 * =====================================================
 * Entry point with CLI interface.
 *
 * Usage:
 *   npx tsx src/main.ts --company "NVIDIA" --mode full
 *   npx tsx src/main.ts --demo
 *   npx tsx src/main.ts --company "Apple" --mode quick
 */

import "dotenv/config";
import { AGENT_ROLES } from "./config.js";
import { getSearchTools } from "./tools/searchTools.js";
import { getFinanceTools } from "./tools/financeTools.js";
import { getAllMcpTools } from "./tools/mcpTools.js";

function printBanner() {
  console.log("\n" + "=".repeat(65));
  console.log("  🤖 Multi-Agent Research & Analysis System (TypeScript)");
  console.log("  LangGraph.js + LangChain.js + Vercel AI SDK + MCP");
  console.log("=".repeat(65) + "\n");
}

async function runFullPipeline(company: string, query: string, mode: "quick" | "full") {
  const { runWorkflow } = await import("./graph/workflow.js");

  console.log(`🎯 Target: ${company}`);
  console.log(`📋 Query: ${query}`);
  console.log(`⚙️  Mode: ${mode}`);
  console.log(`⏱️  Started: ${new Date().toISOString()}`);
  console.log("-".repeat(65));

  const result = await runWorkflow({
    company,
    query,
    mode,
    stream: true,
  });

  if (result?.finalReport || result?.draftReport) {
    const report = result.finalReport || result.draftReport;
    console.log("\n" + "=".repeat(65));
    console.log("📈 FINAL REPORT");
    console.log("=".repeat(65));
    console.log(report);

    // Save to file
    const fs = await import("fs");
    const filename = `output/${company.toLowerCase().replace(/\s+/g, "_")}_report.md`;
    fs.mkdirSync("output", { recursive: true });
    fs.writeFileSync(filename, report);
    console.log(`\n💾 Report saved to: ${filename}`);
  } else {
    console.log("⚠️ No final report generated. Check logs above.");
  }
}

async function runDemo() {
  console.log("🎭 DEMO MODE — Architecture showcase (no API keys needed)\n");

  // Show agent roles
  console.log("🔧 Agent Roles Configured:");
  for (const [key, agent] of Object.entries(AGENT_ROLES)) {
    console.log(`  • ${agent.role}`);
    console.log(`    Goal: ${agent.goal.slice(0, 75)}...`);
  }

  // Show tools
  console.log("\n🛠️  Tools Available:");
  const allTools = [...getSearchTools(), ...getFinanceTools(), ...getAllMcpTools()];
  for (const t of allTools) {
    console.log(`  • ${t.name}: ${t.description.slice(0, 65)}...`);
  }

  // Show architecture
  console.log("\n📐 Workflow Graph (Mermaid):");
  console.log(`
  graph TD
    START --> Planning --> NotionContext --> Research --> Analysis
    Analysis -->|full| Risk --> Report
    Analysis -->|quick| Report
    Report --> Reflexion
    Reflexion -->|score>=7| Delivery
    Reflexion -->|retry| Report
    Delivery --> Finalize --> END
  `);

  // Show tech stack comparison
  console.log("📊 Tech Stack (JS vs Python):");
  console.log("  ┌──────────────────┬─────────────────────┬────────────────────┐");
  console.log("  │ Capability       │ JS/TS (this)        │ Python (original)  │");
  console.log("  ├──────────────────┼─────────────────────┼────────────────────┤");
  console.log("  │ Orchestration    │ LangGraph.js        │ LangGraph          │");
  console.log("  │ Agents           │ LangChain.js        │ CrewAI + LangChain │");
  console.log("  │ Streaming        │ Vercel AI SDK ⭐    │ FastAPI + SSE      │");
  console.log("  │ MCP              │ @mcp/sdk            │ mcp (python)       │");
  console.log("  │ Type Safety      │ TypeScript + Zod ⭐ │ Pydantic           │");
  console.log("  │ Parallel Agents  │ Promise.all ⭐      │ Sequential         │");
  console.log("  │ Finance Data     │ yahoo-finance2      │ yfinance           │");
  console.log("  │ Validation       │ Zod schemas         │ Pydantic models    │");
  console.log("  └──────────────────┴─────────────────────┴────────────────────┘");

  console.log("\n✅ Demo complete! Set DEEPSEEK_API_KEY to run full pipeline.");
  console.log("   Usage: npx tsx src/main.ts --company 'NVIDIA' --mode full");
}

// ── CLI Parsing ─────────────────────────────────────────────

async function main() {
  printBanner();

  const args = process.argv.slice(2);
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (key === "demo" || key === "v2") {
        flags[key] = "true";
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[i + 1];
        i++;
      }
    }
  }

  if (flags.demo) {
    await runDemo();
  } else if (flags.company) {
    const query = flags.query ?? `Comprehensive investment analysis of ${flags.company}`;
    const mode = (flags.mode === "quick" ? "quick" : "full") as "quick" | "full";
    await runFullPipeline(flags.company, query, mode);
  } else {
    console.log("No arguments. Running demo...\n");
    await runDemo();
  }
}

main().catch(console.error);
