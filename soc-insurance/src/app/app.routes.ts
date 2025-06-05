import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { AuthGuard } from './guards/auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { RegisterComponent } from './components/register/register.component';
import { AdminVerificationComponent } from './components/admin-verification/admin-verification.component';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { EmployeesListComponent } from './components/employees-list/employees-list.component';
import { EmployeeFormComponent } from './components/employee-form/employee-form.component';
import { EmployeeDetailComponent } from './components/employee-detail/employee-detail.component';
import { InsuranceManagementComponent } from './components/insurance-management/insurance-management.component';
import { InsuranceEditComponent } from './components/insurance-edit/insurance-edit.component';
import { SettingsComponent } from './components/settings/settings.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'admin-login', component: AdminLoginComponent },
  {
    path: 'admin',
    component: DashboardComponent,
    canActivate: [AuthGuard, AdminGuard],
    children: [
      { path: '', redirectTo: 'employees', pathMatch: 'full' },
      { path: 'employees', component: EmployeesListComponent },
      { path: 'employees/new', component: EmployeeFormComponent },
      { path: 'employees/:id', component: EmployeeDetailComponent },
      { path: 'insurance', component: InsuranceManagementComponent },
      { path: 'insurance/:id/edit', component: InsuranceEditComponent },
      { path: 'settings', component: SettingsComponent }
    ]
  },
  { path: 'admin/dashboard', component: DashboardComponent, canActivate: [AuthGuard, AdminGuard] },
  {
    path: 'home',
    loadChildren: () => import('./components/home/home.module').then(m => m.HomeModule),
    canActivate: [AuthGuard]
  },
  { path: '', redirectTo: '/login', pathMatch: 'full' }
];
