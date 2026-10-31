# Karnataka Travel Planner

An AI-powered travel planner for Karnataka that turns a traveller's interests, time, budget and group into a complete trip: how to reach from their home city, where to stay, what to eat, and a day-wise plan with Kannada phrases. Available in English, Kannada and Hindi.

**Live demo:** https://karnataka-travel-planner.vercel.app/ (no login required)

## Problem statement chosen

Kannada Technology Challenge, Problem Statement 6: **AI Travel Planner for Karnataka**. Create personalized Karnataka itineraries based on a traveller's interests, available time, budget and preferred type of experience.

## How it works

1. The user enters: starting city, interests, number of days, total group budget, number of travellers, travelling as (solo, couple, family, friends) and experience type.
2. The app shows 3-4 destination cards ranked from our Karnataka dataset (interests, experience, days). This step uses no AI, so it is instant.
3. The user picks a card. Gemini then builds the full plan for that destination only, using our verified attraction data.
4. The server calculates every cost itself (entry, food, stay, local transport, round-trip travel, total, per person) and warns if the budget is exceeded.

## Features

- Destination cards, so a traveller sees several places across Karnataka and chooses one
- Full trip from the home city: journey timeline, travel options with duration and cost, stay, local transport, food plan
- Day-wise itinerary with timings, entry fees, and a different Kannada phrase for each day
- Cost breakdown calculated in code (not by the AI), with the formula shown for each line
- Group-aware planning: room count and plan style change for solo, couple, family and friends
- English, Kannada and Hindi interface and plan text
- Retry and fallback model, input validation and basic rate limiting

## Tech stack

- Next.js (App Router), TypeScript, Tailwind CSS
- Google Gemini API via the official `@google/genai` SDK
- JSON datasets: `data/destinations.json` (attractions, fees, timings, source links) and `data/phrases.json` (Kannada phrases with Hindi and English meanings)
- Deployed on Vercel

## Architecture

```
Browser (form + cards + plan)
   |
   |-- POST /api/destinations  -> ranks destination clusters from the JSON data (no AI)
   |
   '-- POST /api/itinerary     -> validates input, sends the chosen cluster's data to Gemini,
                                  checks the response, computes all costs, returns the plan
```

## Project structure

```
app/api/destinations/route.ts   destination ranking (no AI)
app/api/itinerary/route.ts      plan generation, validation, cost calculation
app/page.tsx                    main page
components/destination-cards.tsx
lib/clusters.ts                 destination groups and scoring
lib/generateItinerary.ts        client calls to the API
lib/translations.ts             English, Kannada and Hindi text
data/destinations.json          attraction data with sources
data/phrases.json               Kannada phrases
```

## Setup

```bash
git clone https://github.com/praveen4425/karnataka-travel-planner.git
cd karnataka-travel-planner
npm install
cp .env.example .env.local     # on Windows PowerShell: Copy-Item .env.example .env.local
```

Open `.env.local` and fill in:

```
GEMINI_API_KEY=your_key_from_Google_AI_Studio
GEMINI_MODEL=model_name
GEMINI_FALLBACK_MODEL=another_model_name
```

Then run:

```bash
npm run dev
```

Open http://localhost:3000. Never commit `.env.local`.

## Data accuracy and limitations

- Entry fees and timings come from official pages (Karnataka Tourism, ASI) where available. Each attraction stores its `source` link and a `verified` flag. Unverified values are marked as estimates in the plan.
- Train, bus and flight options, stay, food and local transport prices are AI estimates, not live data, and are labelled as estimates in the app.
- Wildlife safari data (for example Bandipur) is not included yet because the fees could not be verified.

## Future scope

- Live data: IRCTC and bus APIs, hotel prices, weather and festival dates
- Multi-city circuits for longer trips
- More destinations and verified fees
- Voice input and Kannada text-to-speech for phrases
- Saving and sharing a plan
