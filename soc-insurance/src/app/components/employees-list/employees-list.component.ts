import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { Employee, EmployeeBasicInfo, EmploymentInfo } from '../../models/employee.model';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InsuranceEligibilityService } from '../../services/insurance-eligibility.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

interface EmployeeListItem {
  id?: string;
  employeeId?: string; // 社員番号
  fullName?: string;   // 氏名
  department?: string; // 部署（現状空欄）
  startDate?: Date;    // 入社年月日
  employmentType?: string; // 雇用形態を追加
  insuranceEligible?: boolean; // 社会保険加入判定
  gradeSetCount?: number; // 等級が何個設定されているか
  endDate?: Date | null; // 退職予定日
}

@Component({
  selector: 'app-employees-list',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatSelectModule, FormsModule],
  templateUrl: './employees-list.component.html',
  styleUrl: './employees-list.component.scss'
})
export class EmployeesListComponent implements OnInit {
  employees: EmployeeListItem[] = [];
  employeesFiltered: EmployeeListItem[] = [];
  isLoading = true;
  error: string | null = null;

  // フィルタ用
  selectedEmploymentType: string = '';
  selectedDepartment: string = '';
  employmentTypeOptions: string[] = [];
  departmentOptions: string[] = [];

  constructor(
    private employeeService: EmployeeService,
    public router: Router,
    private insuranceEligibilityService: InsuranceEligibilityService,
    private firestore: Firestore
  ) {}

  // どんな型でもDate型に変換する安全な関数
  toDateSafe(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  async ngOnInit() {
    try {
      const employees = await this.employeeService.getAllEmployees();
      // 社会保険判定を並列で取得
      const eligibilityResults = await Promise.all(
        employees.map(async emp => {
          const today = new Date();
          const year = today.getFullYear();
          const month = today.getMonth() + 1;
          const officeEmployeeCount = await this.getOfficeEmployeeCount();
          return this.insuranceEligibilityService.getInsuranceEligibility(emp, year, month, officeEmployeeCount).toPromise();
        })
      );

      this.employees = employees
        .map((emp, idx) => {
          const grade = emp.insuranceStatus && emp.insuranceStatus.grade;
          const newGrade = emp.insuranceStatus && emp.insuranceStatus.newGrade;
          let count = 0;
          if (typeof grade === 'number' && grade > 0) count++;
          if (typeof grade === 'string' && grade !== '' && grade !== '未設定') count++;
          if (typeof newGrade === 'number' && newGrade > 0) count++;
          if (typeof newGrade === 'string' && newGrade !== '' && newGrade !== '未設定') count++;
          // 退職日の型を必ずDate型に
          const endDate = this.toDateSafe(emp.employmentInfo.endDate);
          const today = new Date();

          let insuranceEligible = eligibilityResults[idx]?.healthInsurance || eligibilityResults[idx]?.pensionInsurance || false;

          // 退職日が今月の場合は在籍月として保険料発生
          if (endDate) {
            // 退職日の翌日から未加入
            const endDatePlus1 = new Date(endDate);
            endDatePlus1.setDate(endDatePlus1.getDate() + 1);
            if (endDatePlus1 <= today) {
              insuranceEligible = false;
            } else {
              insuranceEligible = true;
            }
          }

          return {
            id: emp.id,
            employeeId: emp.employeeBasicInfo.employeeId,
            fullName: `${emp.employeeBasicInfo.lastNameKanji} ${emp.employeeBasicInfo.firstNameKanji}`,
            department: emp.employmentInfo.department,
            startDate: emp.employmentInfo.startDate || undefined,
            employmentType: emp.employmentInfo.employmentType,
            insuranceEligible: insuranceEligible,
            gradeSetCount: count,
            endDate: endDate
          };
        })
        .sort((a, b) => {
          // 社員番号が未設定の場合は最後に表示
          if (!a.employeeId) return 1;
          if (!b.employeeId) return -1;
          // 社員番号でソート
          return a.employeeId.localeCompare(b.employeeId);
        });
      // フィルタ候補リスト作成
      this.employmentTypeOptions = Array.from(new Set(this.employees.map(e => e.employmentType).filter(Boolean))) as string[];
      this.departmentOptions = Array.from(new Set(this.employees.map(e => e.department).filter(Boolean))) as string[];
      this.applyFilter();
    } catch (err) {
      this.error = '従業員データの取得に失敗しました。';
      console.error('Error loading employees:', err);
    } finally {
      this.isLoading = false;
    }
  }

  applyFilter() {
    this.employeesFiltered = this.employees.filter(emp => {
      const matchType = this.selectedEmploymentType ? emp.employmentType === this.selectedEmploymentType : true;
      const matchDept = this.selectedDepartment ? emp.department === this.selectedDepartment : true;
      return matchType && matchDept;
    });
  }

  onAddEmployee() {
    this.router.navigate(['/admin/employees/new']);
  }

  getInsuranceStatus(emp: EmployeeListItem): string {
    if (!emp.insuranceEligible) {
      return '×';
    }
    const today = new Date();
    if (emp.endDate) {
      const endDate = new Date(emp.endDate);
      const endDatePlus1 = new Date(endDate);
      endDatePlus1.setDate(endDatePlus1.getDate() + 1);
      if (endDatePlus1 <= today) {
        return '退職済み';
      }
      if (endDate.getFullYear() === today.getFullYear() && 
          endDate.getMonth() === today.getMonth() &&
          endDate.getDate() === today.getDate()) {
        return `本日退職`; // 退職当日は特別表示
      }
      if (endDate.getFullYear() === today.getFullYear() && 
          endDate.getMonth() === today.getMonth()) {
        return `今月${endDate.getDate()}日退職予定`;
      }
    }
    return '○';
  }

  getInsuranceStatusColor(emp: EmployeeListItem): string {
    if (!emp.insuranceEligible) {
      return 'red';
    }

    const today = new Date();
    if (emp.endDate) {
      const endDate = new Date(emp.endDate);
      if (endDate < today) {
        return 'gray';
      }
      if (endDate.getFullYear() === today.getFullYear() && 
          endDate.getMonth() === today.getMonth()) {
        return 'orange';
      }
    }

    return 'green';
  }

  async getOfficeEmployeeCount(): Promise<number> {
    const officeDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
    if (officeDoc.exists()) {
      return officeDoc.data()['actualEmployeeCount'] || 0;
    }
    return 0;
  }
}
