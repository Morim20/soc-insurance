import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

interface Task {
  label: string;
  value: string;
}

interface Shortcut {
  label: string;
  route: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    RouterModule
  ]
})
export class DashboardComponent implements OnInit {
  isExpanded = true;
  isChildRoute = false;
  tasks: Task[] = [
    { label: '新規従業員登録', value: '3件' },
    { label: '保険更新期限', value: '2件' },
    { label: '未処理の申請', value: '5件' }
  ];

  shortcuts: Shortcut[] = [
    { label: '従業員一覧', route: '/admin/employees' },
    { label: '保険管理', route: '/admin/insurance' },
    { label: 'レポート', route: '/admin/reports' }
  ];

  constructor(private router: Router) {}

  ngOnInit() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.isChildRoute = !event.urlAfterRedirects.includes('/admin/dashboard');
    });
  }

  toggleSidenav() {
    this.isExpanded = !this.isExpanded;
  }
} 