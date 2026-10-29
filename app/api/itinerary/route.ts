import { GoogleGenAI, Type } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'
import destinations from '@/data/destinations.json'
import phrases from '@/data/phrases.json'
import type { Itinerary } from '@/lib/generateItinerary'

export const maxDuration = 60

const CLUSTERS = [
  ['mysuru'],
  ['bengaluru'],
  ['hampi'],
  ['coorg'],
  ['gokarna'],
  ['badami', 'pattadakal', 'aihole'],
  ['belur-halebidu', 'shravanabelagola', 'chikkamagaluru'],
  ['jog-falls'],
  ['udupi'],
  ['murudeshwara'],
]

interface PhraseItem {
  id: string
  tag: string
  kn: string
  translit: string
  en: string
  hi: string
}

interface AttractionDef {
  name: string
  fee: number | null
  extraFee?: string | null
  timings?: string | null
  closedDay?: string | null
  ticketGroup?: string | null
  planAsStop?: boolean
  feeNote?: string | null
  source?: string
  verified?: boolean
}

const TICKET_GROUP_BY_ATTRACTION = new Map<string, string>()
for (const dest of destinations as Array<{ attractions?: AttractionDef[] }>) {
  for (const attr of dest.attractions || []) {
    if (attr.ticketGroup && typeof attr.ticketGroup === 'string') {
      TICKET_GROUP_BY_ATTRACTION.set(attr.name.trim().toLowerCase(), attr.ticketGroup.trim().toLowerCase())
    }
  }
}

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

function cleanBudgetText(text: string): string {
  if (!text) return text
  let cleaned = text
    // Remove whole sentences that discuss budget fit, staying within, or exceeding budget
    .replace(/(?:^|\.\s+|\n\s*)[A-Z\u0900-\u0D7F][^.!?\n]*\b(?:fits?|fitting|stays?|staying|exceeds?|exceeding|within|allocated)\b[^.!?\n]*\bbudget\b[^.!?\n]*([.!?]|\s*$)/gi, '$1')
    // Remove clauses mentioning budget fitting/staying within budget
    .replace(/(?:,\s*)?(?:and\s+)?(?:which\s+|as\s+it\s+)?(?:well\s+|comfortably\s+|easily\s+)?(?:fits|fitting|stays|staying|kept|keeping)\s+(?:well\s+)?(?:comfortably\s+)?(?:within|under)\s+(?:the|your|our|allocated)?\s*(?:total\s+)?budget(?:\s*(?:of|limit)?\s*₹?\s*[\d,]+(?:\s*INR)?)?(?:,\s*|\s+and\s+)?/gi, ' ')
    // Remove clauses mentioning budget exceeding
    .replace(/(?:,\s*)?(?:and\s+)?(?:which\s+|as\s+it\s+)?(?:exceeds?|exceeding|surpasses?|is\s+over)\s+(?:the|your|our|allocated)?\s*(?:total\s+)?budget(?:\s*(?:of|limit)?\s*₹?\s*[\d,]+(?:\s*INR)?)?(?:,\s*|\s+and\s+)?/gi, ' ')
    // Remove phrases mentioning budget amounts: "budget of ₹20,000", "₹20,000 budget"
    .replace(/\bbudget\s+of\s+₹?\s*[\d,]+(?:\s*INR)?/gi, '')
    .replace(/₹\s*[\d,]+(?:\s*INR)?\s+budget\b/gi, '')
    .replace(/\b[\d,]+\s*INR\s+budget\b/gi, '')
    // Remove standalone "within budget" / "over budget"
    .replace(/\b(?:within|over)\s+(?:the\s+)?budget\b/gi, '')
    // Clean up spacing and punctuation
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\(\s*\)/g, '')
    .trim()
  return cleaned
}

function normalizeCityName(city: string): string {
  return city
    .trim()
    .split(/\s+/)
    .map((w) =>
      w
        .split('-')
        .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-')
    )
    .join(' ')
}

function removeStartingCityAsViaPoint(text: string, startingCity: string): string {
  if (!text || !startingCity) return text
  const escaped = startingCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`\\bvia\\s+${escaped}\\b`, 'gi'), '')
    .replace(/\s{2,}/g, ' ')
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
  const status = Number(err.status || err.statusCode)
  if (status === 503 || status === 429) return true

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  if (
    /\b503\b/.test(message) ||
    /\b429\b/.test(message) ||
    message.includes('resource_exhausted') ||
    message.includes('unavailable') ||
    message.includes('high demand')
  ) {
    return true
  }

  return false
}

function attachPhrasesToDays(days: any[], language: string): void {
  const phraseById = new Map<string, PhraseItem>()
  for (const p of phrases as PhraseItem[]) {
    phraseById.set(p.id, p)
  }

  const usedIds = new Set<string>()

  for (let i = 0; i < days.length; i++) {
    const d = days[i]
    const rawId = typeof d.phraseId === 'string' ? d.phraseId.trim().toLowerCase() : ''

    // Determine preferred tag for fallback
    let preferredTag = ''
    if (rawId && phraseById.has(rawId)) {
      preferredTag = phraseById.get(rawId)!.tag
    } else {
      const text = `${d.title || ''} ${d.subtitle || ''} ${(d.stops || [])
        .map((s: any) => `${s.place || ''} ${s.description || ''}`)
        .join(' ')}`.toLowerCase()
      if (
        text.includes('market') ||
        text.includes('shop') ||
        text.includes('bazaar') ||
        text.includes('buy') ||
        text.includes('silk') ||
        text.includes('sandalwood') ||
        text.includes('souvenir')
      ) {
        preferredTag = 'shopping'
      } else if (
        text.includes('food') ||
        text.includes('lunch') ||
        text.includes('dinner') ||
        text.includes('breakfast') ||
        text.includes('restaurant') ||
        text.includes('cafe') ||
        text.includes('taste') ||
        text.includes('eat')
      ) {
        preferredTag = 'food'
      } else if (i === 0) {
        preferredTag = 'greeting'
      } else {
        preferredTag = 'direction'
      }
    }

    let chosenPhrase: PhraseItem | undefined

    // 1. If phraseId is valid and not yet used on another day
    if (rawId && phraseById.has(rawId) && !usedIds.has(rawId)) {
      chosenPhrase = phraseById.get(rawId)
    }

    // 2. If missing, unknown or already used: pick an unused phrase, preferring the same tag
    if (!chosenPhrase) {
      if (preferredTag) {
        chosenPhrase = (phrases as PhraseItem[]).find(
          (p) => p.tag === preferredTag && !usedIds.has(p.id)
        )
      }
      if (!chosenPhrase) {
        chosenPhrase = (phrases as PhraseItem[]).find((p) => !usedIds.has(p.id))
      }
      if (!chosenPhrase) {
        chosenPhrase = (phrases as PhraseItem[])[i % phrases.length]
      }
    }

    usedIds.add(chosenPhrase.id)

    // Fill each day's existing Kannada phrase fields
    const meaning = language === 'hi' ? chosenPhrase.hi : chosenPhrase.en
    d.phrase = {
      kannada: chosenPhrase.kn,
      transliteration: chosenPhrase.translit,
      meaning,
    }

    // Ignore any phrase text Gemini returned on its own, and clean temporary phraseId
    delete d.phraseId
  }
}

interface AttemptResult {
  success: boolean
  data?: Itinerary
  error?: unknown
  statusCode?: number
  rawText?: string
  isTimeout?: boolean
}

async function callGemini(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string,
  timeoutMs: number,
  travellers: number,
  expectedDays: number,
  budget: number,
  language: string,
  groupType: string,
  startingCity: string
): Promise<AttemptResult> {
  const callStart = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error(`Gemini call timed out after ${Math.round(timeoutMs / 1000)} seconds`))
  }, timeoutMs)

  let rawText: string | undefined

  try {
    const config: any = {
      abortSignal: controller.signal,
      httpOptions: { timeout: timeoutMs },
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          destination: { type: Type.STRING },
          summary: { type: Type.STRING, description: 'At most 1 short sentence' },
          whyThisPlan: { type: Type.STRING, description: 'At most 1 short sentence' },
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
                    note: { type: Type.STRING, description: 'At most 1 short sentence' },
                  },
                  required: ['mode', 'durationHours', 'costPerPersonOneWay', 'note'],
                },
              },
              recommended: { type: Type.STRING },
              reason: { type: Type.STRING, description: 'At most 1 short sentence' },
            },
            required: ['options', 'recommended', 'reason'],
          },
          journey: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.STRING, description: 'At most 1 short sentence' },
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
              tip: { type: Type.STRING, description: 'At most 1 short sentence' },
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
                      description: { type: Type.STRING, description: 'At most 12 words' },
                    },
                    required: ['place', 'time', 'cost', 'description'],
                  },
                },
                foodTip: { type: Type.STRING, description: 'At most 1 short sentence' },
                phraseId: { type: Type.STRING },
              },
              required: ['day', 'title', 'subtitle', 'stops', 'foodTip', 'phraseId'],
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

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config,
    })

    clearTimeout(timer)
    const elapsedMs = Date.now() - callStart
    rawText = response.text?.trim()
    const rawLen = rawText ? rawText.length : 0

    console.log(
      `[Gemini Call] Model: ${modelName} | Duration: ${elapsedMs}ms | Raw Response Length: ${rawLen} chars`
    )

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
    const escapedCity = startingCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    parsed.whyThisPlan = cleanBudgetText(parsed.whyThisPlan)
      .replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), startingCity)
    parsed.summary = cleanBudgetText(typeof parsed.summary === 'string' ? parsed.summary : '')
      .replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), startingCity)

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

      if (!Array.isArray(d.stops) || d.stops.length < 1) {
        throw new Error(`Validation failed: day ${d.day} must have at least 1 stop`)
      }
      const seenTicketGroupsOnDay = new Set<string>()
      for (const s of d.stops) {
        if (!s || typeof s !== 'object') {
          throw new Error(`Validation failed: invalid stop entry in day ${d.day}`)
        }
        s.place = typeof s.place === 'string' ? s.place : 'Attraction'
        s.time = typeof s.time === 'string' ? s.time : 'Flexible'
        if (typeof s.cost !== 'number' || isNaN(s.cost) || s.cost < 0) {
          throw new Error(`Validation failed: stop cost in day ${d.day} must be a finite number >= 0`)
        }

        // Server defense: for each day, if two stops match attractions of the same ticketGroup by exact case-insensitive name, set the later stop's cost to 0
        const placeKey = s.place.trim().toLowerCase()
        const ticketGroup = TICKET_GROUP_BY_ATTRACTION.get(placeKey)
        if (ticketGroup) {
          if (seenTicketGroupsOnDay.has(ticketGroup)) {
            s.cost = 0
          } else {
            seenTicketGroupsOnDay.add(ticketGroup)
          }
        }

        s.description = cleanBudgetText(cleanTransportText(typeof s.description === 'string' ? s.description : ''))
        calculatedStopsTotal += s.cost
      }
    }

    // Attach verified Kannada phrases from phrases.json to each day
    attachPhrasesToDays(parsed.days, language)

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
      let optNote = cleanBudgetText(cleanTransportText(typeof opt.note === 'string' ? opt.note : ''))
      optNote = removeStartingCityAsViaPoint(optNote, startingCity)
      optNote = optNote.replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), startingCity)
      opt.note = optNote
    }
    parsed.travelPlan.recommended = typeof parsed.travelPlan.recommended === 'string'
      ? parsed.travelPlan.recommended.toLowerCase().trim()
      : parsed.travelPlan.options[0].mode
    parsed.travelPlan.reason = cleanBudgetText(
      cleanPercentages(
        cleanTransportText(typeof parsed.travelPlan.reason === 'string' ? parsed.travelPlan.reason : '')
      )
    ).replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), startingCity)

    // Validate journey
    if (!Array.isArray(parsed.journey) || parsed.journey.length === 0) {
      throw new Error('Validation failed: journey must be a non-empty array')
    }
    for (const j of parsed.journey) {
      if (!j || typeof j !== 'object' || typeof j.step !== 'string' || typeof j.when !== 'string') {
        throw new Error('Validation failed: invalid journey step entry')
      }
      let stepText = cleanTransportText(j.step)
      stepText = removeStartingCityAsViaPoint(stepText, startingCity)
      stepText = stepText.replace(new RegExp(`\\b${escapedCity}\\b`, 'gi'), startingCity)
      j.step = stepText
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
    parsed.localTransport.tip = cleanBudgetText(
      cleanTransportText(typeof parsed.localTransport.tip === 'string' ? parsed.localTransport.tip : '')
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

    // Ensure each day's foodTip is unique, distinct from other days, and mentions a dish from that day's foodPlan
    const seenFoodTips = new Set<string>()
    for (let i = 0; i < parsed.days.length; i++) {
      const d = parsed.days[i]
      let tip = cleanBudgetText(cleanEateryText(typeof d.foodTip === 'string' ? d.foodTip : ''))
      const tipKey = tip.toLowerCase().trim()
      const fp = parsed.foodPlan[i]
      const dayDishes = [fp?.breakfast, fp?.lunch, fp?.dinner].filter(Boolean) as string[]

      const mentionsDayDish = dayDishes.some((dish) => {
        const words = dish.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
        return words.some((w) => tip.toLowerCase().includes(w))
      })

      if (!tipKey || seenFoodTips.has(tipKey) || !mentionsDayDish) {
        const dish = dayDishes[0] || 'traditional local meals'
        tip = `Try the authentic ${dish} prepared fresh with traditional local accompaniments.`
      }
      d.foodTip = tip
      seenFoodTips.add(d.foodTip.toLowerCase().trim())
    }

    // Server-side Financial Calculations (nights = max(days - 1, 1))
    const numTravellers = travellers > 0 ? travellers : 1
    const rooms =
      groupType === 'solo' || groupType === 'couple'
        ? 1
        : groupType === 'friends'
        ? Math.ceil(numTravellers / 3)
        : Math.ceil(numTravellers / 2)
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
    ;(parsed as any).startingCity = startingCity

    return { success: true, data: parsed, rawText }
  } catch (err: any) {
    clearTimeout(timer)
    const elapsedMs = Date.now() - callStart
    const rawLen = rawText ? rawText.length : 0

    const isTimeout =
      controller.signal.aborted ||
      err?.name === 'AbortError' ||
      err?.name === 'TimeoutError' ||
      /timeout|timed out|aborted|deadline exceeded/i.test(err instanceof Error ? err.message : String(err))

    let statusCode: number = isTimeout ? 504 : 503
    if (err?.status && typeof err.status === 'number') {
      statusCode = err.status
    } else if (err?.statusCode && typeof err.statusCode === 'number') {
      statusCode = err.statusCode
    } else if (isTimeout) {
      statusCode = 504
    }

    console.log(
      `[Gemini Call Failed] Model: ${modelName} | Duration: ${elapsedMs}ms | Raw Response Length: ${rawLen} chars | Status: ${statusCode}`
    )

    return {
      success: false,
      error: err,
      statusCode,
      rawText,
      isTimeout,
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

  const normalizedStartingCity = normalizeCityName(startingCity)

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

  const phrasesForPrompt = (phrases as PhraseItem[])
    .map((p) => `- id: "${p.id}" (tag: "${p.tag}", meaning: "${p.en}")`)
    .join('\n')

  const numTravellers = travellers > 0 ? travellers : 1
  const perPersonPerDay = Math.round(budget / (numTravellers * days))
  const nights = Math.max(days - 1, 1)
  const expectedRooms =
    groupType === 'solo' || groupType === 'couple'
      ? 1
      : groupType === 'friends'
      ? Math.ceil(numTravellers / 3)
      : Math.ceil(numTravellers / 2)

  const prompt = `You are an expert travel planner for Karnataka, India.
Create a thoughtful day-wise full-trip itinerary covering round-trip travel from home city, stay, local transport, food, and sightseeing:
- Starting City: ${normalizedStartingCity}
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
- Group Budget: ₹${budget} INR (TOTAL budget for the whole group of ${travellers} person(s) for the entire trip, approx ₹${perPersonPerDay} per person per day)
- Experience Style: ${typeof experience === 'string' ? experience : 'Cultural'}
- Requested Output Language: ${languageName} (${language})

GEOGRAPHIC CLUSTERS (Choose exactly ONE cluster):
${JSON.stringify(CLUSTERS)}

DESTINATION DATABASE (Only use destinations and attractions from this list):
${JSON.stringify(destinations, null, 2)}

VERIFIED KANNADA PHRASES CATALOG:
${phrasesForPrompt}

STRICT RULES:
1. CLUSTER SELECTION: Choose exactly ONE cluster from CLUSTERS that best matches the starting city "${normalizedStartingCity}", interests, experience style, group type, and destination bestTime. Use ONLY destinations in that chosen cluster for the entire trip. NEVER mix destinations across different clusters. (Ignore any cluster id that does not exist in the destination database).

2. BUDGET FITTING (PLAN BACKWARDS) & REALISTIC PRICING:
   - Plan backwards from the budget: First pick the travel option, then work out what is left for stay + food + local transport + entry fees.
   - If budget / travellers / days is under 2500 INR (current is ₹${perPersonPerDay} per person per day): choose hostel, dorm or basic guesthouse rooms (about 600 to 1000 INR per room per night), food at about 250 to 350 INR per person per day, and shared autos, walking, city bus or rented cycles for local transport (about 300 to 600 INR per day for the whole group).
   - Keep prices realistic for India and never go lower just to fit. If it still cannot fit, return the cheapest realistic plan; the server shows the shortfall.

3. NO BUDGET TALK IN TEXT FIELDS (CRITICAL):
   - No text field (whyThisPlan, travelPlan.reason, notes, tips, summary, foodTip, stop descriptions) may say that the plan fits, stays within or exceeds the budget, or mention the budget amount. Budget status is shown only by the server.

4. NO PERCENTAGES OR INVENTED METRICS:
   - In "travelPlan.reason" and everywhere else across the entire response, do NOT state percentages (never write "%") or any number that is not provided in the input or computed directly from the data.
   - You may state that the travel time is long, but do NOT calculate shares of the trip (e.g. do NOT say "takes 40% of the trip", "half of the time", etc.).

5. TRANSPORT & OPERATOR NAMING RULES (CRITICAL):
   - In travelPlan option notes and journey steps, the starting city ("${normalizedStartingCity}") must never appear as a "via" point. A "via" point must be a different hub city. Do not name specific trains, flights or operators.
   - Say ONLY generic descriptions like "train via <city>", "bus", "flight via <city>", "direct cab / self-drive via <route>". Hub city names (e.g. Bengaluru, Hubballi, Mangaluru, Belagavi) are allowed, provided they are not the starting city itself.
   - NEVER name specific trains, train numbers, flight numbers, airlines, or bus operators (e.g. do NOT mention IndiGo, Air India, KSRTC, Shatabdi, Vande Bharat, train 12658, etc.).

6. TRAVEL PLAN & REASON:
   - Provide 2 to 3 real transport options between "${normalizedStartingCity}" and the destination cluster.
   - Each option has:
     * "mode": "train" | "bus" | "flight" | "car"
     * "durationHours": realistic one-way travel duration in hours (number)
     * "costPerPersonOneWay": realistic one-way cost per person in INR (number)
     * "note": generic route/frequency note (at most 1 short sentence, e.g. "overnight sleeper bus", "train via Hubballi", "flight via Mangaluru") - NEVER mention specific carrier or train/flight names, and the starting city "${normalizedStartingCity}" must NEVER appear as a via point.
   - Set "recommended" to one of ("train" | "bus" | "flight" | "car") and provide "reason" (at most 1 short sentence) explaining why it is best for this group.
   - If round-trip travel takes a substantial amount of time relative to a ${days}-day visit, you may note that the travel time is long, but remember: do NOT calculate shares or state percentages.

7. JOURNEY TIMELINE (CRITICAL):
   - The "journey" array must contain ONLY travel, check-in, check-out and arrival steps.
   - Each journey step description ("step") must be at most 1 short sentence.
   - In journey steps, the starting city ("${normalizedStartingCity}") must never appear as a "via" point. A "via" point must be a different hub city. Do not name specific trains, flights or operators.
   - Do NOT name specific attractions, temples, monuments, or viewpoints in the journey steps.
   - For the days in between arrival and departure, use exactly ONE generic step: "Sightseeing as per the day plan" (or translated into ${languageName}).
   - The journey must follow this exact structure:
     * Departure step: "Depart from ${normalizedStartingCity}" with departure day and exact 24-hour clock time (e.g. "Day 0 18:00" if duration >= 14h, or "Day 1 06:00" if shorter).
     * Arrival & check-in step: "Arrive and check in" with the arrival day and exact clock time computed by adding durationHours to departure time (e.g. depart Day 0 18:00 + 24 h = arrive "Day 1 18:00"; depart Day 1 06:00 + 3 h = arrive "Day 1 09:00"). Never use vague terms like "Day 1 morning". Format: "Day X HH:MM".
     * In-between step: Exactly one generic step titled "Sightseeing as per the day plan" (when: "Day 1 - Day ${days}").
     * Check-out & departure step: "Check out and depart for home" (with exact return departure time on Day ${days}, e.g. "Day ${days} 17:00").
     * Final step: "Reach home" with arrival day and exact clock time, computed the same way from return departure time + durationHours (e.g. depart Day ${days} 17:00 + 5h = arrive "Day ${days} 22:00" "Reach home").
   - Sightseeing on Day 1 in the "days" array may start ONLY AFTER arrival and check-in (e.g. if arrival is Day 1 18:00, Day 1 stops must be evening activities after 18:00).

8. SIGHTSEEING ITINERARY & ATTRACTION RULES:
   - Exactly ${days} day entries in "days", numbered 1 to ${days}.
   - Each day must have 2 to 4 stops.
   - Each stop description ("description") must be at most 12 words.
   - Schedule any hill climb or trek in the early morning (before 10:00) or late afternoon (after 16:30), and never in the last 3 hours before the departure time.
   - Database attractions and entry fee rules:
     * Never schedule an attraction whose planAsStop is false.
     * Use an attraction's fee exactly as given. Entry fees in the database are PER PERSON, so multiply by ${travellers} for the total group stop cost. If verified is false and fee is not null, mark the stop with the existing estimated marker (e.g. "(estimated fee)"). If fee is null, estimate as before and mark with "(estimated fee)".
     * Attractions with the same non-null ticketGroup share ONE ticket per person per day. On a given day, charge the fee once (on the first stop of that group) and put cost 0 on the other stops of that group, saying "same ticket" in the description. If the group appears on different days, charge once on each day.
     * If an attraction has a closedDay, mention it in the stop description (for example "closed on Mondays, check before going").
   - If the cluster has too few attractions, you may add at most 2 extra well-known REAL attractions per day in the same town, marked as estimated, never with invented exact fees. Never invent restaurants or hotels. Otherwise add meal or free-time stops with cost 0.
   - Style by groupType: family = relaxed, no strenuous treks; friends = more adventure; couple = scenic and relaxed; solo = budget-friendly and safe.

9. STAY, ROOMS, LOCAL TRANSPORT, AND FOOD PLAN:
   - "stay":
     * "type": Accommodation type (e.g. Hotel, Resort, Homestay, Guesthouse, Hostel).
     * "area": Real neighbourhood in destination.
     * "costPerRoomPerNight": Realistic average cost per room per night in INR for ${nights} night(s).
     * Room sizing rule: rooms = 1 for solo and couple; ceil(travellers / 3) for friends (triple sharing); ceil(travellers / 2) for family. Use it for stay.rooms and the stay cost. For this trip (${travellers} traveller(s), group type: ${groupType}), calculate stay accommodation based on exactly ${expectedRooms} room(s) for ${nights} night(s).
   - "localTransport": { "mode": Mode name, "costPerDay": Realistic cost per day for the entire group in INR, "tip": Transit tip (at most 1 short sentence) }.
   - "foodPlan": Array of exactly ${days} items (one for each day 1 to ${days}):
     * "day": number (1 to ${days})
     * "breakfast", "lunch", "dinner": Use dish names ONLY (for example "Masala dosa", "Mysuru Pak", "Filter coffee", "Bisi bele bath", "Akki rotti", "Jolada rotti meals", "Neer dosa", "Mangalore buns"). Do NOT use names of restaurants, cafes, hotels, or branded eateries (for example Mylari, CTR, MTR, Vidyarthi Bhavan, etc.).
     * "estimatedCostPerPerson": Realistic estimated food cost per person for all 3 meals for that day in INR.

10. CULTURAL ELEMENTS, FOOD TIPS & KANNADA PHRASES:
   - Each day's "Local food tip" ("foodTip") must be at most 1 short sentence, must be different on each day, and must mention a dish that appears in that same day's foodPlan (breakfast, lunch or dinner), not copied from the JSON "food" field on every day.
   - For each day, choose ONE "phraseId" from the VERIFIED KANNADA PHRASES CATALOG above.
   - You MUST pick a DIFFERENT phraseId on every day (a food phrase on a food day, a direction phrase on a sightseeing day, a shopping phrase on a market day, and so on).
   - Gemini must NOT write any Kannada text, transliteration, or meaning for phrases. Provide ONLY the "phraseId" property (e.g. "phraseId": "price").

11. BREVITY & CONCISENESS (CRITICAL):
   - Every description, tip, note, and reason across the entire response (including summary, whyThisPlan, travelPlan.reason, travelPlan.options[].note, journey[].step, localTransport.tip, foodTip) must be at most 1 short sentence.
   - Each stop description ("description") must be at most 12 words.
   - Do NOT change the number of stops (2 to 4 stops per day), days (exactly ${days} days), or any fields in the schema.

12. LANGUAGE REQUIREMENT: Write ALL descriptive text (destination, summary, whyThisPlan, travelPlan.reason, travelPlan.options[].note, journey[].step, journey[].when, stay.type, stay.area, localTransport.mode, localTransport.tip, foodPlan dishes, day titles, subtitles, stop descriptions, foodTip) in ${languageName}. Keep place/attraction names in English.
13. JSON ONLY: Output valid JSON adhering to the specified schema without markdown fences or extra commentary.`

  const ai = new GoogleGenAI({ apiKey })
  const startTime = Date.now()
  const maxTotalMs = 57000 // (maxDuration - 3) * 1000 = 57s to guarantee never exceeding 57s

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

  // 1. Initial attempt with primary model (28s timeout, capped by remaining budget)
  const remaining1 = maxTotalMs - (Date.now() - startTime)
  const timeout1 = Math.min(28000, Math.max(1000, remaining1))
  const result1 = await callGemini(ai, primaryModel, prompt, timeout1, travellers, days, budget, language, groupType, normalizedStartingCity)
  if (result1.success && result1.data) {
    return NextResponse.json(result1.data)
  }
  logFailure(1, primaryModel, result1)
  let lastResult: AttemptResult = result1

  // 2. Retry ONCE after 1 second ONLY when status is 503 or 429 (never retry on timeout or abort with the same model)
  let retriedPrimary = false
  if (!result1.isTimeout && isRetryableError(result1.error, result1.statusCode)) {
    const timeRemainingBeforeDelay = maxTotalMs - (Date.now() - startTime)
    if (timeRemainingBeforeDelay >= 2000) {
      retriedPrimary = true
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const remaining2 = maxTotalMs - (Date.now() - startTime)
      const timeout2 = Math.min(28000, Math.max(1000, remaining2))
      const result2 = await callGemini(ai, primaryModel, prompt, timeout2, travellers, days, budget, language, groupType, normalizedStartingCity)
      if (result2.success && result2.data) {
        return NextResponse.json(result2.data)
      }
      logFailure(2, primaryModel, result2)
      lastResult = result2
    }
  }

  // 3. Fallback model:
  // On a timeout go straight to fallback model (GEMINI_FALLBACK_MODEL) if set.
  // Or if primary retry also failed and fallback model is set.
  if (fallbackModel && !lastResult.success) {
    const timeRemainingForFallback = maxTotalMs - (Date.now() - startTime)
    if (timeRemainingForFallback >= 1000) {
      const timeout3 = Math.min(28000, Math.max(1000, timeRemainingForFallback))
      const attemptNum = retriedPrimary ? 3 : 2
      const result3 = await callGemini(ai, fallbackModel, prompt, timeout3, travellers, days, budget, language, groupType, normalizedStartingCity)
      if (result3.success && result3.data) {
        return NextResponse.json(result3.data)
      }
      logFailure(attemptNum, fallbackModel, result3)
      lastResult = result3
    }
  }

  // 4. Everything failed: log final error and return 503
  const finalErrorMsg = lastResult.error instanceof Error ? lastResult.error.message : String(lastResult.error || 'All attempts failed')
  const sanitizedFinalMsg = sanitizeMessage(finalErrorMsg, apiKey)
  const finalPreview = lastResult.rawText ? sanitizeMessage(lastResult.rawText.slice(0, 300), apiKey) : 'none'

  console.error(
    `[Itinerary API Error] All attempts failed. Status: ${lastResult.statusCode || 503} | Error: ${sanitizedFinalMsg} | Raw Gemini response (first 300 chars): ${finalPreview}`
  )

  return NextResponse.json(
    { error: 'Failed to generate itinerary. Please try again later.' },
    { status: 503 }
  )
}
