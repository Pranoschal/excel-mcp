import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  JSONRPCError,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "crypto";
import { Request, Response } from "express";

import { NLPProcessor } from './ai/nlp-processor.js';
import { FormulaEvaluator } from './formula/evaluator.js';
import {
  createDefaultToolRegistry,
  dispatchTool,
  type ToolRegistry,
} from './tools/registry.js';
import type { ToolContext } from './tools/types.js';

export class MCPServer {
  server: Server;
  nlpProcessor: NLPProcessor;
  formulaEvaluator: FormulaEvaluator;
  private registry: ToolRegistry;
  private toolContext: ToolContext;

  // to support multiple simultaneous connections
  transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  constructor(server: Server) {
    this.server = server;
    this.nlpProcessor = new NLPProcessor();
    this.formulaEvaluator = new FormulaEvaluator();
    this.registry = createDefaultToolRegistry();
    this.toolContext = {
      nlpProcessor: this.nlpProcessor,
      formulaEvaluator: this.formulaEvaluator,
    };
    this.setupHandlers();
  }

  async handleGetRequest(req: Request, res: Response) {
    console.log("get request received");
    // if server does not offer an SSE stream at this endpoint.
    res.status(405).set('Allow', 'POST').send('Method Not Allowed');
    return;
  }

  async handlePostRequest(req: Request, res: Response) {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log("post request received");
    console.log("body: ", req.body);

    let transport: StreamableHTTPServerTransport;

    try {
      // reuse existing transport
      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // create new transport
      if (!sessionId && this.isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          // for stateless mode:
          // sessionIdGenerator: () => undefined
        });

        await this.server.connect(transport);
        await transport.handleRequest(req, res, req.body);

        // session ID will only be available (if in not Stateless-Mode)
        // after handling the first request
        const newSessionId = transport.sessionId;
        if (newSessionId) {
          this.transports[newSessionId] = transport;
        }

        await this.sendMessages(transport);
        return;
      }

      res.status(400).json(this.createErrorResponse("Bad Request: invalid session ID or method."));
      return;
    } catch (error) {
      console.error('Error handling MCP request:', error);
      res.status(500).json(this.createErrorResponse("Internal server error."));
      return;
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.registry.definitions,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return dispatchTool(this.registry, name, args, this.toolContext);
    });
  }

  // send message streaming message every second
  // cannot use server.sendLoggingMessage because we have can have multiple transports
  private async sendMessages(_transport: StreamableHTTPServerTransport) {
    //... same as above
  }

  private createErrorResponse(message: string): JSONRPCError {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: message,
      },
      id: randomUUID(),
    };
  }

  private isInitializeRequest(body: any): boolean {
    const isInitial = (data: any) => {
      const result = InitializeRequestSchema.safeParse(data);
      return result.success;
    };
    if (Array.isArray(body)) {
      return body.some((request) => isInitial(request));
    }
    return isInitial(body);
  }
}
