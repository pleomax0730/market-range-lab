export function assignmentOverlay(cash: number, multiple: number, existingObligation: number, putPrice: number) {
  const inputs = { cash, multiple, existingObligation, putPrice }
  const errors = Object.entries(inputs).flatMap(([field, value]) => Number.isFinite(value) && value >= 0 ? [] : [`${field} must be a finite nonnegative number.`])
  if (errors.length) return { valid: false, errors, budget: 0, available: 0, contractCost: 0, wholeContractsFeasible: 0, theoreticalZeroEquityFloor: 0 }
  const budget = cash * multiple
  const available = budget - existingObligation
  const contractCost = putPrice * 100
  return {
    valid: true,
    errors,
    budget,
    available,
    contractCost,
    wholeContractsFeasible: contractCost > 0 ? Math.max(0, Math.floor(available / contractCost)) : 0,
    theoreticalZeroEquityFloor: budget > 0 ? existingObligation / budget : 0,
  }
}
