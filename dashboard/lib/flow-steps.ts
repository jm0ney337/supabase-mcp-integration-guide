// The five phases of the connect flow, in the same order as the sequence
// diagram in supabase-mcp-connect-flow-scalar.html (section #sequence-overview).
export type FlowPhaseId =
  | "discovery"
  | "client-setup"
  | "authorization"
  | "token-exchange"
  | "mcp-access"

export const FLOW_PHASES: { id: FlowPhaseId; label: string; description: string }[] = [
  {
    description: "Fetch protected-resource, then authorization-server metadata",
    id: "discovery",
    label: "Discovery",
  },
  {
    description: "Generate PKCE + state, register the client via DCR",
    id: "client-setup",
    label: "Client setup",
  },
  {
    description: "Org owner approves on Supabase's consent screen",
    id: "authorization",
    label: "Authorization",
  },
  {
    description: "Trade the code + verifier for access and refresh tokens",
    id: "token-exchange",
    label: "Token exchange",
  },
  {
    description: "Call MCP tools with the bearer token",
    id: "mcp-access",
    label: "MCP access",
  },
]
