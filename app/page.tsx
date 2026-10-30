'use client'

import { useState, useRef } from 'react'
import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Compass,
  Footprints,
  Hotel,
  IndianRupee,
  LoaderCircle,
  MapPin,
  Route,
  Sparkles,
  Users,
  Utensils,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  generateItinerary,
  getDestinationOptions,
  type GroupType,
  type Itinerary,
  type ItineraryInput,
} from '@/lib/generateItinerary'
import { translations, type Language, type Translation } from '@/lib/translations'
import { DestinationCards } from '@/components/destination-cards'
import type { DestinationCard } from '@/lib/clusters'

const interestKeys = ['Heritage', 'Nature', 'Wildlife', 'Beaches', 'Food', 'Adventure', 'Spiritual'] as const
const experienceKeys = ['Relaxed', 'Adventure', 'Cultural', 'Family', 'Solo Budget'] as const
const groupTypeKeys: GroupType[] = ['solo', 'couple', 'family', 'friends']

const initialInput: ItineraryInput = {
  interests: ['Heritage', 'Food'],
  days: 2,
  budget: 12000,
  experience: 'Cultural',
  language: 'en',
  startingCity: 'Bengaluru',
  travellers: 2,
  groupType: 'couple',
}

const formatINR = (value: number) => new Intl.NumberFormat('en-IN').format(value)

export default function Page() {
  const [language, setLanguage] = useState<Language>('en')
  const [input, setInput] = useState<ItineraryInput>(initialInput)
  const [cards, setCards] = useState<DestinationCard[]>([])
  const [noExactMatch, setNoExactMatch] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState('')
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState('')
  const [itinerary, setItinerary] = useState<Itinerary | null>(null)

  const cardsRef = useRef<HTMLDivElement>(null)
  const planRequestIdRef = useRef(0)

  const copy: Translation = translations[language]

  const daysInvalid = input.days < 1 || input.days > 7
  const travellersInvalid = input.travellers < 1 || input.travellers > 10
  const cityInvalid = !input.startingCity.trim()

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage)
    setInput((current) => ({ ...current, language: nextLanguage }))

    if (itinerary && selectedCardId) {
      const reqId = ++planRequestIdRef.current
      setPlanLoading(true)
      setPlanError('')
      generateItinerary({
        ...input,
        destination: selectedCardId,
        language: nextLanguage,
      })
        .then((result) => {
          if (reqId === planRequestIdRef.current) {
            setItinerary(result)
          }
        })
        .catch(() => {
          if (reqId === planRequestIdRef.current) {
            setPlanError(translations[nextLanguage].error)
          }
        })
        .finally(() => {
          if (reqId === planRequestIdRef.current) {
            setPlanLoading(false)
          }
        })
    }
  }

  const toggleInterest = (interest: string) => {
    setInput((current) => ({
      ...current,
      interests: current.interests.includes(interest)
        ? current.interests.filter((item) => item !== interest)
        : [...current.interests, interest],
    }))
  }

  const fetchDestinationOptions = async () => {
    if (daysInvalid || travellersInvalid || cityInvalid || optionsLoading) return
    setOptionsLoading(true)
    setOptionsError('')
    setCards([])
    setSelectedCardId(null)
    setItinerary(null)
    setPlanError('')
    try {
      const result = await getDestinationOptions({
        interests: input.interests,
        days: input.days,
        experience: input.experience,
      })
      setCards(result.cards)
      setNoExactMatch(result.noExactMatch)
      setTimeout(() => {
        cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch {
      setOptionsError(copy.error)
    } finally {
      setOptionsLoading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    fetchDestinationOptions()
  }

  const handleCardSelect = async (cardId: string) => {
    if (planLoading) return
    const reqId = ++planRequestIdRef.current
    setSelectedCardId(cardId)
    setPlanLoading(true)
    setPlanError('')
    try {
      const result = await generateItinerary({
        ...input,
        destination: cardId,
        language,
      })
      if (reqId === planRequestIdRef.current) {
        setItinerary(result)
      }
    } catch {
      if (reqId === planRequestIdRef.current) {
        setPlanError(copy.error)
      }
    } finally {
      if (reqId === planRequestIdRef.current) {
        setPlanLoading(false)
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#fbf7f0] text-[#302b2a]">
      <header className="border-b border-[#e9dfd0] bg-[#fffdf9]/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#6f1d2b] text-[#f4c96b] shadow-sm">
              <Compass aria-hidden="true" />
            </div>
            <div>
              <p className="font-serif text-lg font-bold tracking-tight text-[#6f1d2b]">Karnataka Travel Planner</p>
              <p className="hidden text-xs text-[#8b8179] sm:block">{copy.tagline}</p>
            </div>
          </div>
          <div className="flex rounded-full border border-[#dfd2c1] bg-[#fffdf9] p-1 text-xs font-semibold">
            {(['en', 'kn', 'hi'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => changeLanguage(item)}
                className={`rounded-full px-3 py-1.5 transition ${
                  language === item ? 'bg-[#6f1d2b] text-white' : 'text-[#766d65] hover:text-[#6f1d2b]'
                }`}
                aria-pressed={language === item}
              >
                {translations[item].languageName}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 pb-12 pt-10 sm:px-8 sm:pt-16">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e5f0e5] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#3d6846]">
            <Sparkles aria-hidden="true" data-icon="inline-start" /> {copy.heroBadge}
          </div>
          <h1 className="font-serif text-4xl font-bold leading-[1.08] tracking-tight text-[#5d1726] sm:text-6xl">
            {copy.heroHeading} <span className="text-[#b4771d]">{copy.heroHeadingAccent}</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#71675f] sm:text-lg">{copy.heroSubtext}</p>
        </div>

        <div className="mt-9 grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_16px_50px_rgba(87,48,23,0.07)] sm:p-7"
          >
            <div className="mb-7 flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#f8e8bd] text-[#9b6c18]">
                <MapPin aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-bold text-[#5d1726]">{copy.formTitle}</h2>
                <p className="text-sm text-[#8b8179]">{copy.formSubtext}</p>
              </div>
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-bold text-[#443b35]">{copy.interestsLabel}</legend>
              <div className="flex flex-wrap gap-2">
                {interestKeys.map((interest) => {
                  const selected = input.interests.includes(interest)
                  return (
                    <button
                      key={interest}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                      aria-pressed={selected}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                        selected
                          ? 'border-[#6f1d2b] bg-[#6f1d2b] text-white shadow-sm'
                          : 'border-[#dfd2c1] bg-[#fffdf9] text-[#6d625a] hover:border-[#b4771d] hover:text-[#6f1d2b]'
                      }`}
                    >
                      {selected && <Check className="mr-1 inline size-3.5" aria-hidden="true" />}
                      {copy.interests[interest]}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.startingCityLabel}
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 size-4 text-[#9d9289]" aria-hidden="true" />
                  <input
                    type="text"
                    required
                    placeholder={copy.startingCityPlaceholder}
                    value={input.startingCity}
                    onChange={(event) => setInput({ ...input, startingCity: event.target.value })}
                    className="h-11 w-full rounded-xl border border-[#dfd2c1] bg-[#fffdf9] pl-9 pr-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                  />
                </div>
                {cityInvalid && (
                  <span className="text-xs font-normal text-[#9b3327]" role="alert">
                    {copy.validationStartingCity}
                  </span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.travellingAsLabel}
                <div className="relative">
                  <select
                    value={input.groupType}
                    onChange={(event) => setInput({ ...input, groupType: event.target.value as GroupType })}
                    className="h-11 w-full appearance-none rounded-xl border border-[#dfd2c1] bg-[#fffdf9] px-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                  >
                    {groupTypeKeys.map((group) => (
                      <option key={group} value={group}>
                        {copy.groupTypes[group]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[#9d9289]" aria-hidden="true" />
                </div>
              </label>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.travellersLabel}
                <div className="relative">
                  <Users className="absolute left-3 top-3 size-4 text-[#9d9289]" aria-hidden="true" />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={input.travellers}
                    onChange={(event) => setInput({ ...input, travellers: Number(event.target.value) })}
                    aria-invalid={travellersInvalid}
                    className="h-11 w-full rounded-xl border border-[#dfd2c1] bg-[#fffdf9] pl-9 pr-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                  />
                </div>
                {travellersInvalid && (
                  <span className="text-xs font-normal text-[#9b3327]" role="alert">
                    {copy.validationTravellers}
                  </span>
                )}
              </label>

              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.daysLabel}
                <input
                  type="number"
                  min="1"
                  max="7"
                  value={input.days}
                  onChange={(event) => setInput({ ...input, days: Number(event.target.value) })}
                  aria-invalid={daysInvalid}
                  className="h-11 rounded-xl border border-[#dfd2c1] bg-[#fffdf9] px-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                />
                {daysInvalid && (
                  <span className="text-xs font-normal text-[#9b3327]" role="alert">
                    {copy.validationDays}
                  </span>
                )}
              </label>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.budgetLabel}
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-3 size-4 text-[#9d9289]" aria-hidden="true" />
                  <input
                    type="number"
                    min="0"
                    value={input.budget}
                    onChange={(event) => setInput({ ...input, budget: Number(event.target.value) })}
                    className="h-11 w-full rounded-xl border border-[#dfd2c1] bg-[#fffdf9] pl-9 pr-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                  />
                </div>
              </label>

              <label className="grid gap-2 text-sm font-bold text-[#443b35]">
                {copy.experienceLabel}
                <div className="relative">
                  <select
                    value={input.experience}
                    onChange={(event) => setInput({ ...input, experience: event.target.value })}
                    className="h-11 w-full appearance-none rounded-xl border border-[#dfd2c1] bg-[#fffdf9] px-3 font-normal text-[#302b2a] outline-none ring-[#b4771d] focus:ring-2"
                  >
                    {experienceKeys.map((experience) => (
                      <option key={experience} value={experience}>
                        {copy.experiences[experience]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-[#9d9289]" aria-hidden="true" />
                </div>
              </label>
            </div>

            {optionsError && (
              <div role="alert" className="mt-5 flex items-start justify-between gap-2 rounded-xl bg-[#fbe7e1] p-3 text-sm text-[#9b3327]">
                <div className="flex items-start gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{optionsError}</span>
                </div>
                <button
                  type="button"
                  onClick={fetchDestinationOptions}
                  className="ml-2 font-bold underline hover:no-underline text-xs shrink-0"
                >
                  {copy.tryAgainButton}
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={optionsLoading || daysInvalid || travellersInvalid || cityInvalid}
              className="mt-7 h-12 w-full rounded-xl bg-[#6f1d2b] text-base font-bold text-white hover:bg-[#581522]"
            >
              {optionsLoading ? (
                <>
                  <LoaderCircle className="animate-spin" data-icon="inline-start" /> {copy.loadingButton}
                </>
              ) : (
                <>
                  {copy.planButton} <ArrowRight data-icon="inline-end" />
                </>
              )}
            </Button>
          </form>

          <section aria-live="polite" aria-busy={optionsLoading || planLoading}>
            {optionsLoading ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-[#eadfce] bg-[#fffdf9] p-8 text-center">
                <LoaderCircle className="size-8 animate-spin text-[#6f1d2b]" aria-hidden="true" />
                <h2 className="mt-4 font-serif text-2xl font-bold text-[#5d1726]">{copy.loadingTitle}</h2>
                <p className="mt-2 text-sm text-[#8b8179]">{copy.loadingOptionsText}</p>
              </div>
            ) : cards.length > 0 ? (
              <div ref={cardsRef} className="space-y-8">
                <DestinationCards
                  cards={cards}
                  selectedId={selectedCardId}
                  noExactMatch={noExactMatch}
                  onSelect={handleCardSelect}
                  copy={copy}
                  isPlanLoading={planLoading}
                />

                {planLoading && (
                  <div className="flex min-h-[300px] flex-col items-center justify-center rounded-3xl border border-[#eadfce] bg-[#fffdf9] p-8 text-center">
                    <LoaderCircle className="size-8 animate-spin text-[#6f1d2b]" aria-hidden="true" />
                    <h2 className="mt-4 font-serif text-2xl font-bold text-[#5d1726]">{copy.loadingTitle}</h2>
                    <p className="mt-2 text-sm text-[#8b8179]">{copy.loadingText}</p>
                  </div>
                )}

                {planError && (
                  <div role="alert" className="flex items-start justify-between gap-2 rounded-2xl bg-[#fbe7e1] p-4 text-sm text-[#9b3327]">
                    <div className="flex items-start gap-2">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <span>{planError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectedCardId && handleCardSelect(selectedCardId)}
                      className="ml-2 font-bold underline hover:no-underline text-xs shrink-0"
                    >
                      {copy.tryAgainButton}
                    </button>
                  </div>
                )}

                {itinerary && !planLoading && (
                  <div>
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => {
                          cardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#dfd2c1] bg-[#fffdf9] px-3.5 py-1.5 text-xs font-semibold text-[#6f1d2b] shadow-sm transition hover:bg-[#fbf7f0]"
                      >
                        <ArrowUp className="size-3.5" aria-hidden="true" />
                        {copy.backToOptionsButton}
                      </button>
                    </div>
                    <ItineraryView itinerary={itinerary} copy={copy} travellers={input.travellers} />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-[#d9c9b6] bg-[#f8f1e5] p-8 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-[#f3dfb0] text-[#9b6c18]">
                  <CalendarDays aria-hidden="true" />
                </div>
                <h2 className="mt-5 font-serif text-2xl font-bold text-[#5d1726]">{copy.emptyTitle}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#7c7067]">{copy.emptyText}</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

function ItineraryView({
  itinerary,
  copy,
  travellers,
}: {
  itinerary: Itinerary
  copy: Translation
  travellers: number
}) {
  const numTravellers = travellers > 0 ? travellers : 1
  const breakdown = itinerary.costBreakdown || {
    entry: itinerary.totalCost ?? 0,
    food: 0,
    stay: 0,
    localTransport: 0,
    intercity: 0,
    total: itinerary.totalCost ?? 0,
    perPerson: Math.round((itinerary.totalCost ?? 0) / numTravellers),
  }

  const totalVal = breakdown.total ?? itinerary.totalCost ?? 0
  const perPersonVal = breakdown.perPerson ?? Math.round(totalVal / numTravellers)

  const stayRooms = itinerary.stay?.rooms ?? Math.ceil(numTravellers / 2)
  const stayNights = itinerary.stay?.nights ?? Math.max((itinerary.days?.length ?? 1) - 1, 1)
  const stayPerRoom = itinerary.stay?.costPerRoomPerNight ?? 0

  const localTransportPerDay = itinerary.localTransport?.costPerDay ?? 0
  const daysCount = itinerary.days?.length ?? 1

  const recommendedOption =
    itinerary.travelPlan?.options?.find(
      (o) => o.mode.toLowerCase() === itinerary.travelPlan?.recommended?.toLowerCase()
    ) || itinerary.travelPlan?.options?.[0]
  const travelPerPerson = recommendedOption?.costPerPersonOneWay ?? 0

  const roomText = (count: number) => `${count} ${count === 1 ? copy.roomSingular : copy.rooms}`
  const nightText = (count: number) => `${count} ${count === 1 ? copy.nightSingular : copy.nights}`
  const dayText = (count: number) => `${count} ${count === 1 ? copy.daySingular : copy.days}`
  const travellerText = (count: number) =>
    `${count} ${count === 1 ? copy.travellerSingular : copy.travellersCount}`

  return (
    <div>
      {/* Destination Heading & whyThisPlan */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3d6846]">{copy.suggestedEscape}</p>
          <h2 className="mt-1 font-serif text-3xl font-bold text-[#5d1726]">{itinerary.destination}</h2>
          <p className="mt-1 text-sm text-[#7c7067]">{itinerary.summary}</p>
          {itinerary.whyThisPlan && (
            <p className="mt-3 rounded-2xl border border-[#ead39c] bg-[#fff8e5] p-3.5 text-xs leading-relaxed text-[#8c5d14]">
              <Sparkles className="mr-1.5 inline size-3.5 text-[#b4771d]" aria-hidden="true" />
              {itinerary.whyThisPlan}
            </p>
          )}
        </div>
        <span className="self-start rounded-full bg-[#e5f0e5] px-3 py-1.5 text-xs font-bold text-[#3d6846] shrink-0">
          {dayText(itinerary.days?.length || 2)}
        </span>
      </div>

      {/* 1. Your Journey Timeline */}
      {itinerary.journey && itinerary.journey.length > 0 && (
        <section className="mb-6 rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[#eee3d6] pb-3">
            <Route className="size-5 text-[#6f1d2b]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.yourJourneyTitle}</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {itinerary.journey.map((step, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-2xl border border-[#f0e7dc] bg-[#fffaf2] p-3.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#6f1d2b] text-xs font-bold text-[#f8d886]">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#9b6c18]">{step.when}</p>
                  <p className="mt-0.5 text-sm font-semibold text-[#443b35]">{step.step}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2. How to Reach */}
      {itinerary.travelPlan?.options && itinerary.travelPlan.options.length > 0 && (
        <section className="mb-6 rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[#eee3d6] pb-3">
            <Compass className="size-5 text-[#6f1d2b]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.howToReachTitle}</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {itinerary.travelPlan.options.map((opt, idx) => {
              const isRecommended =
                opt.mode.toLowerCase() === itinerary.travelPlan?.recommended?.toLowerCase()
              const modeLabel =
                copy.travelModes[opt.mode.toLowerCase() as keyof typeof copy.travelModes] || opt.mode

              return (
                <div
                  key={idx}
                  className={`relative flex flex-col justify-between rounded-2xl border p-4 transition ${
                    isRecommended
                      ? 'border-[#6f1d2b] bg-[#fffaf2] shadow-sm ring-1 ring-[#6f1d2b]/20'
                      : 'border-[#f0e7dc] bg-[#fffdf9]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-serif text-base font-bold text-[#5d1726]">{modeLabel}</span>
                      {isRecommended && (
                        <span className="rounded-full bg-[#e5f0e5] px-2.5 py-0.5 text-[11px] font-bold text-[#3d6846]">
                          {copy.recommendedBadge}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-lg font-bold text-[#443b35]">
                        ₹{formatINR(opt.costPerPersonOneWay)}
                      </span>
                      <span className="text-xs text-[#8b8179]">{copy.perPersonSuffix}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#766d65]">
                      <Clock className="mr-1 inline size-3 text-[#9b6c18]" aria-hidden="true" />
                      {opt.durationHours} {copy.hoursShort}
                    </p>
                    {opt.note && <p className="mt-2 text-xs leading-relaxed text-[#8b8179]">{opt.note}</p>}
                  </div>
                </div>
              )
            })}
          </div>
          {itinerary.travelPlan.reason && (
            <div className="mt-4 rounded-xl bg-[#f7f1e8] p-3 text-xs leading-5 text-[#665b52]">
              <strong className="text-[#5d1726]">{copy.recommendedReason}:</strong>{' '}
              {itinerary.travelPlan.reason}
            </div>
          )}
        </section>
      )}

      {/* 3. Where to Stay */}
      {itinerary.stay && (
        <section className="mb-6 rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[#eee3d6] pb-3">
            <Hotel className="size-5 text-[#6f1d2b]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.whereToStayTitle}</h3>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="font-serif text-lg font-bold text-[#443b35]">{itinerary.stay.type}</p>
              <p className="mt-0.5 text-xs text-[#8b8179]">
                <MapPin className="mr-1 inline size-3 text-[#9b6c18]" aria-hidden="true" />
                {itinerary.stay.area}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-[#6f1d2b]">
                ₹{formatINR(itinerary.stay.costPerRoomPerNight)}{' '}
                <span className="text-xs font-normal text-[#8b8179]">{copy.perRoomPerNight}</span>
              </p>
              <p className="text-xs text-[#766d65]">
                {roomText(stayRooms)} • {nightText(stayNights)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 4. Getting Around */}
      {itinerary.localTransport && (
        <section className="mb-6 rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[#eee3d6] pb-3">
            <Footprints className="size-5 text-[#6f1d2b]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.gettingAroundTitle}</h3>
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
            <p className="font-serif text-lg font-bold text-[#443b35]">{itinerary.localTransport.mode}</p>
            <p className="text-lg font-bold text-[#6f1d2b]">
              ₹{formatINR(itinerary.localTransport.costPerDay)}{' '}
              <span className="text-xs font-normal text-[#8b8179]">{copy.perDay}</span>
            </p>
          </div>
          {itinerary.localTransport.tip && (
            <div className="mt-3 rounded-xl bg-[#f7f1e8] p-3 text-xs leading-5 text-[#665b52]">
              <strong className="text-[#5d1726]">{copy.transitTip}:</strong> {itinerary.localTransport.tip}
            </div>
          )}
        </section>
      )}

      {/* 5. Food Plan */}
      {itinerary.foodPlan && itinerary.foodPlan.length > 0 && (
        <section className="mb-6 rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
          <div className="flex items-center gap-2.5 border-b border-[#eee3d6] pb-3">
            <Utensils className="size-5 text-[#6f1d2b]" aria-hidden="true" />
            <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.foodPlanTitle}</h3>
          </div>
          <div className="mt-4 grid gap-3">
            {itinerary.foodPlan.map((fp) => (
              <div key={fp.day} className="rounded-2xl border border-[#f0e7dc] bg-[#fffaf2] p-4 text-xs">
                <div className="flex items-center justify-between border-b border-[#f0e7dc] pb-2 font-bold text-[#5d1726]">
                  <span>
                    {copy.dayWord} {fp.day}
                  </span>
                  <span className="text-[#3d6846]">
                    ₹{formatINR(fp.estimatedCostPerPerson)} {copy.perPersonSuffix}
                  </span>
                </div>
                <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
                  <div>
                    <span className="font-semibold text-[#8b5e13]">{copy.breakfast}:</span>{' '}
                    <span className="text-[#443b35]">{fp.breakfast}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#8b5e13]">{copy.lunch}:</span>{' '}
                    <span className="text-[#443b35]">{fp.lunch}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#8b5e13]">{copy.dinner}:</span>{' '}
                    <span className="text-[#443b35]">{fp.dinner}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* C. Day Cards */}
      <div className="grid gap-5">
        {itinerary.days.map((day) => (
          <article
            key={day.day}
            className="overflow-hidden rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] shadow-[0_10px_30px_rgba(87,48,23,0.05)]"
          >
            <div className="flex items-start gap-4 border-b border-[#eee3d6] bg-[#fffaf2] p-5 sm:p-6">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#6f1d2b] font-serif text-lg font-bold text-[#f8d886]">
                {day.day}
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-[#5d1726]">{day.title}</h3>
                <p className="text-sm text-[#8b8179]">{day.subtitle}</p>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid gap-4">
                {day.stops.map((stop, sIdx) => (
                  <div
                    key={`${stop.place}-${sIdx}`}
                    className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#f0e7dc] pb-4 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-bold text-[#443b35]">{stop.place}</p>
                      <p className="mt-0.5 text-xs text-[#8b8179]">{stop.time}</p>
                      <p className="mt-1 text-xs leading-5 text-[#766d65]">{stop.description}</p>
                    </div>
                    <p className="font-semibold text-[#3d6846]">₹{formatINR(stop.cost)}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex gap-2 rounded-xl bg-[#f7f1e8] p-3 text-sm leading-5 text-[#665b52]">
                <Utensils className="mt-0.5 size-4 shrink-0 text-[#b4771d]" aria-hidden="true" />
                <span>
                  <strong className="text-[#5d1726]">{copy.localFoodTip}</strong> {day.foodTip}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-[#ead39c] bg-[#fff8e5] p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#9b6c18]">{copy.kannadaPhrase}</p>
                <p className="mt-2 font-serif text-xl font-bold text-[#5d1726]">{day.phrase.kannada}</p>
                <p className="mt-1 text-sm italic text-[#8b8179]">{day.phrase.transliteration}</p>
                <p className="mt-2 text-sm text-[#665b52]">{day.phrase.meaning}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* D. Over-budget alert ABOVE breakdown card */}
      {itinerary.overBudget && typeof itinerary.budgetShortfall === 'number' && itinerary.budgetShortfall > 0 ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-2xl border border-[#d97706] bg-[#fffbeb] p-4 text-sm leading-5 text-[#92400e]"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-[#d97706]" aria-hidden="true" />
          <span>
            {copy.overBudgetMessage.replace('{shortfall}', `₹${formatINR(itinerary.budgetShortfall)}`)}
          </span>
        </div>
      ) : itinerary.budgetWarning ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-2xl border border-[#e8c078] bg-[#fff8e5] p-4 text-sm leading-5 text-[#8c5d14]"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-[#b4771d]" aria-hidden="true" />
          <span>{itinerary.budgetWarning}</span>
        </div>
      ) : null}

      {/* D. Cost Breakdown Card */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-[#e7d9c8] bg-[#fffdf9] p-5 shadow-[0_10px_30px_rgba(87,48,23,0.05)] sm:p-6">
        <div className="flex items-center justify-between border-b border-[#eee3d6] pb-4">
          <h3 className="font-serif text-xl font-bold text-[#5d1726]">{copy.costBreakdownTitle}</h3>
          <span className="rounded-full bg-[#f8e8bd] px-3 py-1 text-xs font-semibold text-[#8b5e13]">
            {travellerText(numTravellers)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 text-sm">
          {/* Entry fees */}
          <div className="flex items-center justify-between text-[#6d625a]">
            <span>{copy.entryFees}</span>
            <span className="font-semibold text-[#443b35]">₹{formatINR(breakdown.entry ?? 0)}</span>
          </div>

          {/* Food */}
          <div className="flex items-center justify-between text-[#6d625a]">
            <span>{copy.food}</span>
            <span className="font-semibold text-[#443b35]">₹{formatINR(breakdown.food ?? 0)}</span>
          </div>

          {/* Stay */}
          <div className="border-t border-[#f0e7dc] pt-2">
            <div className="flex items-center justify-between text-[#6d625a]">
              <span>{copy.stay}</span>
              <span className="font-semibold text-[#443b35]">₹{formatINR(breakdown.stay ?? 0)}</span>
            </div>
            <p className="mt-0.5 text-xs text-[#8b8179]">
              ₹{formatINR(stayPerRoom)} × {roomText(stayRooms)} × {nightText(stayNights)}
            </p>
          </div>

          {/* Local transport */}
          <div className="border-t border-[#f0e7dc] pt-2">
            <div className="flex items-center justify-between text-[#6d625a]">
              <span>{copy.localTransport}</span>
              <span className="font-semibold text-[#443b35]">{`₹${formatINR(breakdown.localTransport ?? 0)}`}</span>
            </div>
            <p className="mt-0.5 text-xs text-[#8b8179]">
              ₹{formatINR(localTransportPerDay)} × {dayText(daysCount)}
            </p>
          </div>

          {/* Travel from starting city */}
          <div className="border-t border-[#f0e7dc] pt-2">
            <div className="flex items-center justify-between text-[#6d625a]">
              <span>{copy.travelFromStartingCity}</span>
              <span className="font-semibold text-[#443b35]">{`₹${formatINR(breakdown.intercity ?? 0)}`}</span>
            </div>
            <p className="mt-0.5 text-xs text-[#8b8179]">
              ₹{formatINR(travelPerPerson)} × {travellerText(numTravellers)} × 2{' '}
              {copy.roundTripFormula}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-[#eee3d6] pt-4">
          <div className="flex items-center justify-between font-serif text-lg font-bold text-[#5d1726]">
            <span>{copy.total}</span>
            <span className="text-xl font-bold text-[#6f1d2b]">₹{formatINR(totalVal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-[#766d65]">
            <span>{copy.costPerPerson}</span>
            <span className="font-semibold text-[#3d6846]">₹{formatINR(perPersonVal)}</span>
          </div>
        </div>

        <p className="mt-4 border-t border-dashed border-[#eadfce] pt-3 text-xs italic text-[#8b8179]">
          * {copy.estimateNote}
        </p>
      </div>
    </div>
  )
}
