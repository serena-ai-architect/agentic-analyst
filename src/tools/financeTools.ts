/**
 * Financial Data Tools
 * =====================
 * Real-time financial data via Yahoo Finance chart API (free, no auth needed).
 * Proxy-aware via undici.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ProxyAgent, fetch as undiciFetch } from "undici";

function getProxyDispatcher() {
  const proxy = process.env.https_proxy || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  return proxy ? new ProxyAgent(proxy) : undefined;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

function formatNumber(num: number | null | undefined): string {
  if (num == null) return "N/A";
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

/** Fetch real-time quote data from Yahoo Finance chart API (no auth required). */
async function yahooChartQuote(ticker: string) {
  const dispatcher = getProxyDispatcher();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`;
  const res = await undiciFetch(url, {
    dispatcher,
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Yahoo chart API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No chart data for ${ticker}`);
  return result.meta;
}

/** Fetch monthly historical prices from Yahoo Finance chart API. */
async function yahooChartHistory(ticker: string, range: string) {
  const dispatcher = getProxyDispatcher();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1mo&range=${range}`;
  const res = await undiciFetch(url, {
    dispatcher,
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Yahoo chart API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`No history data for ${ticker}`);
  return result;
}

export const getStockInfo = tool(
  async ({ ticker }): Promise<string> => {
    try {
      const meta = await yahooChartQuote(ticker);
      const price = meta.regularMarketPrice;
      const metrics: Record<string, string> = {
        Company: meta.longName ?? meta.shortName ?? ticker,
        "Current Price": `$${price}`,
        "52-Week High": `$${meta.fiftyTwoWeekHigh}`,
        "52-Week Low": `$${meta.fiftyTwoWeekLow}`,
        "Day High": `$${meta.regularMarketDayHigh}`,
        "Day Low": `$${meta.regularMarketDayLow}`,
        Volume: meta.regularMarketVolume?.toLocaleString() ?? "N/A",
        Currency: meta.currency,
        Exchange: meta.fullExchangeName,
        "Data Timestamp": new Date(meta.regularMarketTime * 1000).toISOString(),
      };
      return JSON.stringify(metrics, null, 2);
    } catch (error) {
      return `Error fetching stock data for ${ticker}: ${String(error)}`;
    }
  },
  {
    name: "get_stock_info",
    description:
      "Get real-time stock information including current price, 52-week range, " +
      "and trading volume. Data is live from Yahoo Finance.",
    schema: z.object({
      ticker: z
        .string()
        .describe("Stock ticker symbol (e.g., 'NVDA', 'AAPL')"),
    }),
  }
);

export const getFinancialHistory = tool(
  async ({ ticker, period }): Promise<string> => {
    try {
      const range = period === "5y" ? "5y" : "2y";
      const result = await yahooChartHistory(ticker, range);
      const timestamps: number[] = result.timestamp ?? [];
      const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
      const volumes: number[] = result.indicators?.quote?.[0]?.volume ?? [];

      const recent = timestamps.slice(-12).map((ts: number, i: number) => {
        const idx = timestamps.length - 12 + i;
        return {
          date: new Date(ts * 1000).toISOString().split("T")[0],
          close: closes[idx] != null ? `$${closes[idx].toFixed(2)}` : "N/A",
          volume: volumes[idx]?.toLocaleString() ?? "N/A",
        };
      });

      return JSON.stringify({
        ticker,
        range,
        monthlyHistory: recent,
      }, null, 2);
    } catch (error) {
      return `Error fetching history for ${ticker}: ${String(error)}`;
    }
  },
  {
    name: "get_financial_history",
    description: "Get historical monthly price data for a stock.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol"),
      period: z
        .enum(["2y", "5y"])
        .optional()
        .default("2y")
        .describe("Time period"),
    }),
  }
);

export function getFinanceTools() {
  return [getStockInfo, getFinancialHistory];
}
