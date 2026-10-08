// Content configs for the destination landing pages, each rendered through
// ./DestinationLanding.jsx. One object per public route. Copy is deliberately
// in data, not JSX, so a page is a thin wrapper and all four stay consistent.
//
// COMPLIANCE: JackpotsWorld refers guests to third-party offline casino
// destinations; it does not operate a casino or run games. Wording stays on
// that line ("explore", "discover", "connect with", "participating partners")
// and every page's FAQ states it. See DestinationLanding.jsx's header.

import {
  Sparkles, Crown, Hotel, Plane, Headphones, Spade, Gem,
  Building2, Car, LayoutGrid,
} from 'lucide-react'

// ── Shared blocks (identical across pages, so defined once) ───────────────────
const WHY_US = {
  eyebrow: 'Why Us',
  title: 'Why Choose JackpotsWorld?',
  cards: [
    { Icon: Gem, title: 'Premium Casino Destinations', desc: 'Explore selected casino destinations through our international partner network.' },
    { Icon: Crown, title: 'VIP Experiences', desc: 'Discover premium packages designed around hospitality and destination experiences.' },
    { Icon: Plane, title: 'Travel & Hospitality', desc: 'Explore accommodation and travel-related services connected with selected packages.' },
    { Icon: Headphones, title: 'Guest Support', desc: 'Get assistance before and during your destination planning.' },
    { Icon: LayoutGrid, title: 'One Platform', desc: 'Discover casino destinations, packages and related travel services through one platform.' },
  ],
}

const VIP_BENEFITS = [
  'Premium hospitality', 'Hotel accommodation options', 'Travel coordination',
  'Guest assistance', 'Partner benefits', 'Exclusive JackpotsWorld benefits', 'VIP support',
]

const steps = (destination) => ({
  eyebrow: 'How It Works',
  title: 'How JackpotsWorld Works',
  items: [
    { title: 'Explore', desc: `Browse available casino destinations and experiences in ${destination}.` },
    { title: 'Choose Your Experience', desc: 'Select a destination or package based on your preferred casino, hospitality and travel requirements.' },
    { title: 'Contact JackpotsWorld', desc: 'Contact our team to check availability, package details and applicable terms.' },
    { title: 'Confirm Your Package', desc: 'Review the available services, inclusions and conditions before confirming your arrangements.' },
    { title: `Experience ${destination}`, desc: `Travel to ${destination} and enjoy your confirmed casino and destination experience.` },
  ],
})

const hotelsTravel = (destination) => ([
  {
    Icon: Building2, title: 'Hotels and Accommodation',
    para: `A casino trip can be part of a complete travel experience. JackpotsWorld can help guests explore accommodation options connected with selected casino destinations and packages in ${destination}. Depending on availability, guests may be able to explore:`,
    bullets: ['Premium hotels', 'Convenient accommodation', 'VIP hospitality options', 'Hotel packages', 'Travel coordination', 'Destination support'],
    closing: 'Accommodation availability depends on the selected destination and package.',
  },
  {
    Icon: Car, title: 'Travel Assistance',
    para: 'Planning an international casino trip involves more than choosing a destination. JackpotsWorld helps simplify the planning process by connecting guests with relevant travel and destination services. Depending on your selected package, assistance may be available for:',
    bullets: ['Hotel arrangements', 'Travel coordination', 'Transportation', 'Destination information', 'Guest support', 'Package coordination'],
    closing: 'Our team can help you understand what is included before you confirm your package.',
  },
])

const enquiryDisclaimer = 'JackpotsWorld is a referral and travel platform that connects guests with third-party casino destinations and related services. Gaming facilities are operated by the respective casino operators, and availability, benefits and eligibility vary by destination.'

// ── 1. Casino in Sri Lanka (/casino-in-sri-lanka) ─────────────────────────────
export const sriLankaCasino = {
  path: '/casino-in-sri-lanka',
  breadcrumbName: 'Casino in Sri Lanka',
  seoFallbackTitle: 'Best Casino in Sri Lanka | Premium Casino Destinations & VIP Packages | JackpotsWorld',
  faqTitle: 'Sri Lanka Casino Destination FAQs',
  hero: {
    badge: 'Sri Lanka',
    h1: 'Best Casino in Sri Lanka',
    h1Sub: 'Premium Casino Destinations & VIP Experiences',
    leadParas: [
      'Discover premium casino destinations in Sri Lanka with JackpotsWorld. Explore selected casino experiences, VIP packages, accommodation options, travel assistance and exclusive destination benefits through our partner network.',
      'Whether you are planning a dedicated casino trip or combining entertainment with a luxury holiday, JackpotsWorld helps you discover and connect with casino destinations and related travel services in Sri Lanka.',
    ],
    ctas: [
      { kind: 'enquiry', label: 'Explore Casino Destinations', source: 'sri_lanka_hero', Icon: Sparkles },
      { kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'sri_lanka_vip_hero', variant: 'whatsapp', Icon: Crown, message: 'Hi! I’m interested in *VIP casino packages in Sri Lanka*. Please share more details.' },
    ],
  },
  intro: {
    eyebrow: 'Explore',
    title: 'Explore Casino Experiences in Sri Lanka',
    paras: [
      'Sri Lanka offers a unique combination of entertainment, hospitality, tourism and travel experiences. For visitors interested in casino destinations, the country provides an opportunity to combine a casino experience with hotels, restaurants, beaches and other attractions.',
      'JackpotsWorld connects guests with destination services, making it easier to explore available options before planning your trip. From premium casino experiences to VIP hospitality and travel assistance, our platform brings destination-related services together in one place.',
    ],
  },
  whyDestination: {
    eyebrow: 'The Destination',
    title: 'Why Choose Sri Lanka for a Casino Experience?',
    intro: 'Sri Lanka is an attractive destination for travellers who want to combine entertainment with a wider holiday experience. Visitors can enjoy a destination that offers:',
    bullets: ['Premium hospitality', 'Casino entertainment', 'Hotels and accommodation', 'Restaurants and dining', 'Beaches and tourism experiences', 'Local attractions', 'Travel and transportation options', 'VIP and premium experiences'],
    closing: 'With JackpotsWorld, you can explore available casino destinations and packages while planning the other parts of your trip.',
  },
  discover: {
    eyebrow: 'Discover',
    title: 'Discover Premium Casino Destinations',
    intro: 'JackpotsWorld works with selected third-party casino destinations and partners to help guests explore available experiences.',
    cards: [
      { Icon: Sparkles, title: 'Casino Experiences', desc: 'Explore participating casino destinations and understand the experiences and services available to guests.' },
      { Icon: Crown, title: 'VIP Packages', desc: 'Discover selected premium packages designed for guests looking for enhanced hospitality and destination services.' },
      { Icon: Hotel, title: 'Accommodation', desc: 'Explore hotel and accommodation options associated with selected packages and destinations.' },
      { Icon: Plane, title: 'Travel Assistance', desc: 'Get assistance with relevant travel and destination requirements where available.' },
      { Icon: Headphones, title: 'Guest Support', desc: 'Our support team can help you understand available destinations, packages and services before your trip.' },
    ],
  },
  vip: {
    eyebrow: 'VIP',
    title: 'VIP Casino Packages in Sri Lanka',
    intro: 'Looking for a more premium casino experience? JackpotsWorld provides access to selected VIP-oriented packages through participating partners. Depending on the destination and package, available benefits may include:',
    bullets: VIP_BENEFITS,
    closing: 'Package benefits, availability and eligibility can vary by destination. Contact JackpotsWorld to learn about the current packages available for your preferred destination.',
    cta: { kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'sri_lanka_vip', variant: 'whatsapp', Icon: Crown, message: 'Hi! I’m interested in *VIP casino packages in Sri Lanka*. Please share more details.' },
  },
  feature: {
    eyebrow: 'Poker',
    title: 'Poker in Sri Lanka',
    paras: [
      'Sri Lanka can also be explored by visitors interested in poker alongside wider casino entertainment. Through our partner network, JackpotsWorld helps guests discover available poker experiences at participating casino destinations.',
      'Both cash games and tournament play may be available depending on the venue. Poker availability, schedules, buy-ins, eligibility requirements and applicable conditions are set by each casino and can vary.',
      'If you are specifically looking for poker in Sri Lanka, contact our team to find out about currently available destinations, VIP poker packages and travel arrangements.',
    ],
    cta: { kind: 'enquiry', label: 'Enquire About Poker in Sri Lanka', source: 'sl_poker_section', message: 'Hi! I’m interested in *poker in Sri Lanka*. Please share more details.', Icon: Spade },
  },
  twoCol: hotelsTravel('Sri Lanka'),
  steps: steps('Sri Lanka'),
  whyUs: WHY_US,
  plan: {
    eyebrow: 'Plan',
    title: 'Plan Your Sri Lanka Casino Trip',
    intro: 'Whether you are travelling alone, with friends or as part of a VIP group, JackpotsWorld provides a convenient way to explore casino destinations and related services. You can explore available options based on:',
    bullets: ['Preferred casino destination', 'Travel dates', 'Accommodation requirements', 'VIP package preferences', 'Poker interests', 'Hospitality requirements', 'Travel services'],
    closing: 'Our team can help you understand available options before you make your travel arrangements.',
  },
  faqs: [
    { q: 'What is the best casino in Sri Lanka?', a: 'The best casino destination depends on your preferred location, casino experience, hospitality requirements and available packages. JackpotsWorld helps visitors explore selected casino destinations and partner experiences in Sri Lanka.' },
    { q: 'Does JackpotsWorld operate a casino in Sri Lanka?', a: 'No. JackpotsWorld is a platform that connects guests with casino destinations and related travel services. Gaming facilities are operated by the respective casino operators.' },
    { q: 'Can I book a VIP casino package in Sri Lanka?', a: 'Selected VIP packages may be available through participating partners. Package availability and benefits vary by destination. Contact JackpotsWorld for current options.' },
    { q: 'Can I find poker in Sri Lanka?', a: 'Poker availability depends on the individual casino destination and its current schedule and conditions. Contact JackpotsWorld for current information about available poker experiences.' },
    { q: 'Are poker tournaments available in Sri Lanka?', a: 'Tournament and cash-game availability, schedules and buy-ins are set by each casino and can vary. Contact JackpotsWorld to find out what is currently available at participating destinations.' },
    { q: 'Does JackpotsWorld provide hotel arrangements?', a: 'Hotel and accommodation assistance may be available with selected packages. Availability depends on the destination and package selected.' },
    { q: 'Can JackpotsWorld help with travel arrangements?', a: 'Travel-related assistance may be available depending on the selected package and destination. Contact our team to understand the services available.' },
    { q: 'Are casino packages available for international visitors?', a: 'Available packages and eligibility depend on the destination, partner and applicable local requirements. Guests should confirm the current terms before travelling.' },
    { q: 'How do I enquire about a Sri Lanka casino package?', a: 'Contact JackpotsWorld through the available enquiry channels on our website. Our team can provide information about current destinations, packages and available services.' },
  ],
  crossLinks: {
    eyebrow: 'More',
    title: 'Explore More JackpotsWorld Destinations',
    cards: [
      { Icon: Sparkles, title: 'Casino & Poker in Macau', desc: 'Discover premium casino and poker destinations, VIP experiences and travel packages in Macau.', label: 'Explore Macau', to: '/casino-macau' },
    ],
  },
  final: {
    title: 'Start Your Sri Lanka Experience',
    para: 'Discover premium casino destinations, VIP packages, hospitality and travel experiences with JackpotsWorld.',
    ctas: [
      { kind: 'enquiry', label: 'Explore Sri Lanka Casino Destinations', source: 'sri_lanka_final', Icon: Sparkles },
      { kind: 'enquiry', label: 'Contact JackpotsWorld', source: 'sri_lanka_contact', variant: 'whatsapp', Icon: Headphones, message: 'Hi! I’d like to get in touch with JackpotsWorld about casino destinations in Sri Lanka 🎰' },
    ],
    disclaimer: enquiryDisclaimer,
  },
}

// ── 3. Casino in Macau (/casino-macau) ────────────────────────────────────────
export const macauCasino = {
  path: '/casino-macau',
  breadcrumbName: 'Casino in Macau',
  seoFallbackTitle: 'Best Casino in Macau | Premium Casino Destinations & VIP Packages | JackpotsWorld',
  faqTitle: 'Macau Casino Destination FAQs',
  hero: {
    badge: 'Macau',
    h1: 'Best Casino in Macau',
    h1Sub: 'Premium Casino Destinations & VIP Experiences',
    leadParas: [
      'Discover premium casino destinations in Macau with JackpotsWorld. Explore selected casino experiences, VIP packages, accommodation options, travel assistance and exclusive destination benefits through our partner network.',
      'Whether you are planning a dedicated casino trip or combining entertainment with a luxury holiday, JackpotsWorld helps you discover and connect with casino destinations and related travel services in Macau.',
    ],
    ctas: [
      { kind: 'enquiry', label: 'Explore Casino Destinations', source: 'macau_hero', Icon: Sparkles },
      { kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'macau_vip_hero', variant: 'whatsapp', Icon: Crown, message: 'Hi! I’m interested in *VIP casino packages in Macau*. Please share more details.' },
    ],
  },
  intro: {
    eyebrow: 'Explore',
    title: 'Explore Casino Experiences in Macau',
    paras: [
      'Macau is one of the world’s best-known casino destinations, offering a combination of entertainment, hospitality, dining and travel experiences. For visitors interested in casino destinations, it provides an opportunity to combine a casino experience with hotels, restaurants, shows and other attractions.',
      'JackpotsWorld connects guests with destination services, making it easier to explore available options before planning your trip. From premium casino experiences to VIP hospitality and travel assistance, our platform brings destination-related services together in one place.',
    ],
  },
  whyDestination: {
    eyebrow: 'The Destination',
    title: 'Why Choose Macau for a Casino Experience?',
    intro: 'Macau is an attractive destination for travellers who want to combine entertainment with a wider holiday experience. Visitors can enjoy a destination that offers:',
    bullets: ['World-renowned casino entertainment', 'Premium hospitality', 'Hotels and resorts', 'Restaurants and fine dining', 'Shows and nightlife', 'Local attractions and heritage', 'Travel and transportation options', 'VIP and premium experiences'],
    closing: 'With JackpotsWorld, you can explore available casino destinations and packages while planning the other parts of your trip.',
  },
  discover: {
    eyebrow: 'Discover',
    title: 'Discover Premium Casino Destinations',
    intro: 'JackpotsWorld works with selected third-party casino destinations and partners to help guests explore available experiences in Macau.',
    cards: [
      { Icon: Sparkles, title: 'Casino Experiences', desc: 'Explore participating casino destinations and understand the experiences and services available to guests.' },
      { Icon: Crown, title: 'VIP Packages', desc: 'Discover selected premium packages designed for guests looking for enhanced hospitality and destination services.' },
      { Icon: Hotel, title: 'Accommodation', desc: 'Explore hotel and resort options associated with selected packages and destinations.' },
      { Icon: Plane, title: 'Travel Assistance', desc: 'Get assistance with relevant travel and destination requirements where available.' },
      { Icon: Headphones, title: 'Guest Support', desc: 'Our support team can help you understand available destinations, packages and services before your trip.' },
    ],
  },
  vip: {
    eyebrow: 'VIP',
    title: 'VIP Casino Packages in Macau',
    intro: 'Looking for a more premium casino experience? JackpotsWorld provides access to selected VIP-oriented packages through participating partners. Depending on the destination and package, available benefits may include:',
    bullets: VIP_BENEFITS,
    closing: 'Package benefits, availability and eligibility can vary by destination. Contact JackpotsWorld to learn about the current packages available for your preferred destination.',
    cta: { kind: 'enquiry', label: 'Enquire About VIP Packages', source: 'macau_vip', variant: 'whatsapp', Icon: Crown, message: 'Hi! I’m interested in *VIP casino packages in Macau*. Please share more details.' },
  },
  feature: {
    eyebrow: 'Poker',
    title: 'Poker in Macau',
    paras: [
      'Macau is also a natural stop for visitors interested in poker alongside wider casino entertainment. Through our partner network, JackpotsWorld helps guests discover available poker experiences at participating casino destinations.',
      'Both cash games and tournament play may be available depending on the venue. Poker availability, schedules, buy-ins, eligibility requirements and applicable conditions are set by each casino and can vary.',
      'If you are specifically looking for poker in Macau, contact our team to find out about currently available destinations, VIP poker packages and travel arrangements.',
    ],
    cta: { kind: 'enquiry', label: 'Enquire About Poker in Macau', source: 'macau_poker_section', message: 'Hi! I’m interested in *poker in Macau*. Please share more details.', Icon: Spade },
  },
  twoCol: hotelsTravel('Macau'),
  steps: steps('Macau'),
  whyUs: WHY_US,
  plan: {
    eyebrow: 'Plan',
    title: 'Plan Your Macau Casino Trip',
    intro: 'Whether you are travelling alone, with friends or as part of a VIP group, JackpotsWorld provides a convenient way to explore casino destinations and related services. You can explore available options based on:',
    bullets: ['Preferred casino destination', 'Travel dates', 'Accommodation requirements', 'VIP package preferences', 'Poker interests', 'Hospitality requirements', 'Travel services'],
    closing: 'Our team can help you understand available options before you make your travel arrangements.',
  },
  faqs: [
    { q: 'What is the best casino in Macau?', a: 'The best casino destination depends on your preferred location, casino experience, hospitality requirements and available packages. JackpotsWorld helps visitors explore selected casino destinations and partner experiences in Macau.' },
    { q: 'Does JackpotsWorld operate a casino in Macau?', a: 'No. JackpotsWorld is a platform that connects guests with casino destinations and related travel services. Gaming facilities are operated by the respective casino operators.' },
    { q: 'Can I book a VIP casino package in Macau?', a: 'Selected VIP packages may be available through participating partners. Package availability and benefits vary by destination. Contact JackpotsWorld for current options.' },
    { q: 'Can I find poker in Macau?', a: 'Poker availability depends on the individual casino destination and its current schedule and conditions. Contact JackpotsWorld for current information about available poker experiences.' },
    { q: 'Are poker tournaments available in Macau?', a: 'Tournament and cash-game availability, schedules and buy-ins are set by each casino and can vary. Contact JackpotsWorld to find out what is currently available at participating destinations.' },
    { q: 'Does JackpotsWorld provide hotel arrangements?', a: 'Hotel and accommodation assistance may be available with selected packages. Availability depends on the destination and package selected.' },
    { q: 'Can JackpotsWorld help with travel arrangements?', a: 'Travel-related assistance may be available depending on the selected package and destination. Contact our team to understand the services available.' },
    { q: 'Are casino packages available for international visitors?', a: 'Available packages and eligibility depend on the destination, partner and applicable local requirements. Guests should confirm the current terms before travelling.' },
    { q: 'How do I enquire about a Macau casino package?', a: 'Contact JackpotsWorld through the available enquiry channels on our website. Our team can provide information about current destinations, packages and available services.' },
  ],
  crossLinks: {
    eyebrow: 'More',
    title: 'Explore More JackpotsWorld Destinations',
    cards: [
      { Icon: Sparkles, title: 'Casino & Poker in Sri Lanka', desc: 'Explore premium casino and poker destinations, VIP experiences and travel packages in Sri Lanka.', label: 'Explore Sri Lanka', to: '/casino-in-sri-lanka' },
    ],
  },
  final: {
    title: 'Start Your Macau Experience',
    para: 'Discover premium casino destinations, VIP packages, hospitality and travel experiences with JackpotsWorld.',
    ctas: [
      { kind: 'enquiry', label: 'Explore Macau Casino Destinations', source: 'macau_final', Icon: Sparkles },
      { kind: 'enquiry', label: 'Contact JackpotsWorld', source: 'macau_contact', variant: 'whatsapp', Icon: Headphones, message: 'Hi! I’d like to get in touch with JackpotsWorld about casino destinations in Macau 🎰' },
    ],
    disclaimer: enquiryDisclaimer,
  },
}

