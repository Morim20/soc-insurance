import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-login',
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule
  ]
})
export class AdminLoginComponent {
  adminLoginForm: FormGroup;
  isLoading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.adminLoginForm = this.fb.group({
      adminCode: ['', [Validators.required]],
      secretKey: ['', [Validators.required]]
    });
  }

  async onSubmit(): Promise<void> {
    if (this.adminLoginForm.valid) {
      this.isLoading = true;
      try {
        const success = await this.authService.verifyAdminLogin(
          this.adminLoginForm.value.adminCode,
          this.adminLoginForm.value.secretKey
        );
        if (success) {
          await this.router.navigate(['/admin/employees']);
        } else {
          this.snackBar.open('管理者コードまたはシークレットキーが正しくありません。', '閉じる', {
            duration: 3000,
            horizontalPosition: 'center',
            verticalPosition: 'top'
          });
        }
      } catch (error) {
        this.snackBar.open('認証中にエラーが発生しました。', '閉じる', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'top'
        });
      } finally {
        this.isLoading = false;
      }
    }
  }
} 