import { useState, useMemo, useEffect } from 'react'
import { Building2, TrendingUp, Calculator, Info, ChevronDown, ChevronUp, AlertTriangle, Clock, RotateCcw } from 'lucide-react'

import type { PropertyInputs } from './types'
import {
  calculateBSD,
  calculateABSD,
  getABSDRate,
  calculateLegalFees,
  calculateSSD,
  calculatePropertyTax,
  calculateMonthlyPayment,
  calculateTDSR,
  calculateCpfAccruedInterest,
  calculateRentalIncomeTax,
  estimateMonthlyRental,
  estimateCurrentRent,
  calculateMaxAffordablePrice,
} from './utils/calculations'
import { formatCurrency, formatPercent } from './utils/format'
import { DEFAULT_INPUTS, TAX_BRACKETS } from './utils/constants'
import { decodeStateFromUrl, updateUrlWithState } from './utils/url-state'
import { Tooltip, Toggle } from './components/ui'
import { ShareButton } from './components/ShareButton'


function getInitialInputs(): PropertyInputs {
  if (typeof window !== 'undefined') {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.toString()) {
      return decodeStateFromUrl(searchParams, DEFAULT_INPUTS)
    }
  }
  return DEFAULT_INPUTS
}

function App() {
  const [inputs, setInputs] = useState<PropertyInputs>(getInitialInputs)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sync state to URL when inputs change
  useEffect(() => {
    updateUrlWithState(inputs)
  }, [inputs])

  const handleReset = () => {
    setInputs(DEFAULT_INPUTS)
    window.history.replaceState(null, '', window.location.pathname)
  }
  
  // Auto-update rental estimates when price changes
  const handlePriceChange = (newPrice: number) => {
    setInputs(prev => ({
      ...prev,
      price: newPrice,
      expectedMonthlyRental: estimateMonthlyRental(newPrice),
      currentMonthlyRent: estimateCurrentRent(newPrice),
    }))
  }

  const calculations = useMemo(() => {
    const { 
      price, residencyStatus, propertyNumber, holdingPeriodYears, 
      annualAppreciation, loanPercentage, loanInterestRate, loanTenureYears, 
      monthlyIncome, monthlyCondoFees, isRentingOut,
      cashAvailable, cpfOaBalance, useCpfForDownpayment, useCpfForMonthly,
      existingMonthlyDebt, marginalTaxRate,
      currentMonthlyRent, expectedMonthlyRental, rentOutRoom, roomRentalIncome,
      agentFeePercent, prevailingInterestRate,
      loanLockInYears, includeRenovation, renovationCost, vacancyWeeksPerYear
    } = inputs

    // === UPFRONT COSTS (BUYING) ===
    const bsd = calculateBSD(price)
    const absd = calculateABSD(price, residencyStatus, propertyNumber)
    const absdRate = getABSDRate(residencyStatus, propertyNumber)
    const legalFees = calculateLegalFees(price)
    const valuationFee = 500 // Property valuation
    const stampDutyOnMortgage = (price * loanPercentage / 100) * 0.004 // 0.4% of loan amount
    const fireInsurance = 150 // Annual fire insurance (mandatory for mortgage)
    const homeInsurance = 200 // Annual home contents insurance (recommended)
    // Note: Buyer's agent fee (new from July 2024) is typically waived, not included
    
    const totalStampDuty = bsd + absd
    const totalUpfrontCosts = totalStampDuty + legalFees + valuationFee + stampDutyOnMortgage + (includeRenovation ? renovationCost : 0)

    // Loan calculations
    const loanAmount = price * (loanPercentage / 100)
    const downPayment = price - loanAmount
    const monthlyPayment = calculateMonthlyPayment(loanAmount, loanInterestRate, loanTenureYears)
    const totalLoanPaymentsFullTenure = monthlyPayment * loanTenureYears * 12
    const totalInterestPaid = totalLoanPaymentsFullTenure - loanAmount

    // CPF usage calculations
    // For private property: Can use CPF for up to Valuation Limit (VL) or purchase price, whichever is lower
    // Simplified: assume can use CPF for downpayment (up to 20% from CPF, 5% must be cash for bank loan)
    const minCashDownpayment = price * 0.05 // 5% must be cash for bank loan
    const maxCpfForDownpayment = useCpfForDownpayment ? Math.min(cpfOaBalance, downPayment - minCashDownpayment) : 0
    const cpfUsedForDownpayment = Math.max(0, maxCpfForDownpayment)
    const cashForDownpayment = downPayment - cpfUsedForDownpayment
    
    // CPF for monthly payments (simplified - assume using CPF for loan payments)
    const monthlyFromCpf = useCpfForMonthly ? Math.min(monthlyPayment, cpfOaBalance / (loanTenureYears * 12)) : 0
    const totalCpfForMonthly = monthlyFromCpf * holdingPeriodYears * 12
    const totalCpfUsed = cpfUsedForDownpayment + totalCpfForMonthly
    
    // CPF accrued interest (2.5% p.a. compounding) - must refund when selling
    const cpfAccruedInterest = calculateCpfAccruedInterest(cpfUsedForDownpayment, holdingPeriodYears) +
      calculateCpfAccruedInterest(totalCpfForMonthly / 2, holdingPeriodYears / 2) // Simplified average for monthly
    const totalCpfRefund = totalCpfUsed + cpfAccruedInterest

    // TDSR check (includes existing debts)
    const tdsr = calculateTDSR(monthlyPayment, existingMonthlyDebt, monthlyIncome)
    const tdsrOk = tdsr <= 55
    const tdsrRemaining = 55 - tdsr // How much TDSR headroom left

    // Cash needed upfront (reduced by CPF usage)
    const cashNeeded = cashForDownpayment + totalUpfrontCosts

    // Affordability check
    const canAfford = cashAvailable >= cashNeeded && tdsrOk && (useCpfForDownpayment ? cpfOaBalance >= cpfUsedForDownpayment : true)
    const shortfall = canAfford ? 0 : Math.max(0, cashNeeded - cashAvailable)
    
    // Calculate maximum affordable price
    const maxAffordablePrice = calculateMaxAffordablePrice(
      cashAvailable,
      useCpfForDownpayment ? cpfOaBalance : 0,
      monthlyIncome,
      existingMonthlyDebt,
      loanPercentage,
      loanInterestRate,
      loanTenureYears
    )
    
    // Affordability ratio (how stretched are you?)
    const affordabilityRatio = maxAffordablePrice > 0 ? (price / maxAffordablePrice) * 100 : 100
    const isStretched = affordabilityRatio > 80
    const isOverStretched = affordabilityRatio > 100

    // === RENTAL / INCOME CALCULATIONS (from spreadsheet) ===
    
    // Rental income - use expectedMonthlyRental directly (more intuitive than yield %)
    const monthlyRentalIncome = isRentingOut ? expectedMonthlyRental : 0
    const annualRentalIncome = monthlyRentalIncome * 12
    
    // Room rental income (if staying in but renting out a room)
    const monthlyRoomIncome = (!isRentingOut && rentOutRoom) ? roomRentalIncome : 0
    const annualRoomIncome = monthlyRoomIncome * 12
    
    // Saved rental expense (if staying in, you save on rent you'd otherwise pay)
    const monthlySavedRent = !isRentingOut ? currentMonthlyRent : 0
    const annualSavedRent = monthlySavedRent * 12

    // Annual Value for property tax (based on potential rental income)
    const annualValue = expectedMonthlyRental * 12
    
    // Property tax (using actual IRAS rates)
    const annualPropertyTax = calculatePropertyTax(annualValue, !isRentingOut)

    // === INCOME TAX CALCULATIONS ===
    const annualMortgageInterest = totalInterestPaid / loanTenureYears
    
    // Rental income tax (only if renting out full property)
    const annualRentalTax = isRentingOut 
      ? calculateRentalIncomeTax(annualRentalIncome, annualMortgageInterest, marginalTaxRate)
      : 0
    
    // Room rental tax (if renting out room while staying)
    const annualRoomTax = (!isRentingOut && rentOutRoom)
      ? calculateRentalIncomeTax(annualRoomIncome, 0, marginalTaxRate)
      : 0
    
    const totalRentalTax = (annualRentalTax + annualRoomTax) * holdingPeriodYears

    // === HOLDING COSTS (Annual) ===
    const annualCondoFees = monthlyCondoFees * 12
    const annualRepairs = price * 0.01 // 1% for repairs/maintenance (industry standard)
    const annualInsurance = fireInsurance + homeInsurance // Fire + home insurance
    const annualMaintenance = annualCondoFees + annualRepairs + annualInsurance

    // Vacancy loss (if renting out)
    const vacancyLoss = isRentingOut ? (expectedMonthlyRental * vacancyWeeksPerYear / 4.33) : 0
    const effectiveAnnualRental = annualRentalIncome - vacancyLoss

    // === ANNUAL CASHFLOW (from spreadsheet) ===
    // Income: Rental (minus vacancy) OR (Saved rent + Room rental)
    const annualIncomeFromProperty = isRentingOut 
      ? effectiveAnnualRental 
      : annualSavedRent + annualRoomIncome
    
    // Expenses
    const annualLoanRepayment = monthlyPayment * 12
    
    // Net annual cashflow
    const annualNetCashflow = annualIncomeFromProperty 
      - annualPropertyTax 
      - (annualRentalTax + annualRoomTax)
      - annualLoanRepayment 
      - annualMaintenance

    // Monthly net (for display)
    const monthlyNetRental = annualNetCashflow / 12
    const annualNetRental = annualNetCashflow

    // === FUTURE VALUE / SELLING CALCULATIONS ===
    const futureValue = price * Math.pow(1 + annualAppreciation / 100, holdingPeriodYears)
    const capitalGain = futureValue - price
    const totalAppreciationPercent = (futureValue / price - 1) * 100

    // Remaining loan after N years (amortization calculation)
    const monthlyRate = loanInterestRate / 100 / 12
    const paymentsRemaining = (loanTenureYears - holdingPeriodYears) * 12
    const remainingLoan = paymentsRemaining > 0 && monthlyRate > 0
      ? monthlyPayment * (1 - Math.pow(1 + monthlyRate, -paymentsRemaining)) / monthlyRate
      : 0

    // === SELLING COSTS ===
    // Agent commission when selling (configurable %)
    const agentCommission = futureValue * (agentFeePercent / 100)
    
    // Legal fees for selling (~$2,500 for private property)
    const sellingLegalFees = 2500
    
    // Early loan repayment penalty (1.5% of outstanding loan if within lock-in period)
    const earlyRepaymentPenalty = holdingPeriodYears < loanLockInYears 
      ? remainingLoan * 0.015 
      : 0
    
    // SSD if selling early
    const ssd = calculateSSD(futureValue, holdingPeriodYears)
    const ssdApplies = holdingPeriodYears < 3

    // Total rental/saved income over holding period
    const totalRentalIncome = annualRentalIncome * holdingPeriodYears
    const totalSavedRent = annualSavedRent * holdingPeriodYears
    const totalRoomIncome = annualRoomIncome * holdingPeriodYears
    const totalIncomeFromProperty = annualIncomeFromProperty * holdingPeriodYears

    // Total costs over holding period
    const holdingCosts = (annualPropertyTax + annualMaintenance) * holdingPeriodYears
    const totalLoanPayments = annualLoanRepayment * Math.min(holdingPeriodYears, loanTenureYears)
    
    // Interest paid during holding period (more accurate calculation)
    const interestDuringHolding = totalLoanPayments - (loanAmount - remainingLoan)

    // === PRESENT VALUE / FUTURE VALUE OF CASHFLOWS ===
    const discountFactor = 1 / (1 + prevailingInterestRate / 100)
    
    // PV of N years of cashflow
    let pvCashflows = 0
    let fvCashflows = 0
    for (let year = 1; year <= holdingPeriodYears; year++) {
      pvCashflows += annualNetCashflow * Math.pow(discountFactor, year)
      fvCashflows += annualNetCashflow * Math.pow(1 + prevailingInterestRate / 100, holdingPeriodYears - year)
    }

    // === FINAL YIELD CALCULATION (from spreadsheet) ===
    // Total selling costs (agent + legal + SSD + early repayment penalty)
    const sellingCosts = ssd + agentCommission + sellingLegalFees + earlyRepaymentPenalty
    const salesIncome = futureValue - sellingCosts - remainingLoan
    
    // CPF refund reduces cash proceeds
    const cpfOpportunityCost = cpfAccruedInterest
    
    // Total investment = Initial expense + PV of negative cashflows
    const totalInitialExpense = totalUpfrontCosts + downPayment
    const pvNegativeCashflows = pvCashflows < 0 ? Math.abs(pvCashflows) : 0
    const totalInvestment = totalInitialExpense + pvNegativeCashflows
    
    // Total return = Sales income + FV of positive cashflows
    const fvPositiveCashflows = fvCashflows > 0 ? fvCashflows : 0
    const totalReturn = salesIncome + fvPositiveCashflows + (isRentingOut ? 0 : totalSavedRent)
    
    // Total vacancy loss over holding period
    const totalVacancyLoss = vacancyLoss * holdingPeriodYears
    
    // Net profit
    const netProfit = totalReturn - totalInvestment - cpfOpportunityCost

    // ROI
    const roi = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0
    const annualizedRoi = totalInvestment > 0 ? Math.pow(1 + netProfit / totalInvestment, 1 / holdingPeriodYears) - 1 : 0

    // Break-even analysis
    const breakEvenPrice = price + totalUpfrontCosts + holdingCosts + interestDuringHolding + sellingCosts + totalRentalTax - totalIncomeFromProperty

    // Compare with alternatives (using same cash investment)
    const cashInvestment = cashNeeded
    const stockReturn = cashInvestment * Math.pow(1.08, holdingPeriodYears) - cashInvestment
    const bondReturn = cashInvestment * Math.pow(1.04, holdingPeriodYears) - cashInvestment
    const savingsReturn = cashInvestment * Math.pow(1.025, holdingPeriodYears) - cashInvestment
    const reitReturn = cashInvestment * Math.pow(1.06, holdingPeriodYears) - cashInvestment
    
    // CPF OA return if left untouched (2.5% p.a.)
    const cpfReturn = useCpfForDownpayment 
      ? cpfUsedForDownpayment * (Math.pow(1.025, holdingPeriodYears) - 1)
      : 0
    
    // For display in comparison
    const totalCashInvestment = cashNeeded

    return {
      bsd,
      absd,
      absdRate,
      legalFees,
      valuationFee,
      stampDutyOnMortgage,
      totalStampDuty,
      totalUpfrontCosts,
      loanAmount,
      downPayment,
      monthlyPayment,
      totalInterestPaid,
      cashNeeded,
      annualRentalIncome,
      monthlyRentalIncome,
      annualPropertyTax,
      annualMaintenance,
      annualNetRental,
      monthlyNetRental,
      futureValue,
      capitalGain,
      totalRentalIncome,
      holdingCosts,
      interestDuringHolding,
      sellingCosts,
      agentCommission,
      netProfit,
      roi,
      annualizedRoi,
      stockReturn,
      bondReturn,
      savingsReturn,
      reitReturn,
      totalInvestment,
      ssd,
      ssdApplies,
      breakEvenPrice,
      tdsr,
      tdsrOk,
      // CPF related
      cpfUsedForDownpayment,
      cashForDownpayment,
      totalCpfUsed,
      cpfAccruedInterest,
      totalCpfRefund,
      cpfReturn,
      // Tax related
      annualRentalTax,
      totalRentalTax,
      annualRoomTax,
      // Affordability
      canAfford,
      shortfall,
      totalCashInvestment,
      minCashDownpayment,
      maxAffordablePrice,
      affordabilityRatio,
      isStretched,
      isOverStretched,
      tdsrRemaining,
      // New from spreadsheet
      monthlySavedRent,
      annualSavedRent,
      totalSavedRent,
      monthlyRoomIncome,
      annualRoomIncome,
      totalRoomIncome,
      annualNetCashflow,
      pvCashflows,
      fvCashflows,
      remainingLoan,
      salesIncome,
      totalReturn,
      totalAppreciationPercent,
      totalLoanPayments,
      totalIncomeFromProperty,
      // Additional realistic costs
      fireInsurance,
      homeInsurance,
      annualInsurance,
      vacancyLoss,
      totalVacancyLoss,
      effectiveAnnualRental,
      sellingLegalFees,
      earlyRepaymentPenalty,
      annualRepairs,
      annualCondoFees,
    }
  }, [inputs])

  const updateInput = <K extends keyof PropertyInputs>(key: K, value: PropertyInputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Building2 className="w-8 h-8 text-emerald-400" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                SG Property Calculator
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all text-sm"
                title="Reset to defaults"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </button>
              <ShareButton inputs={inputs} />
            </div>
          </div>
          <p className="text-slate-400 text-center">Calculate the true cost of buying property in Singapore</p>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {/* Affordability Status */}
          <div className={`backdrop-blur rounded-xl p-4 border ${
            calculations.canAfford 
              ? 'bg-emerald-500/10 border-emerald-500/30' 
              : 'bg-red-500/10 border-red-500/30'
          }`}>
            <p className="text-xs text-slate-400 mb-1">Affordability</p>
            <p className={`text-lg font-bold ${calculations.canAfford ? 'text-emerald-400' : 'text-red-400'}`}>
              {calculations.canAfford ? '✓ Can Afford' : '✗ Over Budget'}
            </p>
            <p className="text-xs text-slate-500">
              {Math.round(calculations.affordabilityRatio)}% of max
            </p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Cash Needed</p>
            <p className={`text-xl font-bold ${inputs.cashAvailable >= calculations.cashNeeded ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(calculations.cashNeeded)}
            </p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Monthly Payment</p>
            <p className="text-xl font-bold">{formatCurrency(calculations.monthlyPayment)}</p>
            <p className="text-xs text-slate-500">TDSR: {formatPercent(calculations.tdsr)}</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">{inputs.holdingPeriodYears}yr Net Profit</p>
            <p className={`text-xl font-bold ${calculations.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatCurrency(calculations.netProfit)}
            </p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur rounded-xl p-4 border border-slate-700">
            <p className="text-xs text-slate-400 mb-1">Annual ROI</p>
            <p className={`text-xl font-bold ${calculations.annualizedRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPercent(calculations.annualizedRoi * 100)}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Panel */}
          <div className="space-y-6">
            {/* Property Details */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                Property Details
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Property Price</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">S$</span>
                    <input
                      type="number"
                      value={inputs.price}
                      onChange={e => handlePriceChange(Number(e.target.value))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-3 pl-14 pr-4 text-2xl font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <input
                    type="range"
                    min="500000"
                    max="5000000"
                    step="50000"
                    value={inputs.price}
                    onChange={e => handlePriceChange(Number(e.target.value))}
                    className="w-full mt-2 accent-emerald-500"
                  />
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>S$500K</span>
                    <span>S$5M</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Residency Status</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['citizen', 'pr', 'foreigner'] as const).map(status => (
                      <button
                        key={status}
                        onClick={() => updateInput('residencyStatus', status)}
                        className={`py-3 px-4 rounded-xl font-medium transition-all ${
                          inputs.residencyStatus === status
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {status === 'citizen' ? 'Citizen' : status === 'pr' ? 'PR' : 'Foreigner'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Property Number
                    <Tooltip text="ABSD rates differ based on how many properties you own. 3rd+ property has higher rates." />
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map(num => (
                      <button
                        key={num}
                        onClick={() => updateInput('propertyNumber', num)}
                        className={`py-3 px-4 rounded-xl font-medium transition-all ${
                          inputs.propertyNumber === num
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                            : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {num === 1 ? '1st' : num === 2 ? '2nd' : '3rd+'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Mode - Stay In vs Rent Out */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4">How will you use this property?</h2>
              
              {/* Toggle Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => updateInput('isRentingOut', false)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    !inputs.isRentingOut 
                      ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/30' 
                      : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🏡</span>
                    <span className="font-semibold">Own Stay</span>
                  </div>
                  <p className="text-xs text-slate-400">Live in the property yourself</p>
                  <div className="mt-2 text-xs">
                    <span className="text-emerald-400">✓ Lower property tax</span>
                  </div>
                </button>
                
                <button
                  onClick={() => updateInput('isRentingOut', true)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    inputs.isRentingOut 
                      ? 'bg-purple-500/20 border-purple-500 ring-2 ring-purple-500/30' 
                      : 'bg-slate-700/30 border-slate-600 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🏠</span>
                    <span className="font-semibold">Rent Out</span>
                  </div>
                  <p className="text-xs text-slate-400">Rent to tenants for income</p>
                  <div className="mt-2 text-xs">
                    <span className="text-purple-400">✓ Passive income</span>
                  </div>
                </button>
              </div>
              
              {/* Mode-specific inputs */}
              <div className="space-y-4">
                {inputs.isRentingOut ? (
                  // Rent Out Mode
                  <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
                    <label className="block text-sm font-medium mb-3">
                      Expected Monthly Rental
                      <Tooltip text="Based on ~3.2% gross yield for Singapore condos. Adjust based on location and unit type." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">S$</span>
                      <input
                        type="number"
                        value={inputs.expectedMonthlyRental}
                        onChange={e => updateInput('expectedMonthlyRental', Number(e.target.value))}
                        className="w-full bg-slate-800/50 border border-purple-500/30 rounded-xl py-3 pl-14 pr-4 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs">
                      <span className="text-slate-400">Gross yield: <span className="text-purple-400 font-medium">{((inputs.expectedMonthlyRental * 12 / inputs.price) * 100).toFixed(2)}%</span></span>
                      <button 
                        onClick={() => updateInput('expectedMonthlyRental', estimateMonthlyRental(inputs.price))}
                        className="text-purple-400 hover:text-purple-300"
                      >
                        Reset to estimate
                      </button>
                    </div>
                  </div>
                ) : (
                  // Stay In Mode
                  <div className="space-y-4">
                    <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                      <label className="block text-sm font-medium mb-3">
                        Rent You'd Pay Otherwise
                        <Tooltip text="If you didn't buy, how much would you pay in rent? This 'saved expense' is counted as value gained from ownership." />
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">S$</span>
                        <input
                          type="number"
                          value={inputs.currentMonthlyRent}
                          onChange={e => updateInput('currentMonthlyRent', Number(e.target.value))}
                          className="w-full bg-slate-800/50 border border-emerald-500/30 rounded-xl py-3 pl-14 pr-4 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div className="flex justify-between mt-2 text-xs">
                        <span className="text-emerald-400">You save {formatCurrency(inputs.currentMonthlyRent * 12)}/year</span>
                        <button 
                          onClick={() => updateInput('currentMonthlyRent', estimateCurrentRent(inputs.price))}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          Reset to estimate
                        </button>
                      </div>
                    </div>
                    
                    {/* Room rental option */}
                    <div className={`rounded-xl p-4 border transition-all ${
                      inputs.rentOutRoom 
                        ? 'bg-cyan-500/10 border-cyan-500/30' 
                        : 'bg-slate-700/20 border-slate-600/50'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-medium">Rent out a room?</span>
                          <p className="text-xs text-slate-400">Earn extra income while living there</p>
                        </div>
                        <button
                          onClick={() => updateInput('rentOutRoom', !inputs.rentOutRoom)}
                          className={`relative w-14 h-7 rounded-full transition-all ${inputs.rentOutRoom ? 'bg-cyan-500' : 'bg-slate-600'}`}
                        >
                          <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${inputs.rentOutRoom ? 'translate-x-7' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      
                      {inputs.rentOutRoom && (
                        <div className="mt-3 pt-3 border-t border-cyan-500/20">
                          <label className="block text-xs text-slate-400 mb-2">Room Rental Income</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                            <input
                              type="number"
                              value={inputs.roomRentalIncome}
                              onChange={e => updateInput('roomRentalIncome', Number(e.target.value))}
                              className="w-full bg-slate-800/50 border border-cyan-500/30 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Market rent for property tax - only show in stay-in mode */}
                {!inputs.isRentingOut && (
                  <div className="bg-slate-700/20 rounded-xl p-4 border border-slate-600/50">
                    <label className="block text-xs text-slate-400 mb-2">
                      Market Rent (for Property Tax calculation)
                      <Tooltip text="IRAS calculates property tax based on potential rental value, even if you stay in." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                      <input
                        type="number"
                        value={inputs.expectedMonthlyRental}
                        onChange={e => updateInput('expectedMonthlyRental', Number(e.target.value))}
                        className="w-full bg-slate-800/50 border border-slate-600 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Annual Value: {formatCurrency(inputs.expectedMonthlyRental * 12)} → Tax: ~{formatCurrency(calculations.annualPropertyTax)}/yr</p>
                  </div>
                )}
              </div>
            </div>

            {/* Loan Details */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-cyan-400" />
                Loan Details
              </h2>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Loan-to-Value (LTV)</span>
                    <span className="text-white font-medium">{inputs.loanPercentage}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="75"
                    step="5"
                    value={inputs.loanPercentage}
                    onChange={e => updateInput('loanPercentage', Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Interest Rate (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={inputs.loanInterestRate}
                      onChange={e => updateInput('loanInterestRate', Number(e.target.value))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Tenure (years)</label>
                    <input
                      type="number"
                      value={inputs.loanTenureYears}
                      onChange={e => updateInput('loanTenureYears', Number(e.target.value))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Position */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-green-400" />
                Your Financial Position
              </h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Cash Available
                      <Tooltip text="Cash savings available for downpayment and upfront costs." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                      <input
                        type="number"
                        value={inputs.cashAvailable}
                        onChange={e => updateInput('cashAvailable', Number(e.target.value))}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      CPF OA Balance
                      <Tooltip text="Your CPF Ordinary Account balance. Can be used for downpayment and monthly loan payments." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                      <input
                        type="number"
                        value={inputs.cpfOaBalance}
                        onChange={e => updateInput('cpfOaBalance', Number(e.target.value))}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </div>

                {/* CPF Usage Options */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                    <span className="text-sm">
                      Use CPF for downpayment
                      <Tooltip text="Use CPF OA for downpayment. Note: 5% must be cash for bank loans. CPF used must be refunded with 2.5% accrued interest when selling." />
                    </span>
                    <Toggle 
                      enabled={inputs.useCpfForDownpayment} 
                      onChange={() => updateInput('useCpfForDownpayment', !inputs.useCpfForDownpayment)}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-xl">
                    <span className="text-sm">
                      Use CPF for monthly payments
                      <Tooltip text="Use CPF OA for monthly mortgage payments. Accrued interest applies." />
                    </span>
                    <Toggle 
                      enabled={inputs.useCpfForMonthly} 
                      onChange={() => updateInput('useCpfForMonthly', !inputs.useCpfForMonthly)}
                      size="sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Monthly Income
                      <Tooltip text="Gross monthly income. Used for TDSR calculation (max 55%)." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                      <input
                        type="number"
                        value={inputs.monthlyIncome}
                        onChange={e => updateInput('monthlyIncome', Number(e.target.value))}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Existing Monthly Debt
                      <Tooltip text="Car loans, credit cards, other mortgages. Affects TDSR." />
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                      <input
                        type="number"
                        value={inputs.existingMonthlyDebt}
                        onChange={e => updateInput('existingMonthlyDebt', Number(e.target.value))}
                        className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Marginal Tax Rate (%)
                    <Tooltip text="Your income tax bracket. Rental income is taxed at your marginal rate. Used to calculate rental income tax." />
                  </label>
                  <select
                    value={inputs.marginalTaxRate}
                    onChange={e => updateInput('marginalTaxRate', Number(e.target.value))}
                    className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {TAX_BRACKETS.map(bracket => (
                      <option key={bracket.value} value={bracket.value}>{bracket.label}</option>
                    ))}
                  </select>
                </div>

                {/* Affordability Meter */}
                <div className="mt-4 pt-4 border-t border-slate-600/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Affordability</span>
                    <span className={`text-sm font-semibold ${
                      calculations.affordabilityRatio <= 70 ? 'text-emerald-400' :
                      calculations.affordabilityRatio <= 90 ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {calculations.affordabilityRatio <= 70 ? '✓ Comfortable' :
                       calculations.affordabilityRatio <= 90 ? '⚠ Stretched' : '✗ Over Budget'}
                    </span>
                  </div>
                  
                  {/* Visual meter */}
                  <div className="relative h-3 bg-slate-700 rounded-full overflow-hidden mb-2">
                    <div 
                      className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                        calculations.affordabilityRatio <= 70 ? 'bg-emerald-500' :
                        calculations.affordabilityRatio <= 90 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, calculations.affordabilityRatio)}%` }}
                    />
                    {/* 80% marker */}
                    <div className="absolute top-0 h-full w-0.5 bg-slate-400" style={{ left: '80%' }} />
                  </div>
                  
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>S$0</span>
                    <span>Max: {formatCurrency(calculations.maxAffordablePrice)}</span>
                  </div>
                  
                  {/* Max affordable price highlight */}
                  <div className="mt-3 p-3 bg-slate-700/30 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Max you can afford</span>
                      <span className="text-lg font-bold text-white">{formatCurrency(calculations.maxAffordablePrice)}</span>
                    </div>
                    {calculations.maxAffordablePrice > inputs.price && (
                      <p className="text-xs text-emerald-400 mt-1">
                        ✓ You have {formatCurrency(calculations.maxAffordablePrice - inputs.price)} buffer
                      </p>
                    )}
                    {calculations.maxAffordablePrice < inputs.price && (
                      <p className="text-xs text-red-400 mt-1">
                        ✗ {formatCurrency(inputs.price - calculations.maxAffordablePrice)} over your max
                      </p>
                    )}
                    <button
                      onClick={() => handlePriceChange(calculations.maxAffordablePrice)}
                      className="mt-2 w-full py-2 text-xs font-medium bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                    >
                      Set price to max affordable
                    </button>
                  </div>
                </div>

                {/* TDSR & Cash Summary */}
                <div className={`p-4 rounded-xl ${calculations.canAfford ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">TDSR</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${calculations.tdsr <= 45 ? 'bg-emerald-500' : calculations.tdsr <= 55 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, (calculations.tdsr / 55) * 100)}%` }}
                          />
                        </div>
                        <span className={`font-semibold text-sm ${calculations.tdsrOk ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatPercent(calculations.tdsr)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Cash Required</span>
                      <span className={`font-semibold ${inputs.cashAvailable >= calculations.cashNeeded ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(calculations.cashNeeded)}
                      </span>
                    </div>
                    {inputs.useCpfForDownpayment && calculations.cpfUsedForDownpayment > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">CPF for Downpayment</span>
                        <span className="font-semibold text-cyan-400">{formatCurrency(calculations.cpfUsedForDownpayment)}</span>
                      </div>
                    )}
                    {!calculations.canAfford && calculations.shortfall > 0 && (
                      <p className="text-xs text-red-400 mt-1">💰 Need {formatCurrency(calculations.shortfall)} more cash</p>
                    )}
                    {!calculations.tdsrOk && (
                      <p className="text-xs text-red-400">📊 TDSR exceeded - reduce loan or increase income</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Costs */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-semibold mb-4">Monthly Costs</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Condo/Maintenance Fees</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                    <input
                      type="number"
                      value={inputs.monthlyCondoFees}
                      onChange={e => updateInput('monthlyCondoFees', Number(e.target.value))}
                      className="w-full bg-slate-700/50 border border-slate-600 rounded-xl py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Investment Assumptions */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between text-xl font-semibold"
              >
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  Investment Assumptions
                </span>
                {showAdvanced ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>

              {showAdvanced && (
                <div className="space-y-4 mt-4">
                  {/* Rental Yield - only show if renting out */}
                  {inputs.isRentingOut && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">
                          Expected Rental Yield
                          <Tooltip text="Gross rental yield. Singapore condos typically yield 2.5-4%. Based on 2024 market data." />
                        </span>
                        <span className="text-white font-medium">{inputs.expectedRentalYield}%</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="0.1"
                        value={inputs.expectedRentalYield}
                        onChange={e => updateInput('expectedRentalYield', Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                      <div className="flex justify-between text-xs text-slate-500 mt-1">
                        <span>1-bedder: ~4%</span>
                        <span>2-bedder: ~3.5%</span>
                        <span>3-bedder: ~3%</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">
                        Annual Appreciation
                        <Tooltip text="Historical SG property appreciation averages ~4.9% p.a. (CEIC data). Conservative estimate: 3-4%." />
                      </span>
                      <span className="text-white font-medium">{inputs.annualAppreciation}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="8"
                      step="0.5"
                      value={inputs.annualAppreciation}
                      onChange={e => updateInput('annualAppreciation', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">
                        Agent Fee (% of sale)
                        <Tooltip text="Commission paid to property agent when selling. Typically 1-2% of sale price." />
                      </span>
                      <span className="text-white font-medium">{inputs.agentFeePercent}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="3"
                      step="0.5"
                      value={inputs.agentFeePercent}
                      onChange={e => updateInput('agentFeePercent', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">Holding Period</span>
                      <span className="text-white font-medium">{inputs.holdingPeriodYears} years</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      step="1"
                      value={inputs.holdingPeriodYears}
                      onChange={e => updateInput('holdingPeriodYears', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                    {inputs.holdingPeriodYears < 3 && (
                      <p className="text-xs text-amber-400 mt-1">⚠️ SSD applies if selling within 3 years</p>
                    )}
                    {inputs.holdingPeriodYears < inputs.loanLockInYears && (
                      <p className="text-xs text-red-400 mt-1">⚠️ Early repayment penalty (1.5%) applies within {inputs.loanLockInYears}-year lock-in</p>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">
                        Loan Lock-in Period
                        <Tooltip text="Most bank loans have a 2-3 year lock-in. Selling within this period incurs 1.5% penalty on outstanding loan." />
                      </span>
                      <span className="text-white font-medium">{inputs.loanLockInYears} years</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="1"
                      value={inputs.loanLockInYears}
                      onChange={e => updateInput('loanLockInYears', Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  {inputs.isRentingOut && (
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">
                          Expected Vacancy
                          <Tooltip text="Realistic vacancy assumption when renting out. Industry standard is ~1 month/year for tenant turnover." />
                        </span>
                        <span className="text-white font-medium">{inputs.vacancyWeeksPerYear} weeks/year</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="1"
                        value={inputs.vacancyWeeksPerYear}
                        onChange={e => updateInput('vacancyWeeksPerYear', Number(e.target.value))}
                        className="w-full accent-amber-500"
                      />
                      <p className="text-xs text-slate-500 mt-1">Vacancy loss: ~{formatCurrency(calculations.vacancyLoss)}/year</p>
                    </div>
                  )}

                  {/* Renovation toggle */}
                  <div className="pt-4 border-t border-slate-600/50">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="font-medium">Include Renovation?</span>
                        <p className="text-xs text-slate-400">One-time cost for new/resale property</p>
                      </div>
                      <button
                        onClick={() => updateInput('includeRenovation', !inputs.includeRenovation)}
                        className={`relative w-14 h-7 rounded-full transition-all ${inputs.includeRenovation ? 'bg-amber-500' : 'bg-slate-600'}`}
                      >
                        <div className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-200 ${inputs.includeRenovation ? 'translate-x-7' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    
                    {inputs.includeRenovation && (
                      <div>
                        <label className="block text-xs text-slate-400 mb-2">Renovation Budget</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">S$</span>
                          <input
                            type="number"
                            value={inputs.renovationCost}
                            onChange={e => updateInput('renovationCost', Number(e.target.value))}
                            className="w-full bg-slate-700/50 border border-slate-600 rounded-lg py-2 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Typical: $30K-80K (resale), $50K-150K (new)</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Results Panel */}
          <div className="space-y-6">
            {/* Quick Summary Card */}
            <div className={`backdrop-blur rounded-2xl p-6 border ${
              inputs.isRentingOut 
                ? 'bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500/30'
                : 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-emerald-500/30'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  {inputs.isRentingOut ? '📊 Investment Summary' : '🏡 Purchase Summary'}
                </h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  calculations.canAfford && calculations.tdsrOk 
                    ? 'bg-emerald-500/20 text-emerald-400' 
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {calculations.canAfford && calculations.tdsrOk ? '✓ Affordable' : '⚠ Review Needed'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Cash Needed</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(calculations.cashNeeded)}</p>
                  {inputs.useCpfForDownpayment && calculations.cpfUsedForDownpayment > 0 && (
                    <p className="text-xs text-cyan-400">+ {formatCurrency(calculations.cpfUsedForDownpayment)} CPF</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Monthly Payment</p>
                  <p className="text-2xl font-bold text-white">{formatCurrency(calculations.monthlyPayment)}</p>
                  <p className="text-xs text-slate-500">TDSR: {formatPercent(calculations.tdsr)}</p>
                </div>
              </div>

              {/* Cashflow section - different for rent out vs stay in */}
              <div className="mt-4 pt-4 border-t border-slate-600/50 grid grid-cols-2 gap-4">
                {inputs.isRentingOut ? (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Monthly Rental</p>
                      <p className="text-lg font-semibold text-emerald-400">+{formatCurrency(calculations.monthlyRentalIncome)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Net Monthly Cashflow</p>
                      <p className={`text-lg font-semibold ${calculations.monthlyNetRental >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(calculations.monthlyNetRental)}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Saved Rent (Monthly)</p>
                      <p className="text-lg font-semibold text-emerald-400">+{formatCurrency(calculations.monthlySavedRent)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Net Monthly Cashflow</p>
                      <p className={`text-lg font-semibold ${calculations.monthlyNetRental >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(calculations.monthlyNetRental)}
                      </p>
                    </div>
                    {inputs.rentOutRoom && (
                      <>
                        <div>
                          <p className="text-xs text-slate-400 mb-1">Room Rental</p>
                          <p className="text-lg font-semibold text-cyan-400">+{formatCurrency(calculations.monthlyRoomIncome)}</p>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-600/50">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Projected Profit ({inputs.holdingPeriodYears} yrs)</p>
                    <p className={`text-2xl font-bold ${calculations.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(calculations.netProfit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 mb-1">Annualized ROI</p>
                    <p className={`text-2xl font-bold ${calculations.annualizedRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPercent(calculations.annualizedRoi * 100)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Breakdown */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">Upfront Costs Breakdown</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Down Payment ({100 - inputs.loanPercentage}%)</span>
                  <span>{formatCurrency(calculations.downPayment)}</span>
                </div>
                {inputs.useCpfForDownpayment && calculations.cpfUsedForDownpayment > 0 && (
                  <>
                    <div className="flex justify-between text-cyan-400 pl-4">
                      <span>└ From CPF OA</span>
                      <span>-{formatCurrency(calculations.cpfUsedForDownpayment)}</span>
                    </div>
                    <div className="flex justify-between pl-4">
                      <span className="text-slate-500">└ Cash portion (min 5%)</span>
                      <span>{formatCurrency(calculations.cashForDownpayment)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">BSD</span>
                  <span>{formatCurrency(calculations.bsd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className={calculations.absd > 0 ? 'text-red-400' : 'text-slate-400'}>ABSD ({calculations.absdRate}%)</span>
                  <span className={calculations.absd > 0 ? 'text-red-400' : ''}>{formatCurrency(calculations.absd)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Legal & Valuation</span>
                  <span>{formatCurrency(calculations.legalFees + calculations.valuationFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Stamp Duty on Mortgage</span>
                  <span>{formatCurrency(calculations.stampDutyOnMortgage)}</span>
                </div>
                <div className="border-t border-slate-600 pt-2 flex justify-between font-semibold">
                  <span>Total Cash Required</span>
                  <span className="text-emerald-400">{formatCurrency(calculations.cashNeeded)}</span>
                </div>
              </div>
            </div>

            {/* Annual Cashflow Breakdown (from spreadsheet) */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-4">Annual Cashflow</h3>
              <div className="space-y-2 text-sm">
                {/* Income */}
                <p className="text-xs text-slate-500 uppercase tracking-wide">Income</p>
                {inputs.isRentingOut ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Gross Rental Income</span>
                      <span className="text-emerald-400">+{formatCurrency(calculations.annualRentalIncome)}</span>
                    </div>
                    {calculations.vacancyLoss > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 pl-2">└ Vacancy loss ({inputs.vacancyWeeksPerYear} wks)</span>
                        <span className="text-red-400">-{formatCurrency(calculations.vacancyLoss)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Saved Rental Expense</span>
                      <span className="text-emerald-400">+{formatCurrency(calculations.annualSavedRent)}</span>
                    </div>
                    {inputs.rentOutRoom && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Room Rental Income</span>
                        <span className="text-cyan-400">+{formatCurrency(calculations.annualRoomIncome)}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Expenses */}
                <p className="text-xs text-slate-500 uppercase tracking-wide mt-3">Expenses</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Property Tax</span>
                  <span className="text-red-400">-{formatCurrency(calculations.annualPropertyTax)}</span>
                </div>
                {(calculations.annualRentalTax > 0 || calculations.annualRoomTax > 0) && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Income Tax on Rental</span>
                    <span className="text-red-400">-{formatCurrency(calculations.annualRentalTax + calculations.annualRoomTax)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Loan Repayment</span>
                  <span className="text-red-400">-{formatCurrency(calculations.monthlyPayment * 12)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Maintenance & Fees</span>
                  <span className="text-red-400">-{formatCurrency(calculations.annualMaintenance)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 pl-2">└ Condo fees</span>
                  <span className="text-slate-500">{formatCurrency(calculations.annualCondoFees)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 pl-2">└ Repairs (1% of value)</span>
                  <span className="text-slate-500">{formatCurrency(calculations.annualRepairs)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 pl-2">└ Insurance</span>
                  <span className="text-slate-500">{formatCurrency(calculations.annualInsurance)}</span>
                </div>
                
                <div className="border-t border-slate-600 pt-2 flex justify-between font-semibold">
                  <span>Net Annual Cashflow</span>
                  <span className={calculations.annualNetCashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {formatCurrency(calculations.annualNetCashflow)}
                  </span>
                </div>
              </div>
            </div>

            {/* CPF & Tax Impact */}
            {(inputs.useCpfForDownpayment || inputs.isRentingOut) && (
              <div className="bg-gradient-to-br from-cyan-500/10 to-purple-500/10 backdrop-blur rounded-2xl p-6 border border-cyan-500/30">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Info className="w-5 h-5 text-cyan-400" />
                  CPF & Tax Impact
                </h3>
                <div className="space-y-3">
                  {inputs.useCpfForDownpayment && calculations.cpfUsedForDownpayment > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">CPF Used (Total)</span>
                        <span className="text-cyan-400">{formatCurrency(calculations.totalCpfUsed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          CPF Accrued Interest (2.5% p.a.)
                          <Tooltip text="When you sell, you must refund CPF principal + accrued interest. This reduces your cash proceeds." />
                        </span>
                        <span className="text-amber-400">{formatCurrency(calculations.cpfAccruedInterest)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total CPF Refund on Sale</span>
                        <span className="text-red-400">{formatCurrency(calculations.totalCpfRefund)}</span>
                      </div>
                      <div className="text-xs text-slate-500 bg-slate-800/50 p-2 rounded-lg">
                        💡 If CPF was left in OA, it would have earned: {formatCurrency(calculations.cpfReturn)}
                      </div>
                    </>
                  )}
                  {inputs.isRentingOut && (
                    <>
                      <div className="border-t border-slate-600 pt-3 flex justify-between">
                        <span className="text-slate-400">
                          Annual Rental Income Tax
                          <Tooltip text="Rental income is taxed at your marginal rate. 15% deemed expenses + mortgage interest are deductible." />
                        </span>
                        <span className="text-red-400">-{formatCurrency(calculations.annualRentalTax)}/yr</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Total Rental Tax ({inputs.holdingPeriodYears} yrs)</span>
                        <span className="text-red-400">-{formatCurrency(calculations.totalRentalTax)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">
                          Property Tax (Non-owner)
                          <Tooltip text="Higher property tax rates apply for rental properties (12-36% of Annual Value vs 0-32% for owner-occupied)." />
                        </span>
                        <span className="text-red-400">-{formatCurrency(calculations.annualPropertyTax)}/yr</span>
                      </div>
                    </>
                  )}
                  {!inputs.isRentingOut && (
                    <div className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded-lg">
                      ✓ Owner-occupied: Lower property tax rates apply (0-32% vs 12-36% for rental)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Final Yield When Selling (from spreadsheet) */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 backdrop-blur rounded-2xl p-6 border border-amber-500/30">
              <h3 className="text-lg font-semibold mb-4">
                📈 Final Yield (Selling after {inputs.holdingPeriodYears} years)
              </h3>
              <div className="space-y-2 text-sm">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Sale Proceeds</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Future Sale Price (+{calculations.totalAppreciationPercent.toFixed(1)}%)</span>
                  <span className="text-emerald-400">+{formatCurrency(calculations.futureValue)}</span>
                </div>
                <p className="text-xs text-slate-500 uppercase tracking-wide mt-2">Selling Costs</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Agent Commission ({inputs.agentFeePercent}%)</span>
                  <span className="text-red-400">-{formatCurrency(calculations.agentCommission)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Legal Fees (Selling)</span>
                  <span className="text-red-400">-{formatCurrency(calculations.sellingLegalFees)}</span>
                </div>
                {calculations.ssd > 0 && (
                  <div className="flex justify-between">
                    <span className="text-amber-400">SSD ({inputs.holdingPeriodYears < 1 ? '12%' : inputs.holdingPeriodYears < 2 ? '8%' : '4%'})</span>
                    <span className="text-red-400">-{formatCurrency(calculations.ssd)}</span>
                  </div>
                )}
                {calculations.earlyRepaymentPenalty > 0 && (
                  <div className="flex justify-between">
                    <span className="text-amber-400">Early Repayment Penalty (1.5%)</span>
                    <span className="text-red-400">-{formatCurrency(calculations.earlyRepaymentPenalty)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining Loan</span>
                  <span className="text-red-400">-{formatCurrency(calculations.remainingLoan)}</span>
                </div>
                <div className="border-t border-slate-600 pt-2 flex justify-between">
                  <span className="font-medium">Net Sales Income</span>
                  <span className="text-white font-semibold">{formatCurrency(calculations.salesIncome)}</span>
                </div>

                <p className="text-xs text-slate-500 uppercase tracking-wide mt-4">Investment Summary</p>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Investment</span>
                  <span>{formatCurrency(calculations.totalInvestment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Return</span>
                  <span className="text-emerald-400">{formatCurrency(calculations.totalReturn)}</span>
                </div>
                {!inputs.isRentingOut && calculations.totalSavedRent > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 pl-2">└ Includes saved rent</span>
                    <span className="text-slate-500">{formatCurrency(calculations.totalSavedRent)}</span>
                  </div>
                )}
                {calculations.fvCashflows > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 pl-2">└ FV of positive cashflows</span>
                    <span className="text-slate-500">{formatCurrency(calculations.fvCashflows)}</span>
                  </div>
                )}
                
                <div className="border-t border-slate-600 pt-3 mt-2">
                  <div className="flex justify-between mb-2">
                    <span className="font-semibold">Net Profit</span>
                    <span className={`text-xl font-bold ${calculations.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(calculations.netProfit)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div className="bg-slate-800/50 p-3 rounded-xl text-center">
                      <p className="text-xs text-slate-400">Total Yield</p>
                      <p className={`text-lg font-bold ${calculations.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {calculations.roi.toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-slate-800/50 p-3 rounded-xl text-center">
                      <p className="text-xs text-slate-400">Annual Yield</p>
                      <p className={`text-lg font-bold ${calculations.annualizedRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatPercent(calculations.annualizedRoi * 100)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SSD Warning */}
            {calculations.ssdApplies && (
              <div className="bg-amber-500/10 backdrop-blur rounded-2xl p-5 border border-amber-500/30">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-400 mb-1">Seller's Stamp Duty (SSD) Applies</h3>
                    <p className="text-sm text-slate-300">
                      Selling within {inputs.holdingPeriodYears < 1 ? '1 year' : inputs.holdingPeriodYears < 2 ? '2 years' : '3 years'} incurs 
                      <span className="font-semibold text-amber-400"> {formatCurrency(calculations.ssd)}</span> SSD 
                      ({inputs.holdingPeriodYears < 1 ? '12%' : inputs.holdingPeriodYears < 2 ? '8%' : '4%'} of sale price).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Break-even Info */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-5 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-cyan-400" />
                <h3 className="font-semibold">Break-even Analysis</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Break-even Sale Price</p>
                  <p className="text-lg font-semibold">{formatCurrency(calculations.breakEvenPrice)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">Required Appreciation</p>
                  <p className="text-lg font-semibold">{formatPercent(((calculations.breakEvenPrice / inputs.price) - 1) * 100)}</p>
                </div>
              </div>
            </div>

            {/* Comparison with Visual Bars */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h3 className="text-lg font-semibold mb-2">Investment Comparison</h3>
              <p className="text-xs text-slate-400 mb-5">Projected returns on {formatCurrency(calculations.totalInvestment)} over {inputs.holdingPeriodYears} years</p>
              
              {(() => {
                const investments = [
                  { name: 'This Property', value: calculations.netProfit, color: 'bg-emerald-500', desc: 'Net of all costs' },
                  { name: 'S&P 500 Index', value: calculations.stockReturn, color: 'bg-blue-500', desc: '~8% p.a. historical' },
                  { name: 'S-REITs', value: calculations.reitReturn, color: 'bg-orange-500', desc: '~6% p.a. dividend + growth' },
                  { name: 'SGS Bonds', value: calculations.bondReturn, color: 'bg-purple-500', desc: '~4% p.a.' },
                  { name: 'Fixed Deposit', value: calculations.savingsReturn, color: 'bg-slate-500', desc: '~2.5% p.a.' },
                ]
                const maxValue = Math.max(...investments.map(i => Math.abs(i.value)), 1)
                
                return (
                  <div className="space-y-4">
                    {investments.map((inv, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <div>
                            <span className={idx === 0 ? 'font-medium' : 'text-slate-300'}>{inv.name}</span>
                            <span className="text-xs text-slate-500 ml-2">{inv.desc}</span>
                          </div>
                          <span className={`font-semibold ${inv.value >= 0 ? (idx === 0 ? 'text-emerald-400' : 'text-white') : 'text-red-400'}`}>
                            {formatCurrency(inv.value)}
                          </span>
                        </div>
                        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${inv.value >= 0 ? inv.color : 'bg-red-500'} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(2, (Math.abs(inv.value) / maxValue) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Winner indicator */}
              <div className="mt-5 pt-4 border-t border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">Best Option:</span>
                  <span className={`font-semibold ${
                    calculations.netProfit >= Math.max(calculations.stockReturn, calculations.reitReturn) ? 'text-emerald-400' : 
                    calculations.stockReturn >= calculations.reitReturn ? 'text-blue-400' : 'text-orange-400'
                  }`}>
                    {calculations.netProfit >= Math.max(calculations.stockReturn, calculations.reitReturn) ? 'Property Investment' : 
                     calculations.stockReturn >= calculations.reitReturn ? 'Stock Market' : 'S-REITs'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Note: Property offers leverage benefits not reflected in simple return comparison.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-slate-500 text-sm space-y-2">
          <p className="font-medium text-slate-400">Data Sources & Assumptions</p>
          <p>BSD/ABSD/SSD rates from IRAS (April 2023 onwards). Property tax rates from IRAS 2024.</p>
          <p>Rental yields based on 2024 market data (StackedHomes, DollarsAndSense). Historical appreciation ~4.9% p.a. (CEIC).</p>
          <p className="pt-2 text-slate-600">This calculator is for educational purposes only. Consult a qualified financial advisor.</p>
        </div>
      </div>
    </div>
  )
}

export default App
