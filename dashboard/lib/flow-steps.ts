// Mirrors the "Full sequence diagram" in supabase-mcp-connect-flow-scalar.html
// (section #sequence-overview) step for step, so this panel stays a faithful
// visual companion to the doc rather than a separate description of the flow.
export type FlowActor = "org-owner" | "your-app" | "auth-server" | "mcp-server"

export type FlowPhaseId =
  | "discovery"
  | "client-setup"
  | "authorization"
  | "token-exchange"
  | "mcp-access"

export type FlowStep = {
  id: string
  phase: FlowPhaseId
  actor: FlowActor
  title: string
  description: string
}

export const FLOW_ACTOR_LABELS: Record<FlowActor, string> = {
  "org-owner": "Org owner",
  "your-app": "Your app",
  "auth-server": "api.supabase.com",
  "mcp-server": "mcp.supabase.com",
}

export const FLOW_PHASES: { id: FlowPhaseId; label: string }[] = [
  { id: "discovery", label: "Discovery" },
  { id: "client-setup", label: "Client setup" },
  { id: "authorization", label: "Authorization" },
  { id: "token-exchange", label: "Token exchange" },
  { id: "mcp-access", label: "MCP access" },
]

export const FLOW_STEPS: FlowStep[] = [
  {
    id: "0a",
    phase: "discovery",
    actor: "your-app",
    title: "Discover resource metadata",
    description: "GET /.well-known/oauth-protected-resource on the MCP server.",
  },
  {
    id: "0b",
    phase: "discovery",
    actor: "your-app",
    title: "Resource metadata",
    description: "authorization_servers points at api.supabase.com.",
  },
  {
    id: "0c",
    phase: "discovery",
    actor: "your-app",
    title: "Discover auth metadata",
    description: "GET /.well-known/oauth-authorization-server on the auth server.",
  },
  {
    id: "0d",
    phase: "discovery",
    actor: "your-app",
    title: "Auth metadata",
    description: "Registration + token endpoints come back in the response.",
  },
  {
    id: "0e",
    phase: "client-setup",
    actor: "your-app",
    title: "Generate PKCE + state",
    description: "code_verifier, code_challenge (S256), and a CSRF state value.",
  },
  {
    id: "0f",
    phase: "client-setup",
    actor: "your-app",
    title: "Register client",
    description: "POST registration_endpoint — skipped once a client_id is cached.",
  },
  {
    id: "0g",
    phase: "client-setup",
    actor: "your-app",
    title: "Client credentials",
    description: "client_id + client_secret returned for this backend.",
  },
  {
    id: "1",
    phase: "authorization",
    actor: "org-owner",
    title: "Authorization request",
    description: "Open the browser at the authorizeUrl for the org owner to approve.",
  },
  {
    id: "2",
    phase: "authorization",
    actor: "org-owner",
    title: "Authorization grant",
    description: "Supabase redirects back to the callback with code + state.",
  },
  {
    id: "3",
    phase: "token-exchange",
    actor: "auth-server",
    title: "Exchange code for tokens",
    description: "POST /token with the code + code_verifier.",
  },
  {
    id: "4",
    phase: "token-exchange",
    actor: "auth-server",
    title: "Access token",
    description: "access_token + refresh_token are issued.",
  },
  {
    id: "5",
    phase: "mcp-access",
    actor: "mcp-server",
    title: "Call MCP tools",
    description: "Authorization: Bearer <access_token> on every MCP request.",
  },
  {
    id: "6",
    phase: "mcp-access",
    actor: "mcp-server",
    title: "Tool results",
    description: "MCP tool results stream back into the chat.",
  },
]
