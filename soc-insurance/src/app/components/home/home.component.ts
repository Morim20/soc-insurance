import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../../services/auth.service';
import { EmployeeService } from '../../services/employee.service';
import { Employee, EmployeeBasicInfo, EmploymentInfo, InsuranceStatus, Dependent, SpecialAttributes, EmployeeFullInfo } from '../../models/employee.model';
import { RouterModule, Router } from '@angular/router';
import { Timestamp } from 'firebase/firestore';

function convertIfTimestamp(val: any): Date | undefined {
  if (val instanceof Timestamp) {
    return val.toDate();
  }
  if (val instanceof Date) {
    return val;
  }
  return undefined;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    RouterModule
  ]
})
export class HomeComponent implements OnInit {
  currentUser: EmployeeFullInfo | null = null;
  isAdmin = false;

  constructor(
    private authService: AuthService,
    private employeeService: EmployeeService,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.authService.getCurrentUser();
    this.isAdmin = await this.authService.isAdmin();
    if (user && user.id) {
      const id = user.id;
      const [basicInfo, employmentInfo, insuranceStatus, dependents, specialAttributes] = await Promise.all([
        this.employeeService.getBasicInfo(id),
        this.employeeService.getEmploymentInfo(id),
        this.employeeService.getInsuranceStatus(id),
        this.employeeService.getDependents(id),
        this.employeeService.getSpecialAttributes(id)
      ]);
      this.currentUser = {
        ...user,
        employeeBasicInfo: basicInfo!,
        employmentInfo: employmentInfo!,
        insuranceStatus: insuranceStatus!,
        dependents: dependents!,
        specialAttributes: specialAttributes!
      };
    }
  }

  isDate(val: any): boolean {
    return val instanceof Date;
  }

  logout(): void {
    this.authService.logout();
  }

  navigateToAdminVerification() {
    this.router.navigate(['/admin-login']);
  }

  navigateToAdmin() {
    this.router.navigate(['/admin']);
  }
}