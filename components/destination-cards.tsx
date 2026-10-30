'use client'

import {
  CalendarDays,
  Clock,
  Sparkles,
  Utensils,
  MapPin,
  Check,
  Info,
} from 'lucide-react'
import type { DestinationCard } from '@/lib/clusters'
import type { Translation } from '@/lib/translations'

interface DestinationCardsProps {
  cards: DestinationCard[]
  selectedId: string | null
  noExactMatch: boolean
  onSelect: (id: string) => void
  copy: Translation
  isPlanLoading?: boolean
}

export function DestinationCards({
  cards,
  selectedId,
  noExactMatch,
  onSelect,
  copy,
  isPlanLoading,
}: DestinationCardsProps) {
  if (!cards || cards.length === 0) return null

  return (
    <section aria-labelledby="cards-heading" className="w-full">
      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 id="cards-heading" className="font-serif text-2xl font-bold text-[#5d1726]">
          {copy.destinationCardsTitle}
        </h2>
      </div>

      {noExactMatch && (
        <div
          role="note"
          className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#eeddc8] bg-[#fdf6ec] p-3.5 text-xs text-[#7d5626]"
        >
          <Info className="mt-0.5 size-4 shrink-0 text-[#b4771d]" aria-hidden="true" />
          <p className="leading-relaxed">{copy.noExactMatchNote}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card, index) => {
          const isSelected = selectedId === card.id
          const isDisabled = Boolean(isPlanLoading && !isSelected)
          const daysText =
            card.suggestedDaysMin === card.suggestedDaysMax
              ? `${card.suggestedDaysMin} ${
                  card.suggestedDaysMin === 1 ? copy.daySingular : copy.days
                }`
              : `${card.suggestedDaysMin}-${card.suggestedDaysMax} ${copy.days}`

          const localizedInterests = card.matchedInterests
            .map((item) => copy.interests[item as keyof typeof copy.interests] || item)
            .join(', ')

          return (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                if (isPlanLoading) return
                onSelect(card.id)
              }}
              aria-pressed={isSelected}
              disabled={isDisabled}
              aria-disabled={isDisabled}
              className={`group flex flex-col justify-between rounded-2xl border p-5 text-left transition-all ${
                isSelected
                  ? 'border-[#6f1d2b] bg-[#fffaf5] ring-2 ring-[#6f1d2b] shadow-md'
                  : isDisabled
                  ? 'border-[#e7d9c8] bg-[#fffdf9] opacity-50 cursor-not-allowed'
                  : 'border-[#e7d9c8] bg-[#fffdf9] hover:border-[#b4771d] hover:shadow-sm'
              }`}
            >
              <div className="w-full">
                {/* Header: Name and optional Top pick badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-serif text-lg font-bold text-[#5d1726] group-hover:text-[#6f1d2b]">
                    {card.name}
                  </h3>
                  {index === 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f8e8bd] px-2.5 py-0.5 text-xs font-bold text-[#9b6c18]">
                      <Sparkles className="size-3" aria-hidden="true" />
                      {copy.topPickBadge}
                    </span>
                  )}
                </div>

                {/* Duration & Best Time */}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#71675f]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-[#443b35]">
                    <CalendarDays className="size-3.5 text-[#9b6c18]" aria-hidden="true" />
                    {daysText}
                  </span>
                  {card.bestTime && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5 text-[#9d9289]" aria-hidden="true" />
                      <span>
                        {copy.bestTimeLabel}: {card.bestTime}
                      </span>
                    </span>
                  )}
                </div>

                {/* Highlights */}
                {card.highlights && card.highlights.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#8b8179]">
                      {copy.highlightsLabel}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-[#4e453e]">
                      {card.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 size-3 shrink-0 text-[#b4771d]" aria-hidden="true" />
                          <span className="line-clamp-1">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Food recommendation */}
                {card.food && (
                  <div className="mt-3 text-xs text-[#61564e]">
                    <span className="font-bold text-[#443b35]">
                      <Utensils className="mr-1 inline size-3 text-[#9b6c18]" aria-hidden="true" />
                      {copy.tryFoodLabel}:{' '}
                    </span>
                    <span className="line-clamp-1">{card.food}</span>
                  </div>
                )}

                {/* Matched Interests */}
                {card.matchedInterests && card.matchedInterests.length > 0 && (
                  <div className="mt-2 text-xs text-[#3d6846]">
                    <span className="font-medium">
                      <Sparkles className="mr-1 inline size-3 text-[#3d6846]" aria-hidden="true" />
                      {copy.matchesInterestLabel}:{' '}
                    </span>
                    <span className="font-semibold">{localizedInterests}</span>
                  </div>
                )}
              </div>

              {/* Card Footer Button Indicator */}
              <div className="mt-4 flex items-center justify-between border-t border-[#f0e6d8] pt-3 text-xs font-bold">
                {isSelected ? (
                  <span className="inline-flex items-center gap-1 text-[#6f1d2b]">
                    <Check className="size-3.5" aria-hidden="true" />
                    {copy.planThisTripButton}
                  </span>
                ) : (
                  <span className="text-[#8b8179] group-hover:text-[#6f1d2b]">
                    {copy.planThisTripButton} &rarr;
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
