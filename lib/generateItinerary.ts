export type ItineraryInput = {
  interests: string[]
  days: number
  budget: number
  experience: string
  language: 'en' | 'kn' | 'hi'
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

export type Itinerary = {
  destination: string
  summary: string
  days: ItineraryDay[]
  totalCost: number
}

export async function generateItinerary(input: ItineraryInput): Promise<Itinerary> {
  // This mock keeps the UI ready for a future API replacement.
  void input

  return {
    destination: 'Mysuru, Karnataka',
    summary: 'A gentle two-day introduction to royal heritage, gardens, and local flavours.',
    days: [
      {
        day: 1,
        title: 'Royal Mysuru',
        subtitle: 'Palaces, markets & evening lights',
        stops: [
          { place: 'Mysuru Palace', time: '9:00 AM – 11:30 AM', cost: 200, description: 'Walk through the opulent Wadiyar palace halls.' },
          { place: 'Devaraja Market', time: '12:00 PM – 1:00 PM', cost: 250, description: 'Browse flowers, spices, and seasonal produce.' },
          { place: 'St. Philomena’s Cathedral', time: '3:00 PM – 4:00 PM', cost: 0, description: 'Take in the neo-Gothic architecture and quiet interiors.' },
          { place: 'Palace illumination', time: '7:00 PM – 8:00 PM', cost: 0, description: 'See the palace glow golden after sunset.' },
        ],
        foodTip: 'Try a crisp Mysuru masala dosa with filter coffee near the market.',
        phrase: { kannada: 'ನಮಸ್ಕಾರ', transliteration: 'Namaskāra', meaning: 'Hello / Greetings' },
      },
      {
        day: 2,
        title: 'Green & Serene',
        subtitle: 'Hilltop views, art & garden calm',
        stops: [
          { place: 'Chamundi Hill', time: '7:00 AM – 10:00 AM', cost: 100, description: 'Start early for sweeping views and the hilltop temple.' },
          { place: 'Sand Sculpture Museum', time: '11:00 AM – 12:00 PM', cost: 40, description: 'See playful scenes built entirely from sand.' },
          { place: 'Karanji Lake Nature Park', time: '2:00 PM – 4:30 PM', cost: 70, description: 'Stroll beside the lake and spot colourful birds.' },
          { place: 'Brindavan Gardens', time: '5:30 PM – 8:00 PM', cost: 150, description: 'End with musical fountains and landscaped terraces.' },
        ],
        foodTip: 'Save room for Mysuru pak, the city’s famous soft, ghee-rich sweet.',
        phrase: { kannada: 'ಧನ್ಯವಾದಗಳು', transliteration: 'Dhanyavādagaḷu', meaning: 'Thank you' },
      },
    ],
    totalCost: 810,
  }
}
