import type { PropertyInputs } from '../types'

const COMPRESSED_KEYS: Record<keyof PropertyInputs, string> = {
  price: 'p',
  residencyStatus: 'rs',
  propertyType: 'pt',
  propertyNumber: 'pn',
  expectedRentalYield: 'ry',
  holdingPeriodYears: 'hp',
  annualAppreciation: 'aa',
  loanPercentage: 'lp',
  loanInterestRate: 'lr',
  loanTenureYears: 'lt',
  monthlyIncome: 'mi',
  monthlyCondoFees: 'cf',
  isRentingOut: 'ro',
  cashAvailable: 'ca',
  cpfOaBalance: 'cpf',
  useCpfForDownpayment: 'cd',
  useCpfForMonthly: 'cm',
  existingMonthlyDebt: 'ed',
  marginalTaxRate: 'tr',
  currentMonthlyRent: 'cr',
  expectedMonthlyRental: 'er',
  rentOutRoom: 'rr',
  roomRentalIncome: 'ri',
  annualWorkIncome: 'wi',
  agentFeePercent: 'af',
  prevailingInterestRate: 'pr',
  loanLockInYears: 'll',
  includeRenovation: 'ir',
  renovationCost: 'rc',
  vacancyWeeksPerYear: 'vw',
}

const REVERSE_KEYS = Object.fromEntries(
  Object.entries(COMPRESSED_KEYS).map(([k, v]) => [v, k])
) as Record<string, keyof PropertyInputs>

export function encodeStateToUrl(inputs: PropertyInputs): string {
  const params = new URLSearchParams()
  
  for (const [key, value] of Object.entries(inputs)) {
    const shortKey = COMPRESSED_KEYS[key as keyof PropertyInputs]
    if (shortKey) {
      if (typeof value === 'boolean') {
        params.set(shortKey, value ? '1' : '0')
      } else {
        params.set(shortKey, String(value))
      }
    }
  }
  
  return params.toString()
}

export function decodeStateFromUrl(
  searchParams: URLSearchParams,
  defaults: PropertyInputs
): PropertyInputs {
  const result = { ...defaults }
  
  for (const [shortKey, value] of searchParams.entries()) {
    const fullKey = REVERSE_KEYS[shortKey]
    if (fullKey && fullKey in defaults) {
      const defaultValue = defaults[fullKey]
      
      if (typeof defaultValue === 'boolean') {
        (result as Record<string, unknown>)[fullKey] = value === '1'
      } else if (typeof defaultValue === 'number') {
        const parsed = parseFloat(value)
        if (!isNaN(parsed)) {
          (result as Record<string, unknown>)[fullKey] = parsed
        }
      } else {
        (result as Record<string, unknown>)[fullKey] = value
      }
    }
  }
  
  return result
}

export function updateUrlWithState(inputs: PropertyInputs): void {
  const encoded = encodeStateToUrl(inputs)
  const newUrl = `${window.location.pathname}?${encoded}`
  window.history.replaceState(null, '', newUrl)
}

export function getShareableUrl(inputs: PropertyInputs): string {
  const encoded = encodeStateToUrl(inputs)
  return `${window.location.origin}${window.location.pathname}?${encoded}`
}
