#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import express, { Request, Response } from "express";
import cors from "cors";

import { MCPServer } from "./server.js";

interface CellAddress {
  row: number;
  col: number;
}

class ExcelCSVServer {
  private server: MCPServer;
  private app: express.Application;

  constructor() {
    this.server = new MCPServer(
      new Server(
        {
          name: "excel-csv-mcp",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      )
    );

    // Initialize Express app
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.setupHTTPRoutes();
  }

  private setupHTTPRoutes() {
    // Health check endpoint
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({
        status: "ok",
        service: "excel-csv-mcp",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
      });
    });

    // Main MCP endpoint - handles JSON-RPC requests
    this.app.post("/mcp", async (req: Request, res: Response) => {
      try {
        console.log("Received MCP request:", JSON.stringify(req.body, null, 2));

        // Handle the JSON-RPC request directly
        const response = await this.server.handlePostRequest(req, res);

        console.log("MCP response:", JSON.stringify(response, null, 2));

        // Check if we need streaming (for large responses)
        // const needsStreaming = this.shouldUseStreaming(response);

        // if (needsStreaming) {
        //   // Send as Server-Sent Events for large responses
        //   res.setHeader("Content-Type", "text/event-stream");
        //   res.setHeader("Cache-Control", "no-cache");
        //   res.setHeader("Connection", "keep-alive");
        //   res.setHeader("Access-Control-Allow-Origin", "*");

        //   res.write(`data: ${JSON.stringify(response)}\n\n`);
        //   res.end();
        // } else {
        //   // Send as regular JSON response
        //   res.json(response);
        // }
      } catch (error) {
        console.error("MCP request error:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unexpected error occurred";
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: errorMessage,
          },
          id: req.body?.id || null,
        });
      }
    });

    this.app.get("/mcp", async (req: Request, res: Response) => {
      await this.server.handleGetRequest(req, res);
    });
  }

  private shouldUseStreaming(response: any): boolean {
    // Use streaming for large responses (>10KB)
    const responseSize = JSON.stringify(response).length;
    return responseSize > 10240; // 10KB threshold
  }

  async run() {
    const port = 5050;

    this.app.listen(port, () => {
      console.error(`Excel/CSV MCP server running on port ${port}`);
      console.error(`Health check: http://localhost:${port}/health`);
      console.error(`MCP endpoint: http://localhost:${port}/mcp`);
    });
  }
}

const server = new ExcelCSVServer();
server.run().catch(console.error);
