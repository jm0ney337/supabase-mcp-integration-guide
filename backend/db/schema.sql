-- Already applied to the mcp-oauth-backend Supabase project (ref
-- bbdpvukyhgybtuxhzhnx) via the Supabase MCP tools. Kept here as the
-- source of truth / for reprovisioning elsewhere.

create table oauth_clients (
  redirect_uri text primary key,
  client_id text not null,
  client_secret text,
  created_at timestamptz not null default now()
);

create table mcp_connections (
  id uuid primary key default gen_random_uuid(),
  mcp_url text not null,
  redirect_uri text not null references oauth_clients(redirect_uri),
  state text not null,
  code_verifier text not null,
  status text not null default 'pending', -- pending|authorized|error|revoked
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mcp_connections_state_idx on mcp_connections (state);

-- Both tables hold OAuth client secrets and access/refresh tokens. RLS is
-- enabled with NO policies: only the service_role key (used exclusively by
-- this backend, never a client) can read or write them.
alter table oauth_clients enable row level security;
alter table mcp_connections enable row level security;
