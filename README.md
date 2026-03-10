# 🤖 Multi-Agent Research & Analysis System (TypeScript)

## LangGraph.js + LangChain.js + Vercel AI SDK + MCP

Production-grade multi-agent system in **TypeScript** demonstrating 12 advanced AI agent patterns.

---

## Why TypeScript?

| Advantage | How |
|-----------|-----|
| **Native Streaming** | Vercel AI SDK — 3 lines for production streaming UI |
| **Parallel Agents** | `Promise.all()` — 3 analysts run simultaneously |
| **Type Safety** | TypeScript + Zod — catch state mismatches at compile time |
| **Full-Stack** | Same language front-to-back — Next.js + LangGraph.js |
| **MCP Native** | `@modelcontextprotocol/sdk` — first-class MCP support |
| **Browser Agents** | Puppeteer/Playwright are JS-native |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LangGraph.js Orchestrator                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  📋 Dynamic Planner ──► 📚 Notion Context (MCP)                 │
│         │                                                         │
│         ▼                                                         │
│  🔍 Research Crew (3 agents + MCP newsletter search)             │
│         │                                                         │
│         ▼                                                         │
│  📊 Analysis Crew (3 analysts in PARALLEL via Promise.all)       │
│         │                                                         │
│    ┌────┴────┐                                                    │
│    ▼         ▼                                                    │
│  ⚠️ Risk   📝 Report Writer                                     │
│  Crew       │                                                     │
│    │    ┌───┘                                                     │
│    ▼    ▼                                                         │
│  🪞 Reflexion Engine (evaluate → reflect → retry with lessons)   │
│         │                                                         │
│         ▼                                                         │
│  📨 Delivery Crew (Notion + Gmail + Calendar via MCP)            │
│         │                                                         │
│         ▼                                                         │
│  💰 Cost Report → ✅ Finalize                                    │
└─────────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
src/
├── main.ts                     # CLI entry point
├── config.ts                   # Model & workflow configuration
├── streaming.ts                # Vercel AI SDK streaming (JS advantage!)
│
├── types/
│   └── index.ts                # Zod + TypeScript type definitions
│
├── tools/
│   ├── searchTools.ts          # DuckDuckGo web search
│   ├── financeTools.ts         # yahoo-finance2 financial data
│   └── mcpTools.ts             # MCP: Notion, Gmail, Calendar (6 tools)
│
├── crews/
│   └── index.ts                # 4 crews: Research, Analysis, Risk, Delivery
│
├── graph/
│   ├── nodes.ts                # LangGraph node functions (9 nodes)
│   └── workflow.ts             # Graph construction + streaming runner
│
├── skills/
│   ├── reflexion.ts            # Self-improving feedback loops
│   ├── dynamicPlanner.ts       # Adaptive task planning
│   ├── processReward.ts        # Step-level evaluation (PRM)
│   └── costTracker.ts          # Token economics & budget
│
└── agents/
    └── reportWriter.ts         # LangChain.js report generation chain
```

## 🚀 Quick Start

```bash
# Install
npm install

# Demo (no API keys)
npx tsx src/main.ts --demo

# Full pipeline
export OPENAI_API_KEY=sk-...
npx tsx src/main.ts --company "NVIDIA" --mode full

# Quick mode (skips risk assessment)
npx tsx src/main.ts --company "Apple" --mode quick
```

## 🌟 12 Patterns Demonstrated

### Core Architecture
1. **Hierarchical Multi-Agent** — 4 crews, 10 specialized agents
2. **State Machine Orchestration** — LangGraph.js conditional edges
3. **Human-in-the-Loop** — LangGraph interrupt support
4. **Tool-Augmented Agents** — Zod-validated tool schemas

### Research-Inspired
5. **Reflexion** — Structured self-improvement (Shinn 2023)
6. **Process Reward Model** — Step-level evaluation (Lightman 2023)
7. **Dynamic Planning** — Runtime adaptive task planning
8. **Cost Tracking** — Per-agent budget enforcement

### MCP Integration
9. **MCP Protocol** — Standard agent-tool communication
10. **Knowledge Base Loop** — Notion for institutional memory
11. **Automated Distribution** — Gmail + Calendar automation
12. **Delivery Crew** — Last-mile business workflow

## 🔄 JS vs Python: Key Technical Differences

### 1. Crews (No CrewAI in JS)
Python uses CrewAI's `Agent()` + `Crew()` classes. In JS we implement
the same pattern with `ChatOpenAI.bindTools()` + sequential/parallel execution.
This is actually **more transparent** — no framework magic.

### 2. Parallel Execution
```typescript
// JS: Three analysts run SIMULTANEOUSLY
const [financial, market, tech] = await Promise.all([
  runFinancialAnalyst(company, context),
  runMarketAnalyst(company, context),
  runTechAnalyst(company, context),
]);
```
Python CrewAI runs sequentially by default. Async parallel requires extra work.

### 3. Streaming UI (JS Killer Feature)
```typescript
// Backend: 3 lines
const result = streamText({ model: openai("gpt-4o"), prompt: "..." });
return result.toDataStreamResponse();

// Frontend: 1 hook
const { messages } = useChat({ api: "/api/analyze" });
```

### 4. Type Safety
```typescript
// Zod validates tool inputs at RUNTIME
schema: z.object({
  ticker: z.string().describe("Stock ticker"),
  period: z.enum(["2y", "5y"]).default("2y"),
})
// TypeScript validates state at COMPILE TIME
const state: AgentState = { ... }; // ← catches typos instantly
```

## 💡 Interview Talking Points

### "Why TypeScript over Python for this?"
> "Three key advantages: (1) `Promise.all` gives us free parallelism for
> independent agent tasks — our 3 analysts run simultaneously. (2) Vercel AI SDK
> gives production streaming with almost zero code. (3) TypeScript + Zod catch
> state mismatches at compile time, which matters hugely when 10 agents are
> reading/writing shared state."

### "How do you handle the missing CrewAI?"
> "CrewAI is syntactic sugar for agent sequencing with shared context.
> In TypeScript I implemented the same pattern explicitly: each crew is a class
> with `run()` that calls agents in sequence, passing outputs forward. It's more
> code but more transparent — no framework magic to debug."

### "What would production deployment look like?"
> "Next.js on Vercel: the graph API route streams events via Vercel AI SDK,
> the React frontend uses `useChat` for real-time display. LangGraph state
> persists to a PostgreSQL checkpointer for crash recovery. LangSmith for
> observability. The MCP tools connect to real Notion/Gmail/Calendar servers."
