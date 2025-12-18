export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-SG', { 
    style: 'currency', 
    currency: 'SGD', 
    maximumFractionDigits: 0 
  }).format(value)
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`
}
