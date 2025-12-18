import type { ResidencyStatus, PropertyNumber } from '../types'

// BSD rates (Feb 2023 onwards - from IRAS)
// First $180k: 1%, Next $180k: 2%, Next $640k: 3%, Next $500k: 4%, Next $1.5M: 5%, Above $3M: 6%
export function calculateBSD(price: number): number {
  let bsd = 0
  if (price > 0) bsd += Math.min(price, 180000) * 0.01
  if (price > 180000) bsd += Math.min(price - 180000, 180000) * 0.02
  if (price > 360000) bsd += Math.min(price - 360000, 640000) * 0.03
  if (price > 1000000) bsd += Math.min(price - 1000000, 500000) * 0.04
  if (price > 1500000) bsd += Math.min(price - 1500000, 1500000) * 0.05
  if (price > 3000000) bsd += (price - 3000000) * 0.06
  return bsd
}

// ABSD rates (April 2023 onwards - verified from IRAS/PropertyGuru)
export function calculateABSD(price: number, status: ResidencyStatus, propertyNumber: PropertyNumber): number {
  let rate = 0
  if (status === 'citizen') {
    if (propertyNumber === 1) rate = 0
    else if (propertyNumber === 2) rate = 0.20
    else rate = 0.30 // 3rd and subsequent
  } else if (status === 'pr') {
    if (propertyNumber === 1) rate = 0.05
    else if (propertyNumber === 2) rate = 0.30
    else rate = 0.35 // 3rd and subsequent
  } else {
    rate = 0.60 // Foreigners - any property
  }
  return price * rate
}

// Get ABSD rate for display
export function getABSDRate(status: ResidencyStatus, propertyNumber: PropertyNumber): number {
  if (status === 'citizen') {
    if (propertyNumber === 1) return 0
    else if (propertyNumber === 2) return 20
    else return 30
  } else if (status === 'pr') {
    if (propertyNumber === 1) return 5
    else if (propertyNumber === 2) return 30
    else return 35
  } else {
    return 60
  }
}

// Legal/conveyancing fees estimate (based on market research)
export function calculateLegalFees(price: number): number {
  if (price <= 1000000) return 2500
  if (price <= 2000000) return 3000
  if (price <= 3000000) return 3500
  return 5000
}

// SSD rates (if selling within 3 years of purchase)
export function calculateSSD(price: number, yearsHeld: number): number {
  if (yearsHeld >= 3) return 0
  if (yearsHeld < 1) return price * 0.12
  if (yearsHeld < 2) return price * 0.08
  return price * 0.04
}

// Property tax calculation based on Annual Value (IRAS 2024 rates)
export function calculatePropertyTax(annualRent: number, isOwnerOccupied: boolean): number {
  const av = annualRent
  
  if (isOwnerOccupied) {
    let tax = 0
    if (av > 0) tax += Math.min(av, 8000) * 0
    if (av > 8000) tax += Math.min(av - 8000, 22000) * 0.04
    if (av > 30000) tax += Math.min(av - 30000, 10000) * 0.06
    if (av > 40000) tax += Math.min(av - 40000, 15000) * 0.10
    if (av > 55000) tax += Math.min(av - 55000, 15000) * 0.14
    if (av > 70000) tax += Math.min(av - 70000, 15000) * 0.20
    if (av > 85000) tax += Math.min(av - 85000, 15000) * 0.26
    if (av > 100000) tax += (av - 100000) * 0.32
    return tax
  } else {
    let tax = 0
    if (av > 0) tax += Math.min(av, 30000) * 0.12
    if (av > 30000) tax += Math.min(av - 30000, 15000) * 0.20
    if (av > 45000) tax += Math.min(av - 45000, 15000) * 0.28
    if (av > 60000) tax += (av - 60000) * 0.36
    return tax
  }
}

// Monthly loan payment (PMT formula)
export function calculateMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal === 0) return 0
  if (annualRate === 0) return principal / (years * 12)
  const monthlyRate = annualRate / 100 / 12
  const numPayments = years * 12
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1)
}

// TDSR check (Total Debt Servicing Ratio - max 55% of gross monthly income)
export function calculateTDSR(monthlyPayment: number, existingDebt: number, monthlyIncome: number): number {
  if (monthlyIncome === 0) return 0
  return ((monthlyPayment + existingDebt) / monthlyIncome) * 100
}

// CPF accrued interest calculation (2.5% p.a. compounding)
export function calculateCpfAccruedInterest(cpfUsed: number, years: number): number {
  if (cpfUsed === 0 || years === 0) return 0
  return cpfUsed * (Math.pow(1.025, years) - 1)
}

// Rental income tax calculation (Singapore progressive rates with 15% deemed expenses)
export function calculateRentalIncomeTax(grossRent: number, mortgageInterest: number, marginalTaxRate: number): number {
  const deemedExpenses = grossRent * 0.15
  const taxableIncome = Math.max(0, grossRent - deemedExpenses - mortgageInterest)
  return taxableIncome * (marginalTaxRate / 100)
}

// Estimate monthly rental based on property price (Singapore market data 2024)
export function estimateMonthlyRental(price: number): number {
  const avgYield = 0.032 // 3.2% average gross yield
  return Math.round((price * avgYield) / 12 / 100) * 100
}

// Estimate current rent based on property price
export function estimateCurrentRent(price: number): number {
  const rentMultiplier = 0.035 // ~3.5%
  return Math.round((price * rentMultiplier) / 12 / 100) * 100
}

// Calculate maximum affordable property price based on financial position
export function calculateMaxAffordablePrice(
  cashAvailable: number,
  cpfOaBalance: number,
  monthlyIncome: number,
  existingDebt: number,
  loanPercentage: number,
  interestRate: number,
  loanTenure: number
): number {
  const downpaymentPercent = (100 - loanPercentage) / 100
  const maxFromCashCpf = (cashAvailable + cpfOaBalance * 0.95) / (downpaymentPercent + 0.05)
  
  const maxMonthlyPayment = monthlyIncome * 0.55 - existingDebt
  if (maxMonthlyPayment <= 0) return 0
  
  const monthlyRate = interestRate / 100 / 12
  const numPayments = loanTenure * 12
  const maxLoan = monthlyRate > 0
    ? maxMonthlyPayment * (1 - Math.pow(1 + monthlyRate, -numPayments)) / monthlyRate
    : maxMonthlyPayment * numPayments
  const maxFromTDSR = maxLoan / (loanPercentage / 100)
  
  return Math.floor(Math.min(maxFromCashCpf, maxFromTDSR) / 50000) * 50000
}
