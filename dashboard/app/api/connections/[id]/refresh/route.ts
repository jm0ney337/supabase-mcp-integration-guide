import { NextRequest, NextResponse } from "next/server"
import { refreshConnection } from "@/lib/backend"

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    // Return only the expiry — the access token stays server-side, the same
    // way the backend keeps it out of GET /api/connections/:id.
    const { expiresAt } = await refreshConnection(id)
    return NextResponse.json({ expiresAt })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
