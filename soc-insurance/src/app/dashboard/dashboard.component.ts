import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent {
  tasks = [
    { label: '未処理の手続き', value: 3 },
    { label: '今月の保険料計算締切', value: '5/25' },
  ];
  shortcuts = [
    { label: '従業員登録', route: '/employees/new' },
    { label: '保険料率設定', route: '/insurance-rate' },
    { label: 'CSV出力', route: '/report' },
  ];
} 