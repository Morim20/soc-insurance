export interface InsuranceData {
  id: string;
  employeeId: string;
  fullName: string;
  department: string;
  standardMonthlyRemuneration: number;
  grade?: number;
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
  notes?: string;
} 