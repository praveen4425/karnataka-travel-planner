import { NextRequest, NextResponse } from 'next/server'
import destinations from '@/data/destinations.json'
import { buildCards } from '@/lib/clusters'

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 })
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Request body must be a valid JSON object.' }, { status: 400 })
    }

    const { interests, days, experience } = body as Record<string, unknown>

    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 7) {
      return NextResponse.json(
        { error: 'Invalid days: Must be an integer between 1 and 7.' },
        { status: 400 }
      )
    }

    if (!Array.isArray(interests)) {
      return NextResponse.json(
        { error: 'Invalid interests: Must be an array.' },
        { status: 400 }
      )
    }

    const expStr = typeof experience === 'string' ? experience : ''

    const result = buildCards(destinations, {
      interests: interests as string[],
      days,
      experience: expStr,
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err || 'Unknown error')
    console.error(`[Destinations API Error] Failed to generate destination options: ${errorMsg}`)
    return NextResponse.json(
      { error: 'Failed to generate destination options. Please try again later.' },
      { status: 500 }
    )
  }
}
