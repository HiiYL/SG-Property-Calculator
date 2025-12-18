import type { PropertyInputs } from '../types'
import { estimateMonthlyRental, estimateCurrentRent } from './calculations'

export const DEFAULT_PRICE = 1500000

export const DEFAULT_INPUTS: PropertyInputs = {
  price: DEFAULT_PRICE,
  residencyStatus: 'pr',
  propertyType: 'private',
  propertyNumber: 1,
  expectedRentalYield: 3.2,
  holdingPeriodYears: 5,
  annualAppreciation: 3.0,
  loanPercentage: 75,
  loanInterestRate: 2.6,
  loanTenureYears: 30,
  monthlyIncome: 15000,
  monthlyCondoFees: 300,
  isRentingOut: false,
  cashAvailable: 500000,
  cpfOaBalance: 150000,
  useCpfForDownpayment: true,
  useCpfForMonthly: false,
  existingMonthlyDebt: 0,
  marginalTaxRate: 15,
  currentMonthlyRent: estimateCurrentRent(DEFAULT_PRICE),
  expectedMonthlyRental: estimateMonthlyRental(DEFAULT_PRICE),
  rentOutRoom: false,
  roomRentalIncome: 1500,
  annualWorkIncome: 185000,
  agentFeePercent: 2,
  prevailingInterestRate: 2.8,
  loanLockInYears: 2,
  includeRenovation: false,
  renovationCost: 50000,
  vacancyWeeksPerYear: 4,
}

export const TAX_BRACKETS = [
  { value: 0, label: '0% (≤$20k)' },
  { value: 2, label: '2% ($20-30k)' },
  { value: 3.5, label: '3.5% ($30-40k)' },
  { value: 7, label: '7% ($40-80k)' },
  { value: 11.5, label: '11.5% ($80-120k)' },
  { value: 15, label: '15% ($120-160k)' },
  { value: 18, label: '18% ($160-200k)' },
  { value: 19, label: '19% ($200-240k)' },
  { value: 19.5, label: '19.5% ($240-280k)' },
  { value: 20, label: '20% ($280-320k)' },
  { value: 22, label: '22% ($320-500k)' },
  { value: 23, label: '23% ($500k-1M)' },
  { value: 24, label: '24% (>$1M)' },
]
