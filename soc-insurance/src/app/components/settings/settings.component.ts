import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormArray, ValidatorFn, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTabsModule } from '@angular/material/tabs';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Firestore, collection, getDocs, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { MatIconModule } from '@angular/material/icon';

interface Address {
  prefecture: string;
  city: string;
  street: string;
}

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTabsModule,
    MatIconModule
  ],
  template: `
    <div class="settings-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>事業所情報設定</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div *ngIf="!isEditing && hasSettings" class="settings-display">
            <div class="info-row">
              <span class="label">事業所整理番号：</span>
              <span class="value">{{settingsForm.get('officeCode')?.value}}</span>
            </div>
            <div class="info-row">
              <span class="label">事業所名称：</span>
              <span class="value">{{settingsForm.get('officeName')?.value}}</span>
            </div>
            <div class="info-row">
              <span class="label">所在地：</span>
              <span class="value">
                〒{{settingsForm.get('postalCode')?.value}}<br>
                {{settingsForm.get('prefecture')?.value}}{{settingsForm.get('city')?.value}}{{settingsForm.get('street')?.value}}
              </span>
            </div>
            <div class="info-row">
              <span class="label">事業主氏名：</span>
              <span class="value">{{settingsForm.get('ownerName')?.value}}</span>
            </div>
            <div class="info-row">
              <span class="label">電話番号：</span>
              <span class="value">{{settingsForm.get('phoneNumber')?.value}}</span>
            </div>
            <div class="info-row">
              <span class="label">設立年月日：</span>
              <span class="value">{{settingsForm.get('establishmentDate')?.value | date:'yyyy年MM月dd日'}}</span>
            </div>
            <div class="info-row">
              <span class="label">登録されている従業員数：</span>
              <span class="value">{{employeeCount}}名</span>
            </div>
            <div class="info-row">
              <span class="label">実際の従業員数：</span>
              <span class="value">{{settingsForm.get('actualEmployeeCount')?.value}}名</span>
            </div>
            <div class="info-row">
              <span class="label">部署一覧：</span>
              <span class="value">
                <div *ngFor="let department of departmentsFormArray.controls; let i = index">
                  {{department.value}}
                </div>
              </span>
            </div>
            <div class="info-row">
              <span class="label">賞与回数：</span>
              <span class="value">{{settingsForm.get('bonusCount')?.value}}回</span>
            </div>
            <div class="info-row">
              <span class="label">賞与支給月：</span>
              <span class="value">
                <div *ngFor="let month of bonusMonthsFormArray.controls; let i = index">
                  {{month.value}}月
                </div>
              </span>
            </div>
            <div class="form-actions">
              <button mat-raised-button color="primary" (click)="startEditing()">
                編集
              </button>
            </div>
          </div>

          <form *ngIf="isEditing || !hasSettings" [formGroup]="settingsForm" (ngSubmit)="onSubmit()">
            <div class="form-section">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>事業所整理番号</mat-label>
                <input matInput formControlName="officeCode" placeholder="例：01-イロハ">
                <mat-hint>例：01-イロハ</mat-hint>
                <mat-error *ngIf="settingsForm.get('officeCode')?.hasError('required')">
                  事業所整理番号は必須です
                </mat-error>
                <mat-error *ngIf="settingsForm.get('officeCode')?.hasError('pattern')">
                  正しい形式で入力してください（例：01-イロハ）
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>事業所名称</mat-label>
                <input matInput formControlName="officeName">
                <mat-error *ngIf="settingsForm.get('officeName')?.hasError('required')">
                  事業所名称は必須です
                </mat-error>
              </mat-form-field>

              <div class="address-section">
                <h3>所在地</h3>
                <div class="postal-code-field">
                  <mat-form-field appearance="outline">
                    <mat-label>郵便番号</mat-label>
                    <input matInput formControlName="postalCode" placeholder="例：100-0001" (blur)="searchAddress()">
                    <mat-hint>例：100-0001</mat-hint>
                    <mat-error *ngIf="settingsForm.get('postalCode')?.hasError('required')">
                      郵便番号は必須です
                    </mat-error>
                    <mat-error *ngIf="settingsForm.get('postalCode')?.hasError('pattern')">
                      正しい形式で入力してください（例：100-0001）
                    </mat-error>
                  </mat-form-field>
                  <button mat-raised-button color="primary" type="button" (click)="searchAddress()" [disabled]="!settingsForm.get('postalCode')?.valid">
                    住所検索
                  </button>
                </div>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>都道府県</mat-label>
                  <mat-select formControlName="prefecture">
                    <mat-option *ngFor="let prefecture of prefectures" [value]="prefecture">
                      {{prefecture}}
                    </mat-option>
                  </mat-select>
                  <mat-error *ngIf="settingsForm.get('prefecture')?.hasError('required')">
                    都道府県は必須です
                  </mat-error>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>市区町村</mat-label>
                  <input matInput formControlName="city">
                  <mat-error *ngIf="settingsForm.get('city')?.hasError('required')">
                    市区町村は必須です
                  </mat-error>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>番地・建物名</mat-label>
                  <input matInput formControlName="street">
                  <mat-error *ngIf="settingsForm.get('street')?.hasError('required')">
                    番地・建物名は必須です
                  </mat-error>
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>事業主氏名</mat-label>
                <input matInput formControlName="ownerName">
                <mat-error *ngIf="settingsForm.get('ownerName')?.hasError('required')">
                  事業主氏名は必須です
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>電話番号</mat-label>
                <input matInput formControlName="phoneNumber" placeholder="例：03-1234-5678">
                <mat-hint>例：03-1234-5678</mat-hint>
                <mat-error *ngIf="settingsForm.get('phoneNumber')?.hasError('required')">
                  電話番号は必須です
                </mat-error>
                <mat-error *ngIf="settingsForm.get('phoneNumber')?.hasError('pattern')">
                  正しい形式で入力してください（例：03-1234-5678）
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>設立年月日</mat-label>
                <input matInput [matDatepicker]="establishmentDatePicker" formControlName="establishmentDate">
                <mat-datepicker-toggle matSuffix [for]="establishmentDatePicker"></mat-datepicker-toggle>
                <mat-datepicker #establishmentDatePicker></mat-datepicker>
                <mat-error *ngIf="settingsForm.get('establishmentDate')?.hasError('required')">
                  設立年月日は必須です
                </mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>実際の従業員数</mat-label>
                <input matInput type="number" formControlName="actualEmployeeCount" min="0">
                <mat-error *ngIf="settingsForm.get('actualEmployeeCount')?.hasError('required')">
                  実際の従業員数は必須です
                </mat-error>
                <mat-error *ngIf="settingsForm.get('actualEmployeeCount')?.hasError('min')">
                  0以上の値を入力してください
                </mat-error>
              </mat-form-field>

              <div class="departments-section">
                <h3>部署一覧</h3>
                <div formArrayName="departments">
                  <div *ngFor="let department of departmentsFormArray.controls; let i = index" class="department-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>部署名</mat-label>
                      <input matInput [formControlName]="i">
                      <mat-error *ngIf="department.hasError('required')">
                        部署名は必須です
                      </mat-error>
                    </mat-form-field>
                    <button mat-icon-button color="warn" type="button" (click)="removeDepartment(i)" [disabled]="departmentsFormArray.length <= 1">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </div>
                </div>
                <button mat-raised-button type="button" (click)="addDepartment()" class="add-department-btn">
                  部署を追加
                </button>
              </div>

              <div class="bonus-section">
                <h3>賞与設定</h3>
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>賞与回数</mat-label>
                  <input matInput type="number" formControlName="bonusCount" min="0" max="12" (change)="onBonusCountChange()">
                  <mat-error *ngIf="settingsForm.get('bonusCount')?.hasError('required')">
                    賞与回数は必須です
                  </mat-error>
                  <mat-error *ngIf="settingsForm.get('bonusCount')?.hasError('min') || settingsForm.get('bonusCount')?.hasError('max')">
                    0から12の間で入力してください
                  </mat-error>
                </mat-form-field>

                <div formArrayName="bonusMonths">
                  <div *ngFor="let month of bonusMonthsFormArray.controls; let i = index" class="bonus-month-row">
                    <mat-form-field appearance="outline" class="full-width">
                      <mat-label>賞与支給月（{{i + 1}}回目）</mat-label>
                      <mat-select [formControlName]="i" (selectionChange)="onBonusMonthChange()">
                        <mat-option *ngFor="let month of months" [value]="month.value">
                          {{month.label}}
                        </mat-option>
                      </mat-select>
                      <mat-error *ngIf="month.hasError('required')">
                        支給月は必須です
                      </mat-error>
                    </mat-form-field>
                  </div>
                </div>
              </div>

              <div class="info-row">
                <span class="label">登録されている従業員数：</span>
                <span class="value">{{employeeCount}}名</span>
              </div>
            </div>

            <div class="form-actions">
              <button mat-raised-button color="primary" type="submit" [disabled]="settingsForm.invalid">
                保存
              </button>
              <button *ngIf="hasSettings" mat-button type="button" (click)="cancelEditing()">
                キャンセル
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-container {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .form-section {
      margin: 20px 0;
    }
    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }
    .form-actions {
      margin-top: 20px;
      display: flex;
      justify-content: flex-end;
      gap: 16px;
    }
    .address-section {
      margin: 20px 0;
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .postal-code-field {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .postal-code-field mat-form-field {
      flex: 1;
    }
    .settings-display {
      padding: 20px;
    }
    .info-row {
      margin-bottom: 32px;
      display: flex;
      align-items: flex-start;
      padding: 8px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.12);
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .label {
      font-weight: 500;
      min-width: 200px;
      color: rgba(0, 0, 0, 0.6);
      padding-right: 24px;
    }
    .value {
      flex: 1;
      line-height: 1.6;
    }
    .departments-section {
      margin: 20px 0;
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .department-row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .department-row mat-form-field {
      flex: 1;
    }
    .add-department-btn {
      margin-top: 8px;
    }
    .bonus-section {
      margin: 20px 0;
      padding: 20px;
      background-color: #f5f5f5;
      border-radius: 4px;
    }
    .bonus-month-row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .bonus-month-row mat-form-field {
      flex: 1;
    }
  `]
})
export class SettingsComponent implements OnInit {
  settingsForm: FormGroup;
  prefectures = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
  ];
  isEditing = false;
  hasSettings = false;
  employeeCount = 0;
  private originalFormValues: any;
  months = [
    { value: 1, label: '1月' },
    { value: 2, label: '2月' },
    { value: 3, label: '3月' },
    { value: 4, label: '4月' },
    { value: 5, label: '5月' },
    { value: 6, label: '6月' },
    { value: 7, label: '7月' },
    { value: 8, label: '8月' },
    { value: 9, label: '9月' },
    { value: 10, label: '10月' },
    { value: 11, label: '11月' },
    { value: 12, label: '12月' }
  ];

  get departmentsFormArray() {
    return this.settingsForm.get('departments') as FormArray;
  }

  get bonusMonthsFormArray() {
    return this.settingsForm.get('bonusMonths') as FormArray;
  }

  constructor(
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private http: HttpClient,
    private firestore: Firestore
  ) {
    this.settingsForm = this.fb.group({
      officeCode: ['', [Validators.required, Validators.pattern(/^\d{2}-[ァ-ヶー]+$/)]],
      officeName: ['', Validators.required],
      postalCode: ['', [Validators.required, Validators.pattern(/^\d{3}-\d{4}$/)]],
      prefecture: ['', Validators.required],
      city: ['', Validators.required],
      street: ['', Validators.required],
      ownerName: ['', Validators.required],
      phoneNumber: ['', [Validators.required, Validators.pattern(/^\d{2,4}-\d{2,4}-\d{4}$/)]],
      establishmentDate: [null, Validators.required],
      actualEmployeeCount: [0, [Validators.required, Validators.min(0)]],
      departments: this.fb.array([this.fb.control('', Validators.required)]),
      bonusCount: [2, [Validators.required, Validators.min(0), Validators.max(12)]],
      bonusMonths: this.fb.array([
        this.fb.control(6, [Validators.required, Validators.min(1), Validators.max(12)]),
        this.fb.control(12, [Validators.required, Validators.min(1), Validators.max(12)])
      ])
    });

    // カスタムバリデーターを追加
    this.settingsForm.addValidators(this.bonusMonthsIntervalValidator());
  }

  async ngOnInit() {
    await this.loadSettings();
    await this.loadEmployeeCount();
  }

  async loadSettings() {
    const settingsRef = doc(this.firestore, 'settings', 'office');
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      this.settingsForm.patchValue({
        officeCode: data['officeCode'],
        officeName: data['officeName'],
        postalCode: data['postalCode'],
        prefecture: data['prefecture'],
        city: data['city'],
        street: data['street'],
        ownerName: data['ownerName'],
        phoneNumber: data['phoneNumber'],
        establishmentDate: data['establishmentDate']?.toDate(),
        actualEmployeeCount: data['actualEmployeeCount'] || 0,
        bonusCount: data['bonusCount'] || 2
      });

      // 部署一覧の設定
      if (data['departments'] && Array.isArray(data['departments'])) {
        this.departmentsFormArray.clear();
        data['departments'].forEach((dept: string) => {
          this.departmentsFormArray.push(this.fb.control(dept, Validators.required));
        });
      }

      // 賞与支給月の設定
      if (data['bonusMonths'] && Array.isArray(data['bonusMonths'])) {
        this.bonusMonthsFormArray.clear();
        data['bonusMonths'].forEach((month: number) => {
          this.bonusMonthsFormArray.push(this.fb.control(month, [Validators.required, Validators.min(1), Validators.max(12)]));
        });
      }

      this.hasSettings = true;
    }
  }

  async loadEmployeeCount() {
    const employeesRef = collection(this.firestore, 'employees');
    const snapshot = await getDocs(employeesRef);
    this.employeeCount = snapshot.size;
  }

  startEditing() {
    this.originalFormValues = this.settingsForm.value;
    this.isEditing = true;
  }

  cancelEditing() {
    this.settingsForm.patchValue(this.originalFormValues);
    this.isEditing = false;
  }

  addDepartment() {
    this.departmentsFormArray.push(this.fb.control('', Validators.required));
  }

  removeDepartment(index: number) {
    this.departmentsFormArray.removeAt(index);
  }

  searchAddress() {
    const postalCode = this.settingsForm.get('postalCode')?.value;
    if (!postalCode) return;

    this.http.get<any>(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${postalCode.replace('-', '')}`)
      .pipe(
        map(response => {
          if (response.status === 200 && response.results) {
            const result = response.results[0];
            return {
              prefecture: result.address1,
              city: result.address2,
              street: result.address3
            };
          }
          return null;
        })
      )
      .subscribe({
        next: (address: Address | null) => {
          if (address) {
            this.settingsForm.patchValue({
              prefecture: address.prefecture,
              city: address.city,
              street: address.street
            });
          } else {
            this.snackBar.open('住所が見つかりませんでした', '閉じる', {
              duration: 3000
            });
          }
        },
        error: () => {
          this.snackBar.open('住所検索に失敗しました', '閉じる', {
            duration: 3000
          });
        }
      });
  }

  onBonusCountChange() {
    const currentCount = this.bonusMonthsFormArray.length;
    const newCount = this.settingsForm.get('bonusCount')?.value;

    if (newCount > currentCount) {
      for (let i = currentCount; i < newCount; i++) {
        this.bonusMonthsFormArray.push(
          this.fb.control(6, [Validators.required, Validators.min(1), Validators.max(12)])
        );
      }
    } else if (newCount < currentCount) {
      for (let i = currentCount; i > newCount; i--) {
        this.bonusMonthsFormArray.removeAt(i - 1);
      }
    }

    // バリデーションの実行とフォームエラーの設定
    this.validateBonusMonthsWithFormError();
  }

  validateBonusMonthsWithFormError() {
    const bonusCount = this.settingsForm.get('bonusCount')?.value;
    
    // 賞与回数が2回または3回の場合のみバリデーション
    if (bonusCount === 2 || bonusCount === 3) {
      const isValid = this.validateBonusMonths();
      
      // フォーム全体にエラーを設定
      if (!isValid) {
        this.settingsForm.get('bonusCount')?.setErrors({ 'bonusMonthsInterval': true });
      } else {
        // エラーをクリア（他のエラーがある場合は保持）
        const currentErrors = this.settingsForm.get('bonusCount')?.errors;
        if (currentErrors) {
          delete currentErrors['bonusMonthsInterval'];
          if (Object.keys(currentErrors).length === 0) {
            this.settingsForm.get('bonusCount')?.setErrors(null);
          }
        }
      }
    } else {
      // 2回、3回以外の場合はこのエラーをクリア
      const currentErrors = this.settingsForm.get('bonusCount')?.errors;
      if (currentErrors && currentErrors['bonusMonthsInterval']) {
        delete currentErrors['bonusMonthsInterval'];
        if (Object.keys(currentErrors).length === 0) {
          this.settingsForm.get('bonusCount')?.setErrors(null);
        }
      }
    }
  }

  validateBonusMonths(): boolean {
    const months = this.bonusMonthsFormArray.controls
      .map(control => control.value)
      .filter(month => month !== null && month !== undefined); // nullやundefinedを除外
    
    // 月が設定されていない場合はバリデーション不要
    if (months.length === 0) {
      return true;
    }
    
    // 重複チェック
    const uniqueMonths = [...new Set(months)];
    if (uniqueMonths.length !== months.length) {
      this.snackBar.open('同じ月を重複して設定することはできません', '閉じる', {
        duration: 5000
      });
      return false;
    }

    // 年度順（4月→3月）チェック
    // 4月を起点にした年度順配列を作成
    const fiscalOrder = [4,5,6,7,8,9,10,11,12,1,2,3];
    let lastIndex = -1;
    for (let i = 0; i < months.length; i++) {
      const idx = fiscalOrder.indexOf(months[i]);
      if (idx === -1) {
        this.snackBar.open('賞与支給月は1～12の範囲で入力してください', '閉じる', { duration: 5000 });
        return false;
      }
      if (idx <= lastIndex) {
        this.snackBar.open('賞与支給月は年度順（4月→…→3月）で並べてください', '閉じる', { duration: 5000 });
        return false;
      }
      lastIndex = idx;
    }
    
    // 3か月超の間隔チェック
    for (let i = 1; i < months.length; i++) {
      const prevIdx = fiscalOrder.indexOf(months[i-1]);
      const currIdx = fiscalOrder.indexOf(months[i]);
      const diff = currIdx - prevIdx;
      if (diff <= 3) {
        this.snackBar.open('賞与支給月は3か月超の間隔を空けて設定してください', '閉じる', {
          duration: 5000
        });
        return false;
      }
    }
    
    return true;
  }

  // 月選択時にも呼び出すメソッド
  onBonusMonthChange() {
    this.validateBonusMonthsWithFormError();
  }

  // カスタムバリデーター
  bonusMonthsIntervalValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const bonusCount = this.settingsForm?.get('bonusCount')?.value;
      
      if (bonusCount !== 2 && bonusCount !== 3) {
        return null; // バリデーション対象外
      }
      
      const months = this.bonusMonthsFormArray?.controls
        .map(c => c.value)
        .filter(month => month !== null && month !== undefined);
        
      if (!months || months.length === 0) {
        return null;
      }
      
      const sortedMonths = [...months].sort((a, b) => a - b);
      
      // 重複チェック
      const uniqueMonths = [...new Set(sortedMonths)];
      if (uniqueMonths.length !== sortedMonths.length) {
        return { bonusMonthsDuplicate: true };
      }
      
      // 間隔チェック
      for (let i = 1; i < sortedMonths.length; i++) {
        if (sortedMonths[i] - sortedMonths[i - 1] < 3) {
          return { bonusMonthsInterval: true };
        }
      }
      
      return null;
    };
  }

  async onSubmit() {
    if (this.settingsForm.valid) {
      const bonusCount = this.settingsForm.get('bonusCount')?.value;
      
      // 賞与回数が2回または3回の場合、3ヶ月ごとの対象月のバリデーションを実行
      if ((bonusCount === 2 || bonusCount === 3) && !this.validateBonusMonths()) {
        return;
      }

      try {
        const settingsRef = doc(this.firestore, 'settings', 'office');
        await setDoc(settingsRef, this.settingsForm.value);
        
        this.snackBar.open('設定を保存しました', '閉じる', {
          duration: 3000
        });
        this.hasSettings = true;
        this.isEditing = false;
      } catch (error) {
        this.snackBar.open('設定の保存に失敗しました', '閉じる', {
          duration: 3000
        });
      }
    }
  }

  addBonusMonth() {
    if (this.bonusMonthsFormArray.length < this.settingsForm.get('bonusCount')?.value) {
      this.bonusMonthsFormArray.push(this.fb.control(6, [Validators.required, Validators.min(1), Validators.max(12)]));
    }
  }

  removeBonusMonth(index: number) {
    if (this.bonusMonthsFormArray.length > 1) {
      this.bonusMonthsFormArray.removeAt(index);
    }
  }
} 