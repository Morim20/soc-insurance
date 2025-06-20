import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, ReactiveFormsModule, AbstractControl, ValidatorFn } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import { EmployeeService } from '../../services/employee.service';
import { EmployeeFullInfo, EmployeeBasicInfo, EmploymentInfo, InsuranceStatus, Dependent, SpecialAttributes } from '../../models/employee.model';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc } from '@angular/fire/firestore';
import { Timestamp } from 'firebase/firestore';
import aichiGradesData from '../../services/23aichi_insurance_grades.json';
const aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGradesData;
import pensionGradesData from '../../services/pension_grades.json';
const pensionGrades: { [key: string]: { standardMonthlyWage: number } } = pensionGradesData;

@Component({
  selector: 'app-employee-form',
  templateUrl: './employee-form.component.html',
  styleUrls: ['./employee-form.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule
  ]
})
export class EmployeeFormComponent implements OnInit {
  employeeForm: FormGroup;
  isLoading = false;
  departments: string[] = [];
  employeeId: string | null = null;
  standardMonthlyWage: number | null = null;
  public aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGrades;
  public pensionGrades: { [key: string]: { standardMonthlyWage: number } } = pensionGrades;
  gradeSort = (a: any, b: any) => Number(a.key) - Number(b.key);
  showDependentsSection = false;

  // カスタムバリデーター: relationshipが「その他」の場合はrelationshipOther必須
  relationshipOtherRequiredValidator: ValidatorFn = (group: AbstractControl) => {
    const relationship = group.get('relationship')?.value;
    const relationshipOther = group.get('relationshipOther')?.value;
    if (relationship === 'その他' && !relationshipOther) {
      group.get('relationshipOther')?.setErrors({ required: true });
      return { relationshipOtherRequired: true };
    } else {
      group.get('relationshipOther')?.setErrors(null);
    }
    return null;
  };

  // 生年月日が未来日ならエラー
  futureDateValidator(control: AbstractControl) {
    const value = control.value;
    if (!value) return null;
    const inputDate = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (inputDate > today) {
      return { futureDate: true };
    }
    return null;
  }

  constructor(
    private fb: FormBuilder,
    private employeeService: EmployeeService,
    private snackBar: MatSnackBar,
    private router: Router,
    private route: ActivatedRoute,
    private firestore: Firestore
  ) {
    this.employeeForm = this.fb.group({
      employeeBasicInfo: this.fb.group({
        employeeId: ['', [Validators.required, Validators.pattern(/^[0-9]{5}$/)]],
        lastNameKanji: ['', Validators.required],
        firstNameKanji: ['', Validators.required],
        lastNameKana: ['', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
        firstNameKana: ['', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
        birthDate: [null, [Validators.required, this.futureDateValidator]],
        gender: ['', Validators.required],
        address: ['' ],
        myNumber: ['', [Validators.pattern(/^[0-9]{12}$/)]],
        email: ['', [Validators.email]],
        phoneNumber: ['', [Validators.pattern(/^[0-9]{2,4}-[0-9]{2,4}-[0-9]{4}$/)]],
        role: ['user'],
      }),
      employmentInfo: this.fb.group({
        employmentType: ['', Validators.required],
        department: ['', Validators.required],
        startDate: [null, Validators.required],
        endDate: [null],
        weeklyHours: ['', [Validators.required, Validators.min(1), Validators.max(168)]],
        monthlyWorkDays: ['', [Validators.required, Validators.min(1), Validators.max(31)]],
        expectedEmploymentMonths: ['', [Validators.min(1)]],
        grade: [null, [(control: AbstractControl) => {
          const value = control.value;
          if (value === null) return null;
          return value >= 1 ? null : { min: true };
        }]],
        baseSalary: ['', [Validators.required, Validators.min(0)]],
        isStudent: [false],
        studentType: [''],
        allowances: [0],
        commutingAllowance: [0, [Validators.min(0)]],
        commuteRoute: [''],
        commutePassCost: [0],
        oneWayFare: [0, [Validators.min(0)]],
      }, { validators: this.endDateAfterStartDateValidator }),
      insuranceStatus: this.fb.group({
        healthInsurance: [''],
        nursingInsurance: [''],
        pensionInsurance: [''],
        qualificationAcquisitionDate: [''],
        insuranceType: [''],
        remunerationCurrency: [''],
        remunerationInKind: [''],
        standardMonthlyRevisionDate: [''],
        insuranceQualificationDate: [''],
        qualificationLossDate: [''],
        grade: [null],
        newGrade: [null],
        newStandardMonthlyWage: [null],
        newRevisionDate: [null]
      }),
      specialAttributes: this.fb.group({
        leaveType: [''],
        leaveStartDate: [''],
        leaveEndDate: ['']
      }),
      dependents: this.fb.array([])
    });

    // 健康保険等級の変更を監視（雇用情報）
    this.employeeForm.get('employmentInfo.grade')?.valueChanges.subscribe(grade => {
      if (grade && this.aichiGrades[grade]) {
        this.standardMonthlyWage = this.aichiGrades[grade].standardMonthlyWage;
      } else {
        this.standardMonthlyWage = null;
      }
      // 雇用情報の等級変更時、社会保険情報にも同期
      this.employeeForm.get('insuranceStatus.grade')?.setValue(grade, { emitEvent: false });
    });
    // 健康保険等級の変更を監視（社会保険情報）
    this.employeeForm.get('insuranceStatus.grade')?.valueChanges.subscribe(grade => {
      if (grade && this.aichiGrades[grade]) {
        this.standardMonthlyWage = this.aichiGrades[grade].standardMonthlyWage;
      } else {
        this.standardMonthlyWage = null;
      }
      // 社会保険情報の等級変更時、雇用情報にも同期
      this.employeeForm.get('employmentInfo.grade')?.setValue(grade, { emitEvent: false });
    });
    // 保険種別の変更を監視
    this.employeeForm.get('insuranceStatus.insuranceType')?.valueChanges.subscribe(type => {
      if (type !== '協会けんぽ') {
        // 等級と標準報酬月額をクリア
        this.employeeForm.get('insuranceStatus.grade')?.setValue(null);
        this.employeeForm.get('insuranceStatus.newGrade')?.setValue(null);
        this.standardMonthlyWage = null;
        this.employeeForm.get('insuranceStatus.newStandardMonthlyWage')?.setValue(null);
      }
    });
    // 厚生年金等級の変更を監視（社会保険情報）
    this.employeeForm.get('insuranceStatus.newGrade')?.valueChanges.subscribe(grade => {
      if (grade && this.pensionGrades[grade]) {
        this.employeeForm.get('insuranceStatus.newStandardMonthlyWage')?.setValue(this.pensionGrades[grade].standardMonthlyWage, { emitEvent: false });
      } else {
        this.employeeForm.get('insuranceStatus.newStandardMonthlyWage')?.setValue(null, { emitEvent: false });
      }
    });
  }

  async ngOnInit() {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    await this.loadDepartments();
    if (this.employeeId) {
      await this.loadEmployee();
    }
    // 健康保険等級変更時に標準報酬月額を自動反映
    this.employeeForm.get('employmentInfo.grade')?.valueChanges.subscribe((grade) => {
      const key = String(grade);
      if (grade && aichiGrades[key]) {
        this.standardMonthlyWage = aichiGrades[key].standardMonthlyWage;
      } else {
        this.standardMonthlyWage = null;
      }
    });
    // 初期値セット時も反映
    const initialGrade = this.employeeForm.get('employmentInfo.grade')?.value;
    if (initialGrade && aichiGrades[String(initialGrade)]) {
      this.standardMonthlyWage = aichiGrades[String(initialGrade)].standardMonthlyWage;
    }
  }

  async loadDepartments() {
    try {
      this.departments = await this.employeeService.getDepartments();
    } catch (error) {
      console.error('部署情報の取得に失敗しました:', error);
      this.snackBar.open('部署情報の取得に失敗しました', '閉じる', {
        duration: 3000
      });
    }
  }

  // どんな型でもDate型に変換する安全な関数
  private toDateSafe(val: any): Date | null {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val === 'string') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  async loadEmployee() {
    if (!this.employeeId) return;

    try {
      this.isLoading = true;
      const employee = await this.employeeService.getEmployee(this.employeeId) as EmployeeFullInfo;
      if (employee) {
        // 部署情報を先に読み込む
        await this.loadDepartments();

        this.employeeForm.patchValue({
          employeeBasicInfo: {
            ...employee.employeeBasicInfo,
            birthDate: this.toDateSafe(employee.employeeBasicInfo.birthDate),
            hireDate: this.toDateSafe(employee.employeeBasicInfo.hireDate),
            department: employee.employmentInfo.department || ''
          },
          employmentInfo: {
            ...employee.employmentInfo,
            department: employee.employmentInfo.department || '',
            startDate: this.toDateSafe(employee.employmentInfo.startDate),
            endDate: this.toDateSafe(employee.employmentInfo.endDate)
          },
          insuranceStatus: {
            ...employee.insuranceStatus,
            qualificationAcquisitionDate: this.toDateSafe(employee.insuranceStatus.qualificationAcquisitionDate),
            qualificationLossDate: this.toDateSafe(employee.insuranceStatus.qualificationLossDate),
            standardMonthlyRevisionDate: this.toDateSafe(employee.insuranceStatus.standardMonthlyRevisionDate),
            insuranceQualificationDate: this.toDateSafe(employee.insuranceStatus.insuranceQualificationDate)
          },
          specialAttributes: {
            ...employee.specialAttributes,
            leaveStartDate: this.toDateSafe(employee.specialAttributes.leaveStartDate),
            leaveEndDate: this.toDateSafe(employee.specialAttributes.leaveEndDate),
            reached70Date: this.toDateSafe(employee.specialAttributes.reached70Date)
          }
        });

        // 扶養家族情報の設定
        if (employee.dependents && employee.dependents.length > 0) {
          this.dependents.clear();
          employee.dependents.forEach((dependent: Dependent) => {
            const dependentGroup = this.fb.group({
              lastName: [dependent.lastName],
              firstName: [dependent.firstName],
              lastNameKana: [dependent.lastNameKana],
              firstNameKana: [dependent.firstNameKana],
              myNumber: [dependent.myNumber],
              birthDate: [dependent.birthDate instanceof Timestamp ? dependent.birthDate.toDate() : dependent.birthDate],
              relationship: [dependent.relationship],
              relationshipOther: [dependent.relationshipOther],
              income: [dependent.income],
              residency: [dependent.residency],
              cohabitation: [dependent.cohabitation],
              occupation: [dependent.occupation],
              schoolGrade: [dependent.schoolGrade],
              occupationOther: [dependent.occupationOther]
            });
            this.dependents.push(dependentGroup);
          });
        }
      }
    } catch (error) {
      console.error('従業員情報の取得に失敗しました:', error);
      this.snackBar.open('従業員情報の取得に失敗しました', '閉じる', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  get dependents(): FormArray {
    return this.employeeForm.get('dependents') as FormArray;
  }

  addDependent(): void {
    const dependent = this.fb.group({
      lastName: ['', Validators.required],
      firstName: ['', Validators.required],
      lastNameKana: ['', Validators.required],
      firstNameKana: ['', Validators.required],
      myNumber: ['', [Validators.pattern(/^[0-9]{12}$/)]],
      birthDate: [null, [Validators.required, this.futureDateValidator]],
      relationship: ['', Validators.required],
      relationshipOther: [''],
      income: [0],
      residency: ['国内', Validators.required],
      cohabitation: ['同居', Validators.required],
      occupation: ['', Validators.required],
      schoolGrade: [''],
      occupationOther: ['']
    });
    this.dependents.push(dependent);
  }

  removeDependent(index: number): void {
    this.dependents.removeAt(index);
  }

  // undefinedを空文字に変換するユーティリティ
  private convertUndefinedToEmpty(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map((v) => this.convertUndefinedToEmpty(v));
    } else if (obj && typeof obj === 'object') {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        const value = obj[key];
        newObj[key] = value === undefined ? '' : this.convertUndefinedToEmpty(value);
      }
      return newObj;
    }
    return obj;
  }

  private formatDateString(date: any): string {
    if (!date) return '';
    if (date instanceof Timestamp) {
      date = date.toDate();
    }
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    if (isNaN(date.getTime())) return '';
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private parseValidDate(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  async onSubmit(): Promise<void> {
    if (this.employeeForm.valid) {
      try {
        this.isLoading = true;
        const formValue = this.employeeForm.value;

        // 日付データの変換処理
        const convertDates = (obj: any): any => {
          if (obj === null || obj === undefined) return obj;
          if (obj instanceof Date) return obj;
          if (typeof obj === 'string' && obj.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/)) {
            return new Date(obj);
          }
          if (Array.isArray(obj)) {
            return obj.map(item => convertDates(item));
          }
          if (typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
              result[key] = convertDates(obj[key]);
            }
            return result;
          }
          return obj;
        };

        const processedData = convertDates(formValue);

        // 等級に対応した標準報酬月額をセット
        const grade = processedData.insuranceStatus.grade;
        processedData.insuranceStatus.standardMonthlyWage = (grade && aichiGrades[String(grade)]) ? aichiGrades[String(grade)].standardMonthlyWage : null;
        // 厚生年金等級に対応した標準報酬月額もセット
        const newGrade = processedData.insuranceStatus.newGrade;
        processedData.insuranceStatus.newStandardMonthlyWage = (newGrade && pensionGrades[String(newGrade)]) ? pensionGrades[String(newGrade)].standardMonthlyWage : null;

        // メタデータの追加
        const employeeData: EmployeeFullInfo = {
          ...processedData,
          id: this.employeeId || '',
          companyId: 'default', // デフォルトの会社IDを設定
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (this.employeeId) {
          // 更新処理
          await this.employeeService.updateEmployee(this.employeeId, employeeData);
          this.snackBar.open('従業員情報を更新しました', '閉じる', {
            duration: 3000
          });
        } else {
          // 新規登録処理
          await this.employeeService.createEmployee(employeeData);
          this.snackBar.open('従業員を登録しました', '閉じる', {
            duration: 3000
          });
        }
        this.router.navigate(['/admin/employees']);
        this.employeeService.notifyEmployeeUpdated();
      } catch (error) {
        console.error('保存エラー:', error);
        this.snackBar.open('保存に失敗しました', '閉じる', {
          duration: 3000
        });
      } finally {
        this.isLoading = false;
      }
    }
  }

  onCancel(): void {
    this.router.navigate(['/admin/employees']);
  }

  // ダミーのsaveDependentsメソッド（現状は何もしない）
  saveDependents() {
    // 必要に応じて実装
  }

  async saveInsuranceStatus() {
    if (this.employeeForm.valid) {
      try {
        const formValue = this.employeeForm.value;
        const insuranceStatusForm = this.employeeForm.get('insuranceStatus');
        
        if (!insuranceStatusForm) {
          throw new Error('保険情報フォームが見つかりません');
        }
        
        // 等級情報を厳密に保存
        const insuranceStatus: InsuranceStatus = {
          healthInsurance: formValue.insuranceStatus.healthInsurance,
          nursingInsurance: formValue.insuranceStatus.nursingInsurance,
          pensionInsurance: formValue.insuranceStatus.pensionInsurance,
          qualificationAcquisitionDate: formValue.insuranceStatus.qualificationAcquisitionDate,
          insuranceType: formValue.insuranceStatus.insuranceType,
          remunerationCurrency: formValue.insuranceStatus.remunerationCurrency,
          remunerationInKind: formValue.insuranceStatus.remunerationInKind,
          standardMonthlyRevisionDate: formValue.insuranceStatus.standardMonthlyRevisionDate,
          insuranceQualificationDate: formValue.insuranceStatus.insuranceQualificationDate,
          qualificationLossDate: formValue.insuranceStatus.qualificationLossDate,
          grade: formValue.insuranceStatus.grade ? Number(formValue.insuranceStatus.grade) : null,
          newGrade: formValue.insuranceStatus.newGrade ? Number(formValue.insuranceStatus.newGrade) : null,
          newStandardMonthlyWage: formValue.insuranceStatus.newStandardMonthlyWage ? Number(formValue.insuranceStatus.newStandardMonthlyWage) : null,
          newRevisionDate: formValue.insuranceStatus.newRevisionDate,
          standardMonthlyWage: formValue.insuranceStatus.grade ? this.aichiGrades[formValue.insuranceStatus.grade]?.standardMonthlyWage : null
        };

        // 従業員情報に反映
        insuranceStatusForm.setValue(insuranceStatus);
        
        this.snackBar.open('保険情報を保存しました', '閉じる', { duration: 3000 });
      } catch (error) {
        console.error('保険情報の保存に失敗:', error);
        this.snackBar.open('保険情報の保存に失敗しました', '閉じる', { duration: 5000 });
      }
    }
  }

  // 退職予定日が勤務開始日より前ならエラー
  endDateAfterStartDateValidator: ValidatorFn = (group: AbstractControl) => {
    const start = group.get('startDate')?.value;
    const end = group.get('endDate')?.value;
    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (endDate < startDate) {
        group.get('endDate')?.setErrors({ endBeforeStart: true });
        return { endBeforeStart: true };
      } else {
        // 他のバリデーションエラーがなければクリア
        if (group.get('endDate')?.hasError('endBeforeStart')) {
          group.get('endDate')?.setErrors(null);
        }
      }
    }
    return null;
  };
} 