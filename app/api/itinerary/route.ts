import { GoogleGenAI, Type } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import destinations from '@/data/destinations.json'
import type { Itinerary } from '@/lib/generateItinerary'

export const maxDuration = 30

const CLUSTERS = [
  ['mysuru'],
  ['bengaluru'],
  ['hampi'],
  ['coorg'],
  ['gokarna'],
  ['badami', 'pattadakal', 'aihole'],
  ['belur-halebidu', 'shravanabelagola', 'chikkamagaluru'],
  ['jog-falls'],
]

function sanitizeMessage(msg: string, apiKey?: string): string {
  let cleaned = msg
  if (apiKey) {
    cleaned = cleaned.replaceAll(apiKey, '[REDACTED]')
  }
  cleaned = cleaned.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED]')
  cleaned = cleaned.replace(/key=[a-zA-Z0-9_\-]+/gi, 'key=[REDACTED]')
  return cleaned
}

function cleanTransportText(text: string): string {
  if (!text) return text
  return text
    // Specific airlines
    .replace(/\b(?:IndiGo|Air\s*India|SpiceJet|Akasa(?:\s+Air)?|Vistara|AIX(?:\s+Connect)?|GoAir|Go\s*First)\b/gi, 'flight')
    // Specific bus operators
    .replace(/\b(?:KSRTC|NWKRTC|KKRTC|NEKRTC|SRS(?:\s+Travels)?|VRL(?:\s+Travels)?|Sugama(?:\s+Tourist)?|Kallada(?:\s+Travels)?|Orange(?:\s+Travels)?|Jabbar(?:\s+Travels)?|Greenline(?:\s+Travels)?|Seabird(?:\s+Tourist)?)\b/gi, 'bus')
    // Specific named trains
    .replace(/\b(?:Vande\s+Bharat(?:\s+Express)?|Shatabdi(?:\s+Express)?|Jan\s+Shatabdi(?:\s+Express)?|Rajdhani(?:\s+Express)?|Garib\s+Rath|Duronto(?:\s+Express)?|Intercity\s+Express|Udyan\s+Express|Gol\s+Gumbaz\s+Express|Rani\s+Chennamma\s+Express|Hampi\s+Express|Tippu\s+Express|Chamundi\s+Express)\b/gi, 'train')
    // Train numbers
    .replace(/\b(?:train\s*(?:no\.?|number)?\s*#?\d{4,5})\b/gi, 'train')
    // Flight numbers
    .replace(/\b(?:flight\s*(?:no\.?|number)?\s*#?[A-Z0-9]{2}\s*\d{3,4})\b/gi, 'flight')
}

function cleanPercentages(text: string): string {
  if (!text) return text
  return text
    .replace(/\b\d+(\.\d+)?%\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanEateryText(text: string): string {
  if (!text) return text
  return text
    .replace(/\b(?:Hotel\s+)?Mylari(?:\s+(?:Hotel|Restaurant|Mess))?\s*/gi, '')
    .replace(/\b(?:Vidyarthi\s+Bhavan|CTR|MTR|Janatha\s+Hotel|Brahmins(?:\s+Coffee\s+Bar)?|Veena\s+Stores)\s*/gi, '')
    .replace(/\bat\s+[A-Za-z0-9'\s]+?(?:Restaurant|Hotel|Cafe|Mess|Bhavan|Darshini|Eatery|Outlet)\b/gi, '')
    .replace(/\b(?:Restaurant|Mess|Darshini|Eatery)\b/gi, '')
    .trim()
}

function normalizeModelName(raw: string): string {
  let cleaned = raw.trim()
  if (cleaned.startsWith('models/')) {
    cleaned = cleaned.replace(/^models\//, '')
  }
  return cleaned.toLowerCase().replace(/\s+/g, '-')
}

function isRetryableError(error: unknown, statusCode?: number): boolean {
  if (statusCode === 503 || statusCode === 429) return true

  if (!error) return false
  const err = error as Record<string, unknown>
  const status = err.status || err.statusCode
  if (status === 503 || status === 429) return true

  const name = typeof err.name === 'string' ? err.name : ''
  if (name === 'AbortError' || name === 'TimeoutError') return true

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (
    message.includes('503') ||
    message.includes('429') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted') ||
    message.includes('deadline exceeded') ||
    message.includes('resource_exhausted') ||
    message.includes('unavailable')
  ) {
    return true
  }

  return false
}

interface AttemptResult {
  success: boolean
  data?: Itinerary
  error?: unknown
  statusCode?: number
  rawText?: string
}

async function callGemini(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string,
  timeoutMs: number,
  travellers: number,
  expectedDays: number,
  budget: number
): Promise<AttemptResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`Gemini call timed out after ${Math.round(timeoutMs / 1000)} seconds`))
  }, timeoutMs)

  let rawText: string | undefined

  try {
    const config: any = {
      abortSignal: controller.signal,
      httpOptions: { timeout: Math.max(10000, timeoutMs) },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          destination: { type: Type.STRING },
          summary: { type: Type.STRING },
          whyThisPlan: { type: Type.STRING },
          travelPlan: {
            type: Type.OBJECT,
            properties: {
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    mode: { type: Type.STRING },
                    durationHours: { type: Type.NUMBER },
                    costPerPersonOneWay: { type: Type.NUMBER },
                    note: { type: Type.STRING },
                  },
                  required: ['mode', 'durationHours', 'costPerPersonOneWay', 'note'],
                },
              },
              recommended: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['options', 'recommended', 'reason'],
          },
          journey: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.STRING },
                when: { type: Type.STRING },
              },
              required: ['step', 'when'],
            },
          },
          stay: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              area: { type: Type.STRING },
              costPerRoomPerNight: { type: Type.NUMBER },
            },
            required: ['type', 'area', 'costPerRoomPerNight'],
          },
          localTransport: {
            type: Type.OBJECT,
            properties: {
              mode: { type: Type.STRING },
              costPerDay: { type: Type.NUMBER },
              tip: { type: Type.STRING },
            },
            required: ['mode', 'costPerDay', 'tip'],
          },
          foodPlan: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                breakfast: { type: Type.STRING },
                lunch: { type: Type.STRING },
                dinner: { type: Type.STRING },
                estimatedCostPerPerson: { type: Type.NUMBER },
              },
              required: ['day', 'breakfast', 'lunch', 'dinner', 'estimatedCostPerPerson'],
            },
          },
          days: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.INTEGER },
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                stops: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      place: { type: Type.STRING },
                      time: { type: Type.STRING },
                      cost: { type: Type.NUMBER },
                      description: { type: Type.STRING },
                    },
                    required: ['place', 'time', 'cost', 'description'],
                  },
                },
                foodTip: { type: Type.STRING },
                phrase: {
                  type: Type.OBJECT,
                  properties: {
                    kannada: { type: Type.STRING },
                    transliteration: { type: Type.STRING },
                    meaning: { type: Type.STRING },
                  },
                  required: ['kannada', 'transliteration', 'meaning'],
                },
              },
              required: ['day', 'title', 'subtitle', 'stops', 'foodTip', 'phrase'],
            },
          },
        },
        required: [
          'destination',
          'summary',
          'whyThisPlan',
          'travelPlan',
          'journey',
          'stay',
          'localTransport',
          'foodPlan',
          'days',
        ],
      },
    }

    // Disable thinking for models that support it so generation finishes in 4-6s instead of minutes
    if (
      modelName.includes('2.5') ||
      modelName.includes('3.5-flash') ||
      modelName.includes('3.8-flash') ||
      modelName.includes('3-flash')
    ) {
      config.thinkingConfig = { thinkingBudget: 0 }
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config,
    })

    clearTimeout(timer)
    rawText = response.text?.trim()

    if (!rawText) {
      throw new Error('Gemini returned an empty response')
    }

    let cleanedText = rawText
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim()
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/```\s*$/, '').trim()
    }

    const parsed = JSON.parse(cleanedText) as Itinerary

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Validation failed: parsed response is not an object')
    }
    if (typeof parsed.destination !== 'string' || !parsed.destination.trim()) {
      throw new Error('Validation failed: missing or invalid destination field')
    }
    if (typeof parsed.summary !== 'string') {
      throw new Error('Validation failed: missing or invalid summary field')
    }
    if (typeof parsed.whyThisPlan !== 'string' || !parsed.whyThisPlan.trim()) {
      throw new Error('Validation failed: missing or invalid whyThisPlan field')
    }

    // Validate days array
    if (!Array.isArray(parsed.days) || parsed.days.length !== expectedDays) {
      throw new Error(`Validation failed: days array must have exactly ${expectedDays} item(s)`)
    }

    let calculatedStopsTotal = 0
    for (let i = 0; i < parsed.days.length; i++) {
      const d = parsed.days[i]
      if (!d || typeof d !== 'object') {
        throw new Error(`Validation failed: invalid day entry at index ${i}`)
      }
      d.day = typeof d.day === 'number' ? d.day : i + 1
      d.title = typeof d.title === 'string' ? d.title : `Day ${d.day}`
      d.subtitle = typeof d.subtitle === 'string' ? d.subtitle : ''
      d.foodTip = typeof d.foodTip === 'string' ? d.foodTip : ''
      if (!d.phrase || typeof d.phrase !== 'object') {
        throw new Error(`Validation failed: invalid phrase object for day ${d.day}`)
      }
      d.phrase = {
        kannada: typeof d.phrase.kannada === 'string' ? d.phrase.kannada : '',
        transliteration: typeof d.phrase.transliteration === 'string' ? d.phrase.transliteration : '',
        meaning: typeof d.phrase.meaning === 'string' ? d.phrase.meaning : '',
      }
      if (!Array.isArray(d.stops) || d.stops.length < 1) {
        throw new Error(`Validation failed: day ${d.day} must have at least 1 stop`)
      }
      for (const s of d.stops) {
        if (!s || typeof s !== 'object') {
          throw new Error(`Validation failed: invalid stop entry in day ${d.day}`)
        }
        s.place = typeof s.place === 'string' ? s.place : 'Attraction'
        s.time = typeof s.time === 'string' ? s.time : 'Flexible'
        if (typeof s.cost !== 'number' || isNaN(s.cost) || s.cost < 0) {
          throw new Error(`Validation failed: stop cost in day ${d.day} must be a finite number >= 0`)
        }
        s.description = cleanTransportText(typeof s.description === 'string' ? s.description : '')
        calculatedStopsTotal += s.cost
      }
    }

    // Validate travelPlan
    if (!parsed.travelPlan || typeof parsed.travelPlan !== 'object') {
      throw new Error('Validation failed: missing travelPlan object')
    }
    if (!Array.isArray(parsed.travelPlan.options) || parsed.travelPlan.options.length < 2) {
      throw new Error('Validation failed: travelPlan.options must have at least 2 items')
    }
    for (const opt of parsed.travelPlan.options) {
      if (!opt || typeof opt !== 'object') {
        throw new Error('Validation failed: invalid travel option')
      }
      if (typeof opt.durationHours !== 'number' || isNaN(opt.durationHours) || opt.durationHours < 0) {
        throw new Error('Validation failed: travel durationHours must be a finite number >= 0')
      }
      if (typeof opt.costPerPersonOneWay !== 'number' || isNaN(opt.costPerPersonOneWay) || opt.costPerPersonOneWay < 0) {
        throw new Error('Validation failed: travel costPerPersonOneWay must be a finite number >= 0')
      }
      opt.mode = typeof opt.mode === 'string' ? opt.mode.toLowerCase().trim() : 'bus'
      opt.note = cleanTransportText(typeof opt.note === 'string' ? opt.note : '')
    }
    parsed.travelPlan.recommended = typeof parsed.travelPlan.recommended === 'string'
      ? parsed.travelPlan.recommended.toLowerCase().trim()
      : parsed.travelPlan.options[0].mode
    parsed.travelPlan.reason = cleanPercentages(
      cleanTransportText(typeof parsed.travelPlan.reason === 'string' ? parsed.travelPlan.reason : '')
    )

    // Validate journey
    if (!Array.isArray(parsed.journey) || parsed.journey.length === 0) {
      throw new Error('Validation failed: journey must be a non-empty array')
    }
    for (const j of parsed.journey) {
      if (!j || typeof j !== 'object' || typeof j.step !== 'string' || typeof j.when !== 'string') {
        throw new Error('Validation failed: invalid journey step entry')
      }
      j.step = cleanTransportText(j.step)
    }

    // Validate stay
    if (!parsed.stay || typeof parsed.stay !== 'object') {
      throw new Error('Validation failed: missing stay object')
    }
    if (typeof parsed.stay.costPerRoomPerNight !== 'number' || isNaN(parsed.stay.costPerRoomPerNight) || parsed.stay.costPerRoomPerNight < 0) {
      throw new Error('Validation failed: stay.costPerRoomPerNight must be a finite number >= 0')
    }
    parsed.stay.type = typeof parsed.stay.type === 'string' ? parsed.stay.type : 'Hotel'
    parsed.stay.area = typeof parsed.stay.area === 'string' ? parsed.stay.area : ''

    // Validate localTransport
    if (!parsed.localTransport || typeof parsed.localTransport !== 'object') {
      throw new Error('Validation failed: missing localTransport object')
    }
    if (typeof parsed.localTransport.costPerDay !== 'number' || isNaN(parsed.localTransport.costPerDay) || parsed.localTransport.costPerDay < 0) {
      throw new Error('Validation failed: localTransport.costPerDay must be a finite number >= 0')
    }
    parsed.localTransport.mode = typeof parsed.localTransport.mode === 'string' ? parsed.localTransport.mode : 'Auto-rickshaw / Taxi'
    parsed.localTransport.tip = cleanTransportText(
      typeof parsed.localTransport.tip === 'string' ? parsed.localTransport.tip : ''
    )

    // Validate foodPlan
    if (!Array.isArray(parsed.foodPlan) || parsed.foodPlan.length !== expectedDays) {
      throw new Error(`Validation failed: foodPlan must have exactly ${expectedDays} items`)
    }
    let sumFoodPerPerson = 0
    for (let i = 0; i < parsed.foodPlan.length; i++) {
      const fp = parsed.foodPlan[i]
      if (!fp || typeof fp !== 'object') {
        throw new Error(`Validation failed: invalid foodPlan entry at index ${i}`)
      }
      fp.day = typeof fp.day === 'number' ? fp.day : i + 1
      fp.breakfast = cleanEateryText(typeof fp.breakfast === 'string' ? fp.breakfast : '')
      fp.lunch = cleanEateryText(typeof fp.lunch === 'string' ? fp.lunch : '')
      fp.dinner = cleanEateryText(typeof fp.dinner === 'string' ? fp.dinner : '')
      if (typeof fp.estimatedCostPerPerson !== 'number' || isNaN(fp.estimatedCostPerPerson) || fp.estimatedCostPerPerson < 0) {
        throw new Error(`Validation failed: foodPlan estimatedCostPerPerson in day ${fp.day} must be a finite number >= 0`)
      }
      sumFoodPerPerson += fp.estimatedCostPerPerson
    }

    // Server-side Financial Calculations (nights = max(days - 1, 1))
    const numTravellers = travellers > 0 ? travellers : 1
    const rooms = Math.ceil(numTravellers / 2)
    const nights = Math.max(expectedDays - 1, 1)

    parsed.stay.rooms = rooms
    parsed.stay.nights = nights

    const recommendedOption =
      parsed.travelPlan.options.find((o) => o.mode === parsed.travelPlan?.recommended) ||
      parsed.travelPlan.options[0]

    const entryCost = calculatedStopsTotal
    const foodCost = Math.round(sumFoodPerPerson * numTravellers)
    const stayCost = Math.round(parsed.stay.costPerRoomPerNight * rooms * nights)
    const localTransportCost = Math.round(parsed.localTransport.costPerDay * expectedDays)
    const intercityCost = Math.round(recommendedOption.costPerPersonOneWay * numTravellers * 2)

    const total = entryCost + foodCost + stayCost + localTransportCost + intercityCost
    const perPerson = Math.round(total / numTravellers)

    parsed.costBreakdown = {
      entry: entryCost,
      food: foodCost,
      stay: stayCost,
      localTransport: localTransportCost,
      intercity: intercityCost,
      total,
      perPerson,
    }
    parsed.totalCost = total

    if (total > budget) {
      parsed.overBudget = true
      parsed.budgetShortfall = total - budget
    } else {
      parsed.overBudget = false
      delete parsed.budgetShortfall
    }

    delete parsed.budgetWarning

    return { success: true, data: parsed, rawText }
  } catch (err: any) {
    clearTimeout(timer)
    let statusCode: number = 503
    if (err?.status && typeof err.status === 'number') {
      statusCode = err.status
    } else if (err?.statusCode && typeof err.statusCode === 'number') {
      statusCode = err.statusCode
    } else if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      statusCode = 504
    }
    return {
      success: false,
      error: err,
      statusCode,
      rawText,
    }
  }
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error(`[Itinerary API Error] Status: 400 | Error: Failed to parse request JSON - ${errorMsg}`)
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    console.error('[Itinerary API Error] Status: 400 | Error: Request body must be a valid JSON object.')
    return NextResponse.json({ error: 'Request body must be a valid JSON object.' }, { status: 400 })
  }

  const {
    interests,
    days,
    budget,
    experience,
    language,
    startingCity,
    travellers,
    groupType,
  } = body as Record<string, unknown>

  if (typeof startingCity !== 'string' || !startingCity.trim()) {
    console.error('[Itinerary API Error] Status: 400 | Error: Invalid startingCity: Must be a non-empty string.')
    return NextResponse.json(
      { error: 'Invalid startingCity: Must be a non-empty string.' },
      { status: 400 }
    )
  }

  if (typeof travellers !== 'number' || !Number.isInteger(travellers) || travellers < 1 || travellers > 10) {
    console.error(`[Itinerary API Error] Status: 400 | Error: Invalid travellers value (${String(travellers)}). Must be an integer between 1 and 10.`)
    return NextResponse.json(
      { error: 'Invalid travellers: Must be an integer between 1 and 10.' },
      { status: 400 }
    )
  }

  if (groupType !== 'solo' && groupType !== 'couple' && groupType !== 'family' && groupType !== 'friends') {
    console.error(`[Itinerary API Error] Status: 400 | Error: Invalid groupType value (${String(groupType)}). Must be one of "solo", "couple", "family", or "friends".`)
    return NextResponse.json(
      { error: 'Invalid groupType: Must be one of "solo", "couple", "family", or "friends".' },
      { status: 400 }
    )
  }

  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 7) {
    console.error(`[Itinerary API Error] Status: 400 | Error: Invalid days value (${String(days)}). Must be an integer between 1 and 7.`)
    return NextResponse.json(
      { error: 'Invalid days: Must be an integer between 1 and 7.' },
      { status: 400 }
    )
  }

  if (typeof budget !== 'number' || isNaN(budget) || budget <= 0) {
    console.error(`[Itinerary API Error] Status: 400 | Error: Invalid budget value (${String(budget)}). Must be a number greater than 0.`)
    return NextResponse.json(
      { error: 'Invalid budget: Must be a number greater than 0.' },
      { status: 400 }
    )
  }

  if (language !== 'en' && language !== 'kn' && language !== 'hi') {
    console.error(`[Itinerary API Error] Status: 400 | Error: Invalid language value (${String(language)}). Must be one of "en", "kn", or "hi".`)
    return NextResponse.json(
      { error: 'Invalid language: Must be one of "en", "kn", or "hi".' },
      { status: 400 }
    )
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('[Itinerary API Error] Status: 503 | Error: GEMINI_API_KEY is not configured in process.env.')
    return NextResponse.json(
      { error: 'Gemini API key is not configured.' },
      { status: 503 }
    )
  }

  const rawPrimaryModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
  const primaryModel = normalizeModelName(rawPrimaryModel)
  const rawFallback = process.env.GEMINI_FALLBACK_MODEL?.trim() || 'gemini-3-flash-preview'
  let fallbackModel: string | undefined = rawFallback ? normalizeModelName(rawFallback) : undefined
  if (fallbackModel === primaryModel) {
    fallbackModel = primaryModel === 'gemini-3.5-flash' ? 'gemini-3-flash-preview' : 'gemini-3.5-flash'
  }
  const languageName = language === 'kn' ? 'Kannada (ಕನ್ನಡ)' : language === 'hi' ? 'Hindi (हिन्दी)' : 'English'

  const prompt = `You are an expert travel planner for Karnataka, India.
Create a thoughtful day-wise full-trip itinerary covering round-trip travel from home city, stay, local transport, food, and sightseeing:
- Starting City: ${startingCity.trim()}
- Number of Travellers: ${travellers}
- Group Type: ${groupType} (Style requirement: ${
    groupType === 'family'
      ? 'family = relaxed pace, comfortable stays, family-friendly destinations, absolutely no strenuous treks or dangerous climbs'
      : groupType === 'friends'
      ? 'friends = energetic pace, more adventure, fun activities, vibrant local nightlife/markets'
      : groupType === 'couple'
      ? 'couple = scenic, romantic viewpoints, relaxed pace, atmospheric dining'
      : 'solo = budget-friendly, safe, accessible by public/shared transit, solo-friendly destinations'
  })
- Selected Interests: ${Array.isArray(interests) && interests.length > 0 ? interests.join(', ') : 'Heritage, Food'}
- Number of Days at destination: ${days} (The "days" array MUST have exactly ${days} day item(s), numbered 1 to ${days})
- Group Budget: ₹${budget} INR (TOTAL budget for the whole group of ${travellers} person(s) for the entire trip)
- Experience Style: ${typeof experience === 'string' ? experience : 'Cultural'}
- Requested Output Language: ${languageName} (${language})

GEOGRAPHIC CLUSTERS (Choose exactly ONE cluster):
${JSON.stringify(CLUSTERS)}

DESTINATION DATABASE (Only use destinations and attractions from this list):
${JSON.stringify(destinations, null, 2)}

STRICT RULES:
1. CLUSTER SELECTION: Choose exactly ONE cluster from CLUSTERS that best matches the starting city "${startingCity.trim()}", interests, experience style, group type, and destination bestTime. Use ONLY destinations in that chosen cluster for the entire trip. NEVER mix destinations across different clusters. (Ignore any cluster id that does not exist in the destination database).

2. NO PERCENTAGES OR INVENTED METRICS:
   - In "travelPlan.reason" and everywhere else across the entire response, do NOT state percentages (never write "%") or any number that is not provided in the input or computed directly from the data.
   - You may state that the travel time is long, but do NOT calculate shares of the trip (e.g. do NOT say "takes 40% of the trip", "half of the time", etc.).

3. TRANSPORT & OPERATOR NAMING RULES (CRITICAL):
   - NEVER name specific trains, train numbers, flight numbers, airlines, or bus operators (e.g. do NOT mention IndiGo, Air India, KSRTC, Shatabdi, Vande Bharat, train 12658, etc.).
   - Say ONLY generic descriptions like "train via <city>", "bus", "flight via <city>", "direct cab / self-drive via <route>". Hub city names (e.g. Bengaluru, Hubballi, Mangaluru) are allowed.

4. TRAVEL PLAN & REASON:
   - Provide 2 to 3 real transport options between "${startingCity.trim()}" and the destination cluster.
   - Each option has:
     * "mode": "train" | "bus" | "flight" | "car"
     * "durationHours": realistic one-way travel duration in hours (number)
     * "costPerPersonOneWay": realistic one-way cost per person in INR (number)
     * "note": generic route/frequency note (e.g. "overnight sleeper bus", "train via Bengaluru", "flight via Hubballi") - NEVER mention specific carrier or train/flight names.
   - Set "recommended" to one of ("train" | "bus" | "flight" | "car") and provide "reason" explaining why it is best for this group.
   - If round-trip travel takes a substantial amount of time relative to a ${days}-day visit, you may note that the travel time is long, but remember: do NOT calculate shares or state percentages.

5. JOURNEY TIMELINE (CRITICAL):
   - The "journey" array must contain ONLY travel, check-in, check-out and arrival steps.
   - Do NOT name specific attractions, temples, monuments, or viewpoints in the journey steps.
   - For the days in between arrival and departure, use exactly ONE generic step: "Sightseeing as per the day plan" (or translated into ${languageName}).
   - The journey must follow this exact structure:
     * Departure step: "Depart from ${startingCity.trim()}" with departure day and exact 24-hour clock time (e.g. "Day 0 18:00" if duration >= 14h, or "Day 1 06:00" if shorter).
     * Arrival & check-in step: "Arrive and check in" with the arrival day and exact clock time computed by adding durationHours to departure time (e.g. depart Day 0 18:00 + 24 h = arrive "Day 1 18:00"; depart Day 1 06:00 + 3 h = arrive "Day 1 09:00"). Never use vague terms like "Day 1 morning". Format: "Day X HH:MM".
     * In-between step: Exactly one generic step titled "Sightseeing as per the day plan" (when: "Day 1 - Day ${days}").
     * Check-out & departure step: "Check out and depart for home" (with exact return departure time on Day ${days}, e.g. "Day ${days} 17:00").
     * Final step: "Reach home" with arrival day and exact clock time, computed the same way from return departure time + durationHours (e.g. depart Day ${days} 17:00 + 5h = arrive "Day ${days} 22:00" "Reach home").
   - Sightseeing on Day 1 in the "days" array may start ONLY AFTER arrival and check-in (e.g. if arrival is Day 1 18:00, Day 1 stops must be evening activities after 18:00).

6. SIGHTSEEING ITINERARY:
   - Exactly ${days} day entries in "days", numbered 1 to ${days}.
   - Each day must have 2 to 4 stops.
   - Prefer attractions from the database. Database entry fees are PER PERSON; multiply by ${travellers} for the group cost. If fee is null, estimate it and mark it as estimated in the description (e.g. "(estimated fee)").
   - If the cluster has too few attractions, you may add at most 2 extra well-known REAL attractions per day in the same town, marked as estimated, never with invented exact fees. Never invent restaurants or hotels. Otherwise add meal or free-time stops with cost 0.
   - Style by groupType: family = relaxed, no strenuous treks; friends = more adventure; couple = scenic and relaxed; solo = budget-friendly and safe.

7. STAY, LOCAL TRANSPORT, AND FOOD PLAN:
   - "stay": { "type": Accommodation type, "area": Real neighbourhood in destination, "costPerRoomPerNight": Realistic average cost per room per night in INR for ${Math.max(days - 1, 1)} night(s) }.
   - "localTransport": { "mode": Mode name, "costPerDay": Realistic cost per day for the entire group in INR, "tip": Transit tip }.
   - "foodPlan": Array of exactly ${days} items (one for each day 1 to ${days}):
     * "day": number (1 to ${days})
     * "breakfast", "lunch", "dinner": Use dish names ONLY (for example "Masala dosa", "Mysuru Pak", "Filter coffee", "Bisi bele bath", "Akki rotti", "Jolada rotti meals"). Do NOT use names of restaurants, cafes, hotels, or branded eateries (for example Mylari, CTR, MTR, Vidyarthi Bhavan, etc.).
     * "estimatedCostPerPerson": Realistic estimated food cost per person for all 3 meals for that day in INR.

8. CULTURAL ELEMENTS FOR EACH DAY:
   - Exactly one local food tip ("foodTip") from the destination's food field.
   - Exactly one Kannada phrase ("phrase") from the destination's kannadaPhrase field:
     * "kannada": Kannada script from "kn"
     * "transliteration": from "translit"
     * "meaning": meaning translated into ${languageName}

9. LANGUAGE REQUIREMENT: Write ALL descriptive text (destination, summary, whyThisPlan, travelPlan.reason, travelPlan.options[].note, journey[].step, journey[].when, stay.type, stay.area, localTransport.mode, localTransport.tip, foodPlan dishes, day titles, subtitles, stop descriptions, foodTip, phrase.meaning) in ${languageName}. Keep place/attraction names in English.
10. JSON ONLY: Output valid JSON adhering to the specified schema without markdown fences or extra commentary.`

  const ai = new GoogleGenAI({ apiKey })
  const startTime = Date.now()
  const maxTotalMs = 24000 // Keep total time strictly under 25 seconds

  const logFailure = (
    attempt: number,
    modelName: string,
    result: AttemptResult
  ) => {
    const rawErrorMsg = result.error instanceof Error ? result.error.message : String(result.error || 'Unknown error')
    const sanitizedErrorMsg = sanitizeMessage(rawErrorMsg, apiKey)
    const rawPreview = result.rawText ? sanitizeMessage(result.rawText.slice(0, 300), apiKey) : 'none'
    console.error(
      `[Itinerary API Error] Attempt ${attempt} (${modelName}) failed: Status: ${result.statusCode || 503} | Error: ${sanitizedErrorMsg} | Raw Gemini response (first 300 chars): ${rawPreview}`
    )
  }

  // 1. Initial attempt with primary model (12s timeout)
  const timeout1 = Math.min(12000, Math.max(1000, maxTotalMs - (Date.now() - startTime)))
  const result1 = await callGemini(ai, primaryModel, prompt, timeout1, travellers, days, budget)
  if (result1.success && result1.data) {
    return NextResponse.json(result1.data)
  }
  logFailure(1, primaryModel, result1)
  let lastResult: AttemptResult = result1

  // 2. Retry ONCE after 1 second if failed with 503, 429 or timeout
  if (isRetryableError(result1.error, result1.statusCode)) {
    const timeRemainingBeforeDelay = maxTotalMs - (Date.now() - startTime)
    if (timeRemainingBeforeDelay >= 2000) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const timeout2 = Math.min(12000, Math.max(1000, maxTotalMs - (Date.now() - startTime)))
      const result2 = await callGemini(ai, primaryModel, prompt, timeout2, travellers, days, budget)
      if (result2.success && result2.data) {
        return NextResponse.json(result2.data)
      }
      logFailure(2, primaryModel, result2)
      lastResult = result2
    }
  }

  // 3. Retry once with fallback model from process.env.GEMINI_FALLBACK_MODEL if provided
  if (fallbackModel) {
    const timeRemainingForFallback = maxTotalMs - (Date.now() - startTime)
    if (timeRemainingForFallback >= 1000) {
      const timeout3 = Math.min(12000, Math.max(1000, timeRemainingForFallback))
      const result3 = await callGemini(ai, fallbackModel, prompt, timeout3, travellers, days, budget)
      if (result3.success && result3.data) {
        return NextResponse.json(result3.data)
      }
      logFailure(3, fallbackModel, result3)
      lastResult = result3
    }
  }

  // 4. Everything failed: log final error and return 503
  const finalErrorMsg = lastResult.error instanceof Error ? lastResult.error.message : String(lastResult.error || 'All attempts failed')
  const sanitizedFinalMsg = sanitizeMessage(finalErrorMsg, apiKey)
  const finalPreview = lastResult.rawText ? sanitizeMessage(lastResult.rawText.slice(0, 300), apiKey) : 'none'

  console.error(
    `[Itinerary API Error] All attempts failed. Status: 503 | Error: ${sanitizedFinalMsg} | Raw Gemini response (first 300 chars): ${finalPreview}`
  )

  return NextResponse.json(
    { error: 'Failed to generate itinerary. Please try again later.' },
    { status: 503 }
  )
}
