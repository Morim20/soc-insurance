import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { Employee, EmployeeBasicInfo, EmploymentInfo } from '../../models/employee.model';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

interface EmployeeListItem {
  id?: string;
  employeeId?: string; // 社員番号
  fullName?: string;   // 氏名
  department?: string; // 部署（現状空欄）
  startDate?: Date;    // 入社年月日
  employmentType?: string; // 雇用形態を追加
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

  constructor(private employeeService: EmployeeService, public router: Router) {}

  async ngOnInit() {
    try {
      const employees = await this.employeeService.getAllEmployees();
      this.employees = employees
        .map(emp => ({
          id: emp.id,
          employeeId: emp.employeeBasicInfo.employeeId,
          fullName: `${emp.employeeBasicInfo.lastNameKanji} ${emp.employeeBasicInfo.firstNameKanji}`,
          department: emp.employmentInfo.department,
          startDate: emp.employmentInfo.startDate || undefined,
          employmentType: emp.employmentInfo.employmentType
        }))
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
}
