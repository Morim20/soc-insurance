import { Component, OnInit } from '@angular/core';
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
  selector: 'app-admin-verification',
  templateUrl: './admin-verification.component.html',
  styleUrls: ['./admin-verification.component.scss'],
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
export class AdminVerificationComponent implements OnInit {
  verificationForm: FormGroup;
  isLoading = false;
  verificationCode: string | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private snackBar: MatSnackBar
  ) {
    this.verificationForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  async ngOnInit() {
    try {
      this.verificationCode = await this.authService.generateAdminVerificationCode();
      this.snackBar.open('認証コードを生成しました。5分以内に入力してください。', '閉じる', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
    } catch (error) {
      this.snackBar.open('認証コードの生成に失敗しました。', '閉じる', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });
      this.router.navigate(['/login']);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.verificationForm.valid) {
      this.isLoading = true;
      try {
        const success = await this.authService.verifyAdminAccess(
          this.verificationForm.value.code
        );
        if (success) {
          this.router.navigate(['/admin']);
        } else {
          this.snackBar.open('認証コードが正しくありません。', '閉じる', {
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