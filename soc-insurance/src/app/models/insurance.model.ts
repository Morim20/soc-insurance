export interface InsuranceData {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  standardMonthlyRemuneration: number;
  grade?: number;
  newGrade?: number | null;
  baseSalary?: number;
  healthInsuranceEmployee: number;
  healthInsuranceEmployer: number;
  nursingInsuranceEmployee: number;
  nursingInsuranceEmployer: number;
  pensionInsuranceEmployee: number;
  pensionInsuranceEmployer: number;
  childContribution: number;
  employeeTotalDeduction: number;
  period: {
    year: number;
    month: number;
  };
  age: number;
  isNursingInsuranceEligible: boolean;
  standardMonthlyWage?: number | null;
  bonusAmount?: number | null;
  standardBonusAmount?: number | null;
  bonusHealthInsuranceEmployee?: number | null;
  bonusHealthInsuranceEmployer?: number | null;
  bonusNursingInsuranceEmployee?: number | null;
  bonusNursingInsuranceEmployer?: number | null;
  bonusPensionInsuranceEmployee?: number | null;
  bonusPensionInsuranceEmployer?: number | null;
  bonusChildContribution?: number | null;
  notes?: string;
  variableWage?: number | null;
  insuranceEligibility?: any; // 共通判定用（InsuranceEligibilityResult型にしてもOK）
} 