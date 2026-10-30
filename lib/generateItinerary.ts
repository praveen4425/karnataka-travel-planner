import type { DestinationCard } from '@/lib/clusters'

export type GroupType = 'solo' | 'couple' | 'family' | 'friends'

export type ItineraryInput = {
  interests: string[]
  days: number
  budget: number
  experience: string
  language: 'en' | 'kn' | 'hi'
  startingCity: string
  travellers: number
  groupType: GroupType
  destination?: string
}

export type ItineraryStop = {
  place: string
  time: string
  cost: number
  description: string
}

export type ItineraryDay = {
  day: number
  title: string
  subtitle: string
  stops: ItineraryStop[]
  foodTip: string
  phrase: {
    kannada: string
    transliteration: string
    meaning: string
  }
}

export type TravelMode = 'train' | 'bus' | 'flight' | 'car'

export type TravelOption = {
  mode: TravelMode | string
  durationHours: number
  costPerPersonOneWay: number
  note: string
}

export type TravelPlan = {
  options: TravelOption[]
  recommended: TravelMode | string
  reason: string
}

export type JourneyStep = {
  step: string
  when: string
}

export type StayPlan = {
  type: string
  area: string
  costPerRoomPerNight: number
  rooms?: number
  nights?: number
}

export type LocalTransportPlan = {
  mode: string
  costPerDay: number
  tip: string
}

export type DayFoodPlan = {
  day: number
  breakfast: string
  lunch: string
  dinner: string
  estimatedCostPerPerson: number
}

export type CostBreakdown = {
  entry: number
  food: number
  stay: number
  localTransport: number
  intercity: number
  total: number
  perPerson: number
}

export type Itinerary = {
  destination: string
  summary: string
  whyThisPlan?: string
  travelPlan?: TravelPlan
  journey?: JourneyStep[]
  stay?: StayPlan
  localTransport?: LocalTransportPlan
  foodPlan?: DayFoodPlan[]
  days: ItineraryDay[]
  totalCost: number
  costBreakdown?: CostBreakdown
  overBudget?: boolean
  budgetShortfall?: number
  budgetWarning?: string
}

export async function generateItinerary(input: ItineraryInput): Promise<Itinerary> {
  const response = await fetch('/api/itinerary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.error || 'Failed to generate itinerary')
  }

  return response.json()
}

export async function getDestinationOptions(input: {
  interests: string[]
  days: number
  experience: string
}): Promise<{ cards: DestinationCard[]; noExactMatch: boolean }> {
  const response = await fetch('/api/destinations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)
    throw new Error(errorData?.error || 'Failed to fetch destination options')
  }

  return response.json()
}
