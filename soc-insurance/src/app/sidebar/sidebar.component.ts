import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss']
})
export class SidebarComponent {
  constructor(public router: Router) {}
  menuItems = [
    { label: 'ダッシュボード', route: '/dashboard' },
    { label: '従業員一覧', route: '/employees' },
    { label: '従業員登録', route: '/employees/new' },
    { label: '社会保険手続き', route: '/insurance-procedures' },
    { label: '保険料率設定', route: '/insurance-rate' },
    { label: 'レポート出力', route: '/report' },
    { label: '会社情報', route: '/company' },
    { label: 'ログアウト', route: '/logout' },
  ];
} 