import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AuthService } from '../services/auth.service';
import { EmployeeFullInfo } from '../models/employee.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule],
  template: `
    <div class="home-container">
      <mat-card class="welcome-card">
        <mat-card-header>
          <mat-card-title>ようこそ</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p>{{ currentUser?.employeeBasicInfo?.lastNameKanji }}{{ currentUser?.employeeBasicInfo?.firstNameKanji }}さん</p>
          <div class="info-section">
            <h3>基本情報</h3>
            <p>雇用形態: {{ currentUser?.employmentInfo?.employmentType }}</p>
            <p>勤務開始日: {{ currentUser?.employmentInfo?.startDate | date:'yyyy/MM/dd' }}</p>
          </div>
          <div class="info-section">
            <h3>保険情報</h3>
            <p>健康保険: {{ currentUser?.insuranceStatus?.healthInsurance ? '加入' : '未加入' }}</p>
            <p>厚生年金: {{ currentUser?.insuranceStatus?.pensionInsurance ? '加入' : '未加入' }}</p>
          </div>
        </mat-card-content>
        <mat-card-actions>
          <button mat-raised-button color="warn" (click)="logout()">ログアウト</button>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: [`
    .home-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .welcome-card {
      margin-bottom: 20px;
    }
    .info-section {
      margin: 20px 0;
      padding: 15px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    h3 {
      margin-top: 0;
      color: #333;
    }
    mat-card-actions {
      padding: 16px;
      display: flex;
      justify-content: flex-end;
    }
  `]
})
export class HomeComponent implements OnInit {
  currentUser: EmployeeFullInfo | null = null;

  constructor(private authService: AuthService) {}

  async ngOnInit() {
    const user = this.authService.getCurrentUser();
    if (user) {
      const basicInfo = await this.authService.getEmployeeBasicInfo(user.id);
      const employmentInfo = await this.authService.getEmploymentInfo(user.id);
      const insuranceStatus = await this.authService.getInsuranceStatus(user.id);
      const specialAttributes = await this.authService.getSpecialAttributes(user.id);

      if (basicInfo && employmentInfo && insuranceStatus && specialAttributes) {
        this.currentUser = {
          ...user,
          employeeBasicInfo: basicInfo,
          employmentInfo: employmentInfo,
          insuranceStatus: insuranceStatus,
          dependents: [],
          specialAttributes: specialAttributes
        };
      }
    }
  }

  logout(): void {
    this.authService.logout();
  }
} 