import { Component, OnInit } from '@angular/core';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterModule,
    CommonModule,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatListModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'soc-insurance';
  isLoggedIn = false;
  isExpanded = true;
  isSidebarRoute = true;

  constructor(private authService: AuthService, private router: Router) {
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
    });
  }

  ngOnInit() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      // サイドバーを表示しないルート一覧
      const noSidebarRoutes = ['/home', '/login', '/register', '/admin-login'];
      this.isSidebarRoute = !noSidebarRoutes.includes(event.urlAfterRedirects);
    });
  }

  toggleSidenav() {
    this.isExpanded = !this.isExpanded;
  }

  onSidebarLogout() {
    this.authService.logout();
    this.router.navigate(['/home']);
  }
}
