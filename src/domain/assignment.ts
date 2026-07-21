export function assignmentOverlay(cash: number, multiple: number, existingObligation: number, putPrice: number) {
  const budget = Math.max(0, cash * multiple)
  const available = budget - existingObligation
  const contractCost = Math.max(0, putPrice * 100)
  return {
    budget,
    available,
    contractCost,
    wholeContractsFeasible: contractCost > 0 ? Math.max(0, Math.floor(available / contractCost)) : 0,
    theoreticalZeroEquityFloor: budget > 0 ? existingObligation / budget : 0,
  }
}
