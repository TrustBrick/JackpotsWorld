// src/hooks/useEnquiryNumber.js
import { useEffect, useState } from 'react'
import { getEnquiryNumber, getEnquiryNumberSync } from '../services/enquiryContact'

/**
 * The WhatsApp number this visitor's enquiry buttons should open.
 *
 * Renders immediately with the best answer we already have (the default, or a
 * country detected earlier this session) and swaps in the detected number once
 * the lookup resolves. That way a slow geolocation response never leaves a
 * button without a destination, and it can only ever change to the Sri Lanka
 * number — every other country resolves to the value already on screen.
 */
export default function useEnquiryNumber() {
  const [number, setNumber] = useState(getEnquiryNumberSync)

  useEffect(() => {
    let cancelled = false
    getEnquiryNumber().then(resolved => {
      if (!cancelled) setNumber(resolved)
    })
    return () => { cancelled = true }
  }, [])

  return number
}
