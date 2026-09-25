import { NextRequest, NextResponse } from "next/server"
import { listConnections, startConnection } from "@/lib/backend"

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const mcpUrl = typeof body.mcpUrl === "string" && body.mcpUrl ? body.mcpUrl : "https://mcp.supabase.com/mcp"

  try {
    const data = await startConnection(mcpUrl)
    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}

export async function GET() {
  try {
    const data = await listConnections()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
