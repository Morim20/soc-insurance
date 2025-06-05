import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';
import { Employee, EmployeeBasicInfo, EmploymentInfo } from '../../models/employee.model';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

interface EmployeeListItem {
  id?: string;
  employeeId?: string; // 社員番号
  fullName?: string;   // 氏名
  department?: string; // 部署（現状空欄）
  startDate?: Date;    // 入社年月日
}

@Component({
  selector: 'app-employees-list',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './employees-list.component.html',
  styleUrl: './employees-list.component.scss'
})
export class EmployeesListComponent implements OnInit {
  employees: EmployeeListItem[] = [];
  isLoading = true;
  error: string | null = null;

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
          startDate: emp.employmentInfo.startDate || undefined
        }))
        .sort((a, b) => {
          // 社員番号が未設定の場合は最後に表示
          if (!a.employeeId) return 1;
          if (!b.employeeId) return -1;
          // 社員番号でソート
          return a.employeeId.localeCompare(b.employeeId);
        });
    } catch (err) {
      this.error = '従業員データの取得に失敗しました。';
      console.error('Error loading employees:', err);
    } finally {
      this.isLoading = false;
    }
  }

  onAddEmployee() {
    this.router.navigate(['/admin/employees/new']);
  }
}
