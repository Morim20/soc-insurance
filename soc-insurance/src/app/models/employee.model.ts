export interface Employee {
  id: string;
  companyId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface EmployeeBasicInfo {
  employeeId: string;
  lastNameKanji: string;
  firstNameKanji: string;
  lastNameKana?: string;
  firstNameKana?: string;
  lastNameRoman?: string;
  firstNameRoman?: string;
  birthDate: Date | null;
  hireDate: Date | null;
  gender?: string;
  address?: string;
  myNumber?: string;
  phoneNumber?: string;
  role: 'user' | 'admin';
  department?: string;
}

export interface EmploymentInfo {
  employmentType: '正社員' | '契約社員' | 'パート' | 'アルバイト';
  startDate: Date | null;
  endDate: Date | null;
  weeklyHours: number;
  baseSalary: number;
  monthlyWorkDays: number;
  expectedEmploymentPeriod?: string;
  expectedEmploymentMonths?: number;
  isStudent: boolean;
  studentType?: string;
  grade: number;
  allowances: number;
  commutingAllowance: number;
  commuteRoute?: string;
  commutePassCost?: number;
  bonusAmount?: number;
  bonusCount?: number;
  department?: string;
  oneWayFare: number;
  standardMonthlyRevisionDate?: Date | null;
  hasRenewalClause?: boolean;
  contractType?: string;
}

export interface InsuranceStatus {
  healthInsurance: boolean;
  nursingInsurance: boolean;
  pensionInsurance: boolean;
  qualificationAcquisitionDate: Date | null;
  qualificationLossDate: Date | null;
  insuranceType: '協会けんぽ' | '健保組合';
  remunerationCurrency: number;
  remunerationInKind?: string;
  standardMonthlyRevisionDate: Date | null;
  insuranceQualificationDate: Date | null;
  grade: number | null;
  standardMonthlyWage: number | null;
  newGrade?: number | null;
  newStandardMonthlyWage?: number | null;
  newRevisionDate?: Date | null;
}

export interface Dependent {
  hasDependents: boolean;
  name: string;
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  myNumber?: string;
  birthDate: Date | null;
  relationship: '配偶者' | '子' | '父' | '母' | 'その他';
  relationshipOther?: string;
  income: number;
  residency: '国内' | '海外';
  cohabitation: '同居' | '別居';
  occupation?: string;
  schoolGrade?: string;
  occupationOther?: string;
}

export interface SpecialAttributes {
  leaveType?: string;
  leaveStartDate: Date | null;
  leaveEndDate: Date | null;
  isOver70: boolean;
  pensionExempt: boolean;
  reached70Date: Date | null;
  isShortTimeWorker: boolean;
  monthlyIncome: number;
  residencyCertificateLocation?: string;
  assignmentAllowance: number;
  cohabitationWithFamily: boolean;
  bonusPaymentDates?: string[];
}

export interface EmployeeFullInfo extends Employee {
  employeeBasicInfo: EmployeeBasicInfo;
  employmentInfo: EmploymentInfo;
  insuranceStatus: InsuranceStatus;
  dependents: Dependent[];
  specialAttributes: SpecialAttributes;
}

export interface Company {
  companyName: string;
  representativeName: string;
  establishmentDate: Date | null;
  employeeCount: number;
  actualEmployeeCount: number;
  headOfficeAddress: string;
} 