import DestinationLanding from './destinations/DestinationLanding'
import { sriLankaCasino } from './destinations/content'

// Thin wrapper — all markup lives in DestinationLanding; copy in content.js.
export default function CasinoInSriLanka() {
  return <DestinationLanding content={sriLankaCasino} />
}
