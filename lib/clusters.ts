export interface Cluster {
  id: string
  name: string
  members: string[]
}

export const CLUSTERS: Cluster[] = [
  { id: 'mysuru', name: 'Mysuru', members: ['mysuru'] },
  { id: 'bengaluru', name: 'Bengaluru', members: ['bengaluru'] },
  { id: 'hampi', name: 'Hampi', members: ['hampi'] },
  { id: 'coorg', name: 'Coorg (Madikeri)', members: ['coorg'] },
  { id: 'gokarna', name: 'Gokarna', members: ['gokarna'] },
  { id: 'badami', name: 'Badami, Pattadakal and Aihole', members: ['badami', 'pattadakal', 'aihole'] },
  { id: 'belur-halebidu', name: 'Belur, Halebidu, Shravanabelagola and Chikkamagaluru', members: ['belur-halebidu', 'shravanabelagola', 'chikkamagaluru'] },
  { id: 'jog-falls', name: 'Jog Falls', members: ['jog-falls'] },
  { id: 'udupi', name: 'Udupi', members: ['udupi'] },
  { id: 'murudeshwara', name: 'Murudeshwara', members: ['murudeshwara'] },
]

export interface DestinationCard {
  id: string
  name: string
  members: string[]
  score: number
  suggestedDaysMin: number
  suggestedDaysMax: number
  bestTime: string
  highlights: string[]
  food: string
  matchedInterests: string[]
}

export interface BuildCardsInput {
  interests: string[]
  days: number
  experience: string
}

export interface BuildCardsResult {
  cards: DestinationCard[]
  noExactMatch: boolean
}

interface AttractionDef {
  name: string
  planAsStop?: boolean
}

interface DestinationDef {
  id: string
  name: string
  tags?: string[]
  bestTime?: string
  visitDays?: string
  attractions?: AttractionDef[]
  food?: string
}

const EXP_TAGS_MAP: Record<string, string[]> = {
  adventure: ['adventure', 'nature', 'wildlife'],
  cultural: ['heritage', 'spiritual', 'food'],
  relaxed: ['beaches', 'nature', 'spiritual'],
  family: ['heritage', 'nature', 'beaches', 'food'],
}

function parseVisitDays(str?: string): { min: number; max: number } {
  if (!str || typeof str !== 'string') return { min: 1, max: 1 }
  const parts = str.split('-').map((s) => parseFloat(s.trim()))
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { min: parts[0], max: parts[1] }
  }
  const val = parseFloat(str)
  if (!isNaN(val)) {
    return { min: val, max: val }
  }
  return { min: 1, max: 1 }
}

export function buildCards(
  destinations: unknown[],
  input: BuildCardsInput
): BuildCardsResult {
  const destList = (Array.isArray(destinations) ? destinations : []) as DestinationDef[]
  const destById = new Map<string, DestinationDef>()
  for (const d of destList) {
    if (d && typeof d.id === 'string') {
      destById.set(d.id.trim().toLowerCase(), d)
    }
  }

  const selectedInterests = (Array.isArray(input?.interests) ? input.interests : [])
    .filter((i) => typeof i === 'string' && i.trim().length > 0)

  const expValue = (typeof input?.experience === 'string' ? input.experience : '').trim().toLowerCase()
  const daysValue = typeof input?.days === 'number' && !isNaN(input.days) ? input.days : 1

  let anyClusterMatchedInterest = false

  type ScoredCard = DestinationCard & { originalIndex: number }
  const scoredCards: ScoredCard[] = []

  for (let i = 0; i < CLUSTERS.length; i++) {
    const cluster = CLUSTERS[i]
    // Filter member ids that exist in destinations.json
    const validMembers: string[] = []
    const memberDests: DestinationDef[] = []

    for (const memberId of cluster.members || []) {
      const dest = destById.get(memberId.trim().toLowerCase())
      if (dest) {
        validMembers.push(dest.id)
        memberDests.push(dest)
      }
    }

    // Skip a cluster that has no existing members
    if (validMembers.length === 0 || memberDests.length === 0) {
      continue
    }

    // Union of members' tags
    const clusterTags = new Set<string>()
    for (const dest of memberDests) {
      for (const tag of dest.tags || []) {
        if (typeof tag === 'string') {
          clusterTags.add(tag.trim().toLowerCase())
        }
      }
    }

    // 1. Interest score (0 to 50)
    const matchedInterests: string[] = []
    for (const interest of selectedInterests) {
      if (clusterTags.has(interest.trim().toLowerCase())) {
        matchedInterests.push(interest) // original spelling
      }
    }

    if (matchedInterests.length > 0) {
      anyClusterMatchedInterest = true
    }

    let interestScore = 25
    if (selectedInterests.length > 0) {
      interestScore = (matchedInterests.length / selectedInterests.length) * 50
    }

    // 2. Experience score (0 to 20)
    let experienceScore = 10
    if (expValue === 'solo budget') {
      experienceScore = 10
    } else if (EXP_TAGS_MAP[expValue]) {
      const mapped = EXP_TAGS_MAP[expValue]
      const presentCount = mapped.filter((t) => clusterTags.has(t)).length
      experienceScore = (presentCount / mapped.length) * 20
    }

    // 3. Days score (0 to 30)
    let sumMin = 0
    let sumMax = 0
    for (const dest of memberDests) {
      const parsed = parseVisitDays(dest.visitDays)
      sumMin += parsed.min
      sumMax += parsed.max
    }
    const suggestedDaysMin = Math.ceil(sumMin)
    const suggestedDaysMax = Math.ceil(sumMax)

    let daysScore = 0
    if (daysValue >= suggestedDaysMin && daysValue <= suggestedDaysMax) {
      daysScore = 30
    } else if (
      daysValue >= suggestedDaysMin - 1 &&
      daysValue <= suggestedDaysMax + 1
    ) {
      daysScore = 15
    } else {
      daysScore = 0
    }

    const totalScore = Math.round((interestScore + experienceScore + daysScore) * 100) / 100

    // First member's bestTime and food
    const firstMember = memberDests[0]
    const bestTime = (firstMember && typeof firstMember.bestTime === 'string') ? firstMember.bestTime : ''
    const food = (firstMember && typeof firstMember.food === 'string') ? firstMember.food : ''

    // Highlights (up to 3 attraction names from members, only those with planAsStop !== false, no duplicates)
    const highlights: string[] = []
    const seenHighlights = new Set<string>()
    for (const dest of memberDests) {
      for (const attr of dest.attractions || []) {
        if (attr && attr.planAsStop !== false && typeof attr.name === 'string') {
          const trimmed = attr.name.trim()
          if (trimmed && !seenHighlights.has(trimmed.toLowerCase())) {
            seenHighlights.add(trimmed.toLowerCase())
            highlights.push(trimmed)
            if (highlights.length === 3) break
          }
        }
      }
      if (highlights.length === 3) break
    }

    scoredCards.push({
      id: cluster.id,
      name: cluster.name,
      members: validMembers,
      score: totalScore,
      suggestedDaysMin,
      suggestedDaysMax,
      bestTime,
      highlights,
      food,
      matchedInterests,
      originalIndex: i,
    })
  }

  // Sorted by score descending, ties broken by CLUSTERS order
  scoredCards.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.originalIndex - b.originalIndex
  })

  const noExactMatch = selectedInterests.length > 0 && !anyClusterMatchedInterest

  const cards: DestinationCard[] = scoredCards.slice(0, 4).map((c) => ({
    id: c.id,
    name: c.name,
    members: c.members,
    score: c.score,
    suggestedDaysMin: c.suggestedDaysMin,
    suggestedDaysMax: c.suggestedDaysMax,
    bestTime: c.bestTime,
    highlights: c.highlights,
    food: c.food,
    matchedInterests: c.matchedInterests,
  }))

  return {
    cards,
    noExactMatch,
  }
}
