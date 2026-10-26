import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, gatewayEnabled } from "@/lib/gateway";
import { dbEnabled } from "@/lib/db";
import { beeperMcp } from "@/lib/mcp";

export const maxDuration = 300;

/** MCP over Streamable HTTP, stateless: a fresh server per request, authenticated by the Beeper API key. */
async function handle(req: Request) {
  if (!gatewayEnabled || !dbEnabled) return Response.json({ error: "Beeper MCP is not configured" }, { status: 503 });
  const key = req.headers.get("authorization") ? await authenticate(req) : null;
  if (req.headers.get("authorization") && !key) return Response.json({ error: "Invalid Beeper API key" }, { status: 401 });
  const server = beeperMcp(key ? { userId: key.user_id, keyId: key.id } : null);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export { handle as GET, handle as POST, handle as DELETE };
