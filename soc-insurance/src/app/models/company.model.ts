export interface Company {
  id?: string;
  companyName: string;
  representativeName: string;
  establishmentDate: Date | undefined;
  employeeCount: number;
  headOfficeAddress: string;
  // 必要に応じて他のフィールドも追加可能
} 