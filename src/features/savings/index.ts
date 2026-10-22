export { SavingsProvider, useSavings } from './savings-context';
export type { SavingsCreateInput } from './savings-context';
export {
  SavingsApiError,
  createSavingsGoal,
  deleteSavingsGoal,
  listSavingsGoals,
  updateSavingsGoal,
} from './api';
export type { SavingsApiErrorCode, SavingsGoalPatch } from './api';
export {
  MASKED_SAVINGS_PERCENT,
  NAME_MAX_LENGTH,
  availableWallets,
  dateLabel,
  daysUntil,
  estimatePerMonth,
  formatTargetDate,
  hasSavingsErrors,
  hiddenGoalCount,
  normalizeSavingsName,
  pickDashboardGoal,
  progressPercent,
  remainingAmount,
  ringFillFor,
  savingsStatus,
  sortSavingsGoals,
  validateSavingsGoal,
} from './domain';
export type {
  SavingsGoal,
  SavingsGoalFieldErrors,
  SavingsGoalInput,
  SavingsGoalValidationOptions,
  SavingsGoalView,
  SavingsStatus,
} from './domain';
export { SavingsRing } from './components/savings-ring';
