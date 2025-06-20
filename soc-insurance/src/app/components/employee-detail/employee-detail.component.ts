import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService } from '../../services/employee.service';
import { InsuranceEligibilityService } from '../../services/insurance-eligibility.service';
import { EmployeeFullInfo, EmployeeBasicInfo, EmploymentInfo, InsuranceStatus, SpecialAttributes, Dependent } from '../../models/employee.model';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Timestamp } from 'firebase/firestore';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, Validators, AbstractControl, ValidatorFn } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import aichiGradesData from '../../services/23aichi_insurance_grades.json';
import pensionGradesData from '../../services/pension_grades.json';
import { AuthService } from '../../services/auth.service';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

@Component({
  selector: 'app-employee-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './employee-detail.component.html',
  styleUrl: './employee-detail.component.scss'
})
export class EmployeeDetailComponent implements OnInit {
  employee: EmployeeFullInfo | null = null;
  departments: string[] = [];
  isLoading = true;
  error: string | null = null;
  insuranceEligibility$: Observable<any> | null = null;
  standardMonthlyWage: number | null = null;
  pensionStandardMonthlyWage: number | null = null;
  public aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGradesData;
  public pensionGrades: { [key: string]: { standardMonthlyWage: number } } = pensionGradesData;
  public todayYear: number = new Date().getFullYear();
  public todayMonth: number = new Date().getMonth() + 1;

  editingSection: Record<string, boolean> = {
    basicInfo: false,
    employmentInfo: false,
    insuranceStatus: false,
    specialAttributes: false,
    dependents: false
  };

  basicInfoForm!: FormGroup;
  employmentInfoForm!: FormGroup;
  insuranceStatusForm!: FormGroup;
  specialAttributesForm!: FormGroup;
  dependentsForm!: FormGroup;

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
  futureDateValidator: ValidatorFn = (control: AbstractControl) => {
    const value = control.value;
    if (!value) return null;
    const inputDate = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (inputDate > today) {
      return { futureDate: true };
    }
    return null;
  };

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
        if (group.get('endDate')?.hasError('endBeforeStart')) {
          group.get('endDate')?.setErrors(null);
        }
      }
    }
    return null;
  };

  // 勤務開始日～退職予定日と雇用見込み期間に矛盾があれば雇用見込み期間にエラー
  employmentPeriodValidator: ValidatorFn = (group: AbstractControl) => {
    const start = group.get('startDate')?.value;
    const end = group.get('endDate')?.value;
    const months = group.get('expectedEmploymentMonths')?.value;
    
    // 退職予定日が入力されていない場合はバリデーションをスキップ
    if (!end) {
      // 既存のエラーがあればクリア
      if (group.get('expectedEmploymentMonths')?.hasError('periodMismatch')) {
        group.get('expectedEmploymentMonths')?.setErrors(null);
      }
      return null;
    }
    
    if (start && end && months) {
      const startDate = new Date(start);
      const endDate = new Date(end);
      // 月数計算
      let diffMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
      if (diffMonths > 0 && months > diffMonths) {
        group.get('expectedEmploymentMonths')?.setErrors({ periodMismatch: true });
        return { periodMismatch: true };
      } else {
        // 他のエラーがなければクリア
        if (group.get('expectedEmploymentMonths')?.hasError('periodMismatch')) {
          group.get('expectedEmploymentMonths')?.setErrors(null);
        }
      }
    }
    return null;
  };

  constructor(
    private route: ActivatedRoute,
    private employeeService: EmployeeService,
    private router: Router,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private insuranceEligibilityService: InsuranceEligibilityService,
    private authService: AuthService,
    private firestore: Firestore
  ) {}

  async loadDepartments() {
    try {
      this.departments = await this.employeeService.getDepartments();
      if (this.departments.length === 0) {
        this.snackBar.open('部署が設定されていません。先に会社設定で部署を登録してください。', '閉じる', {
          duration: 5000
        });
      }
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

  async getOfficeEmployeeCount(): Promise<number> {
    const officeDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
    if (officeDoc.exists()) {
      return officeDoc.data()['actualEmployeeCount'] || 0;
    }
    return 0;
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error = '従業員IDが指定されていません';
      this.isLoading = false;
      return;
    }

    // 1. 部署リストを取得
    await this.loadDepartments();

    // フォームの初期化
    this.basicInfoForm = this.fb.group({
      employeeId: ['', Validators.required],
      lastNameKanji: ['', Validators.required],
      firstNameKanji: ['', Validators.required],
      lastNameKana: ['', Validators.required],
      firstNameKana: ['', Validators.required],
      birthDate: ['', [Validators.required, this.futureDateValidator]],
      gender: [''],
      address: [''],
      myNumber: ['', [Validators.pattern(/^[0-9]{12}$/)]],
      email: [''],
      phoneNumber: ['']
    });

    this.employmentInfoForm = this.fb.group({
      employmentType: ['', Validators.required],
      department: ['', Validators.required],
      startDate: ['', Validators.required],
      endDate: [null],
      weeklyHours: ['', [Validators.required, Validators.min(1), Validators.max(168)]],
      monthlyWorkDays: ['', [Validators.required, Validators.min(1), Validators.max(31)]],
      expectedEmploymentMonths: ['', [Validators.min(1)]],
      grade: [null, [(control: AbstractControl) => {
        const value = control.value;
        if (value === null) return null; // 「なし」の場合はバリデーションをスキップ
        return value >= 1 ? null : { min: true };
      }]],
      baseSalary: ['', [Validators.required, Validators.min(0)]],
      isStudent: [false],
      studentType: [''],
      allowances: [0],
      commutingAllowance: [0],
      commuteRoute: [''],
      commutePassCost: [0],
      oneWayFare: [0],
      standardMonthlyRevisionDate: [null]
    }, { validators: [this.endDateAfterStartDateValidator, this.employmentPeriodValidator] });

    this.insuranceStatusForm = this.fb.group({
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
    });

    // 厚生年金の標準月額報酬フィールドを無効化
    this.insuranceStatusForm.get('newStandardMonthlyWage')?.disable();

    this.specialAttributesForm = this.fb.group({
      leaveType: [''],
      leaveStartDate: [''],
      leaveEndDate: ['']
    });

    this.dependentsForm = this.fb.group({
      dependents: this.fb.array([])
    });

    try {
      this.employee = await this.employeeService.getEmployee(id);
      if (this.employee) {
        // 生年月日の変換処理を改善
        console.log('生年月日変換前:', {
          original: this.employee.employeeBasicInfo.birthDate,
          type: typeof this.employee.employeeBasicInfo.birthDate,
          isDate: this.employee.employeeBasicInfo.birthDate instanceof Date,
          isTimestamp: this.employee.employeeBasicInfo.birthDate && typeof (this.employee.employeeBasicInfo.birthDate as any).toDate === 'function'
        });
        
        // employee serviceで既に変換済みの場合は再変換しない
        if (this.employee.employeeBasicInfo.birthDate && !(this.employee.employeeBasicInfo.birthDate instanceof Date)) {
          if (typeof (this.employee.employeeBasicInfo.birthDate as any).toDate === 'function') {
            this.employee.employeeBasicInfo.birthDate = (this.employee.employeeBasicInfo.birthDate as any).toDate();
          } else if (typeof this.employee.employeeBasicInfo.birthDate === 'string') {
            // 文字列の場合はDate型に変換
            this.employee.employeeBasicInfo.birthDate = new Date(this.employee.employeeBasicInfo.birthDate);
          }
        }
        
        // 生年月日の変換結果をデバッグログで確認
        console.log('生年月日変換後:', {
          converted: this.employee.employeeBasicInfo.birthDate,
          type: typeof this.employee.employeeBasicInfo.birthDate,
          isDate: this.employee.employeeBasicInfo.birthDate instanceof Date,
          isValid: this.employee.employeeBasicInfo.birthDate instanceof Date && !isNaN(this.employee.employeeBasicInfo.birthDate.getTime()),
          getTime: this.employee.employeeBasicInfo.birthDate instanceof Date ? this.employee.employeeBasicInfo.birthDate.getTime() : null
        });
        
        // hireDate
        if (this.employee.employeeBasicInfo.hireDate && typeof (this.employee.employeeBasicInfo.hireDate as any).toDate === 'function') {
          this.employee.employeeBasicInfo.hireDate = (this.employee.employeeBasicInfo.hireDate as any).toDate();
        }
        // employmentInfo.startDate
        if (this.employee.employmentInfo.startDate && typeof (this.employee.employmentInfo.startDate as any).toDate === 'function') {
          this.employee.employmentInfo.startDate = (this.employee.employmentInfo.startDate as any).toDate();
        }
        // employmentInfo.endDate
        if (this.employee.employmentInfo.endDate && typeof (this.employee.employmentInfo.endDate as any).toDate === 'function') {
          this.employee.employmentInfo.endDate = (this.employee.employmentInfo.endDate as any).toDate();
        }
        // insuranceStatus
        const ins = this.employee.insuranceStatus;
        if (ins.qualificationAcquisitionDate && typeof (ins.qualificationAcquisitionDate as any).toDate === 'function') ins.qualificationAcquisitionDate = (ins.qualificationAcquisitionDate as any).toDate();
        if (ins.qualificationLossDate && typeof (ins.qualificationLossDate as any).toDate === 'function') ins.qualificationLossDate = (ins.qualificationLossDate as any).toDate();
        if (ins.standardMonthlyRevisionDate && typeof (ins.standardMonthlyRevisionDate as any).toDate === 'function') ins.standardMonthlyRevisionDate = (ins.standardMonthlyRevisionDate as any).toDate();
        if (ins.insuranceQualificationDate && typeof (ins.insuranceQualificationDate as any).toDate === 'function') ins.insuranceQualificationDate = (ins.insuranceQualificationDate as any).toDate();
        if (ins.newRevisionDate && typeof (ins.newRevisionDate as any).toDate === 'function') ins.newRevisionDate = (ins.newRevisionDate as any).toDate();
        // specialAttributes
        const sp = this.employee.specialAttributes;
        if (sp.leaveStartDate && typeof (sp.leaveStartDate as any).toDate === 'function') sp.leaveStartDate = (sp.leaveStartDate as any).toDate();
        if (sp.leaveEndDate && typeof (sp.leaveEndDate as any).toDate === 'function') sp.leaveEndDate = (sp.leaveEndDate as any).toDate();
        if (sp.reached70Date && typeof (sp.reached70Date as any).toDate === 'function') sp.reached70Date = (sp.reached70Date as any).toDate();
        // dependents
        if (this.employee.dependents && Array.isArray(this.employee.dependents)) {
          this.employee.dependents = this.employee.dependents.map(dep => ({
            ...dep,
            birthDate: dep.birthDate && typeof (dep.birthDate as any).toDate === 'function' ? (dep.birthDate as any).toDate() : dep.birthDate
          }));
        }
        this.basicInfoForm.patchValue(this.employee.employeeBasicInfo);
        this.employmentInfoForm.patchValue({
          ...this.employee.employmentInfo,
          startDate: this.toDateSafe(this.employee.employmentInfo.startDate),
          endDate: this.toDateSafe(this.employee.employmentInfo.endDate)
        });
        this.insuranceStatusForm.patchValue({
          ...this.employee.insuranceStatus,
          grade: this.employee.insuranceStatus.grade ?? null,
          newGrade: this.employee.insuranceStatus.newGrade ?? null,
          newStandardMonthlyWage: this.employee.insuranceStatus.newStandardMonthlyWage ?? null,
          newRevisionDate: this.employee.insuranceStatus.newRevisionDate ?? null
        });
        this.specialAttributesForm.patchValue(this.employee.specialAttributes);
        // 社会保険の加入判定を計算
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        const officeEmployeeCount = await this.getOfficeEmployeeCount();
        
        // デバッグログを追加
        console.log('employee detail 保険判定初期化:', {
          employeeId: this.employee.id,
          birthDate: this.employee.employeeBasicInfo.birthDate,
          birthDateType: typeof this.employee.employeeBasicInfo.birthDate,
          birthDateIsValid: this.employee.employeeBasicInfo.birthDate instanceof Date && !isNaN(this.employee.employeeBasicInfo.birthDate.getTime()),
          year,
          month,
          officeEmployeeCount,
          leaveType: this.employee.specialAttributes?.leaveType,
          leaveStartDate: this.employee.specialAttributes?.leaveStartDate,
          leaveEndDate: this.employee.specialAttributes?.leaveEndDate
        });
        
        this.insuranceEligibility$ = this.insuranceEligibilityService.getInsuranceEligibility(this.employee, year, month, officeEmployeeCount);
        
        // 保険判定結果のデバッグログを追加
        this.insuranceEligibility$.subscribe(result => {
          console.log('employee detail 保険判定結果:', {
            employeeId: this.employee?.id,
            healthInsurance: result.healthInsurance,
            nursingInsurance: result.nursingInsurance,
            pensionInsurance: result.pensionInsurance,
            reason: result.reason,
            nursingInsuranceStartMonth: result.nursingInsuranceStartMonth,
            nursingInsuranceEndMonth: result.nursingInsuranceEndMonth
          });
        });
        if (this.employee.dependents) {
          const dependentsArray = this.dependentsForm.get('dependents') as FormArray;
          this.employee.dependents.forEach(dep => {
            dependentsArray.push(this.createDependentFormGroup(dep));
          });
        }
        // 等級変更時に標準報酬月額を自動反映（社会保険情報フォーム用）
        this.insuranceStatusForm.get('grade')?.valueChanges.subscribe((grade) => {
          const key = String(grade);
          if (grade && this.aichiGrades[key]) {
            this.standardMonthlyWage = this.aichiGrades[key].standardMonthlyWage;
          } else {
            this.standardMonthlyWage = null;
          }
        });
        // 生年月日の変更を監視して社会保険情報をリアルタイム更新
        this.basicInfoForm.get('birthDate')?.valueChanges.subscribe(async (newBirthDate) => {
          if (this.employee && newBirthDate) {
            console.log('生年月日変更検知:', {
              newBirthDate,
              newBirthDateType: typeof newBirthDate,
              employeeId: this.employee.id
            });
            
            // 一時的にemployeeの生年月日を更新して保険判定を再計算
            const originalBirthDate = this.employee.employeeBasicInfo.birthDate;
            this.employee.employeeBasicInfo.birthDate = new Date(newBirthDate);
            
            const today = new Date();
            const year = today.getFullYear();
            const month = today.getMonth() + 1;
            const officeEmployeeCount = await this.getOfficeEmployeeCount();
            
            console.log('生年月日変更による保険判定再計算:', {
              newBirthDate: this.employee.employeeBasicInfo.birthDate,
              year,
              month,
              officeEmployeeCount
            });
            
            this.insuranceEligibility$ = this.insuranceEligibilityService.getInsuranceEligibility(this.employee, year, month, officeEmployeeCount);
            
            // 元の生年月日に戻す（実際の保存は保存ボタンで行う）
            this.employee.employeeBasicInfo.birthDate = originalBirthDate;
          }
        });
        // 初期値セット時も反映
        const initialGrade = this.employmentInfoForm.get('grade')?.value;
        if (initialGrade && this.aichiGrades[String(initialGrade)]) {
          this.standardMonthlyWage = this.aichiGrades[String(initialGrade)].standardMonthlyWage;
        }
        const initialPensionGrade = this.insuranceStatusForm.get('newGrade')?.value;
        if (initialPensionGrade && this.pensionGrades[String(initialPensionGrade)]) {
          this.pensionStandardMonthlyWage = this.pensionGrades[String(initialPensionGrade)].standardMonthlyWage;
        }
        this.insuranceStatusForm.get('newGrade')?.valueChanges.subscribe((grade) => {
          const key = String(grade);
          if (grade && this.pensionGrades[key]) {
            this.pensionStandardMonthlyWage = this.pensionGrades[key].standardMonthlyWage;
            this.insuranceStatusForm.get('newStandardMonthlyWage')?.setValue(this.pensionGrades[key].standardMonthlyWage, { emitEvent: false });
          } else {
            this.pensionStandardMonthlyWage = null;
            this.insuranceStatusForm.get('newStandardMonthlyWage')?.setValue(null, { emitEvent: false });
          }
        });
      }
    } catch (error) {
      console.error('従業員情報の取得に失敗しました:', error);
      this.error = '従業員情報の取得に失敗しました';
    } finally {
      this.isLoading = false;
    }

    this.specialAttributesForm.get('leaveType')?.valueChanges.subscribe((leaveType) => {
      const startCtrl = this.specialAttributesForm.get('leaveStartDate');
      const endCtrl = this.specialAttributesForm.get('leaveEndDate');
      if (leaveType) {
        startCtrl?.setValidators([Validators.required]);
        endCtrl?.setValidators([Validators.required]);
      } else {
        startCtrl?.clearValidators();
        endCtrl?.clearValidators();
        startCtrl?.setValue('');
        endCtrl?.setValue('');
      }
      startCtrl?.updateValueAndValidity();
      endCtrl?.updateValueAndValidity();
    });

    // 保険種別の変更を監視
    this.insuranceStatusForm.get('insuranceType')?.valueChanges.subscribe(type => {
      if (type !== '協会けんぽ') {
        // 協会けんぽ以外の場合、等級と標準報酬月額をクリア
        this.insuranceStatusForm.patchValue({
          grade: null,
          newGrade: null,
          newStandardMonthlyWage: null,
          standardMonthlyRevisionDate: null,
          newRevisionDate: null
        });
        this.standardMonthlyWage = null;
      }
    });
  }

  // 編集開始
  editSection(section: string) {
    if (section === 'basicInfo' && this.employee) {
      this.basicInfoForm.patchValue({
        ...this.employee.employeeBasicInfo,
        birthDate: this.employee.employeeBasicInfo.birthDate ? this.formatDateInput(this.employee.employeeBasicInfo.birthDate) : ''
      });
    }
    if (section === 'employmentInfo' && this.employee) {
      this.employmentInfoForm.patchValue({
        ...this.employee.employmentInfo,
        startDate: this.toDateSafe(this.employee.employmentInfo.startDate),
        endDate: this.toDateSafe(this.employee.employmentInfo.endDate),
        monthlyWorkDays: this.employee.employmentInfo.monthlyWorkDays || '',
        grade: this.employee.employmentInfo.grade || null
      });
    }
    if (section === 'insuranceStatus' && this.employee) {
      const insuranceStatus = this.employee.insuranceStatus;
      this.insuranceStatusForm.patchValue({
        ...insuranceStatus,
        qualificationAcquisitionDate: insuranceStatus.qualificationAcquisitionDate ? this.formatDateInput(insuranceStatus.qualificationAcquisitionDate) : '',
        standardMonthlyRevisionDate: insuranceStatus.standardMonthlyRevisionDate ? this.formatDateInput(insuranceStatus.standardMonthlyRevisionDate) : '',
        insuranceQualificationDate: insuranceStatus.insuranceQualificationDate ? this.formatDateInput(insuranceStatus.insuranceQualificationDate) : '',
        qualificationLossDate: insuranceStatus.qualificationLossDate ? this.formatDateInput(insuranceStatus.qualificationLossDate) : '',
        grade: insuranceStatus.grade ? Number(insuranceStatus.grade) : null,
        newGrade: insuranceStatus.newGrade ? Number(insuranceStatus.newGrade) : null,
        newStandardMonthlyWage: insuranceStatus.newStandardMonthlyWage ? Number(insuranceStatus.newStandardMonthlyWage) : null,
        newRevisionDate: insuranceStatus.newRevisionDate ? this.formatDateInput(insuranceStatus.newRevisionDate) : null
      });

      // 標準報酬月額を設定
      if (insuranceStatus.grade && this.aichiGrades[String(insuranceStatus.grade)]) {
        this.standardMonthlyWage = this.aichiGrades[String(insuranceStatus.grade)].standardMonthlyWage;
      }
      // 厚生年金の標準報酬月額を設定
      if (insuranceStatus.newGrade && this.pensionGrades[String(insuranceStatus.newGrade)]) {
        this.pensionStandardMonthlyWage = this.pensionGrades[String(insuranceStatus.newGrade)].standardMonthlyWage;
      }
    }
    if (section === 'specialAttributes' && this.employee) {
      this.specialAttributesForm.patchValue({
        ...this.employee.specialAttributes,
        leaveStartDate: this.employee.specialAttributes.leaveStartDate ? this.formatDateInput(this.employee.specialAttributes.leaveStartDate) : '',
        leaveEndDate: this.employee.specialAttributes.leaveEndDate ? this.formatDateInput(this.employee.specialAttributes.leaveEndDate) : '',
        reached70Date: this.employee.specialAttributes.reached70Date ? this.formatDateInput(this.employee.specialAttributes.reached70Date) : ''
      });
    }
    if (section === 'dependents' && this.employee) {
      this.dependentsForm.patchValue({
        dependents: this.employee.dependents
      });
    }
    this.editingSection[section] = true;
  }

  // 編集キャンセル
  cancelEdit(section: string) {
    this.editingSection[section] = false;
  }

  // 保存処理
  async saveSection(section: string) {
    if (!this.employee) return;

    let form: FormGroup;
    switch (section) {
      case 'basicInfo':
        form = this.basicInfoForm;
        break;
      case 'employmentInfo':
        form = this.employmentInfoForm;
        break;
      case 'insuranceStatus':
        form = this.insuranceStatusForm;
        break;
      case 'dependents':
        form = this.dependentsForm;
        break;
      case 'specialAttributes':
        form = this.specialAttributesForm;
        break;
      default:
        return;
    }

    if (form.valid) {
      try {
        const formValue = form.value;
        
        if (section === 'dependents') {
          // 扶養者情報の保存処理を改善
          const dependents = formValue.dependents.map((dep: any) => ({
            ...dep,
            birthDate: dep.birthDate ? new Date(dep.birthDate) : null,
            schoolGrade: dep.schoolGrade || '',
            occupationOther: dep.occupationOther || ''
          }));
          
          await this.employeeService.setDependents(this.employee.id, dependents);
          this.employee.dependents = dependents;
        } else {
          // 他のセクションの保存処理
          switch (section) {
            case 'basicInfo':
              console.log('basicInfo保存前:', {
                formValue: formValue,
                birthDate: formValue.birthDate,
                birthDateType: typeof formValue.birthDate
              });
              
              const updatedBasicInfo: EmployeeBasicInfo = {
                ...formValue,
                birthDate: formValue.birthDate ? new Date(formValue.birthDate) : null,
                hireDate: formValue.hireDate ? new Date(formValue.hireDate) : null
              };
              
              console.log('basicInfo保存後:', {
                updatedBasicInfo: updatedBasicInfo,
                birthDate: updatedBasicInfo.birthDate,
                birthDateType: typeof updatedBasicInfo.birthDate,
                birthDateIsDate: updatedBasicInfo.birthDate instanceof Date
              });
              
              await this.employeeService.setBasicInfo(this.employee.id, updatedBasicInfo);
              
              // 保存後に最新データを再取得
              const updatedEmployee = await this.employeeService.getEmployee(this.employee.id);
              if (updatedEmployee) {
                this.employee = updatedEmployee;
                console.log('employee再取得後:', {
                  birthDate: this.employee.employeeBasicInfo.birthDate,
                  birthDateType: typeof this.employee.employeeBasicInfo.birthDate,
                  birthDateIsDate: this.employee.employeeBasicInfo.birthDate instanceof Date
                });
                
                // 画面表示用のデータも更新
                this.basicInfoForm.patchValue({
                  ...this.employee.employeeBasicInfo,
                  birthDate: this.employee.employeeBasicInfo.birthDate ? this.formatDateInput(this.employee.employeeBasicInfo.birthDate) : ''
                });
                
                console.log('画面表示更新後:', {
                  formBirthDate: this.basicInfoForm.get('birthDate')?.value,
                  employeeBirthDate: this.employee.employeeBasicInfo.birthDate
                });
              }
              
              this.employeeService.notifyEmployeeUpdated();
              break;
            case 'employmentInfo':
              const updatedEmploymentInfo: EmploymentInfo = {
                ...formValue,
                startDate: formValue.startDate ? new Date(formValue.startDate) : null,
                standardMonthlyRevisionDate: formValue.standardMonthlyRevisionDate ? new Date(formValue.standardMonthlyRevisionDate) : null
              };
              // gradeはemploymentInfoから除外
              if ('grade' in updatedEmploymentInfo) {
                delete (updatedEmploymentInfo as any).grade;
              }
              await this.employeeService.setEmploymentInfo(this.employee.id, updatedEmploymentInfo);
              this.employee.employmentInfo = updatedEmploymentInfo;
              this.employeeService.notifyEmployeeUpdated();
              break;
            case 'insuranceStatus':
              await this.saveInsuranceStatus();
              this.employeeService.notifyEmployeeUpdated();
              break;
            case 'specialAttributes':
              const updatedSpecialAttributes: SpecialAttributes = {
                ...formValue,
                leaveStartDate: formValue.leaveStartDate ? new Date(formValue.leaveStartDate) : null,
                leaveEndDate: formValue.leaveEndDate ? new Date(formValue.leaveEndDate) : null
              };
              await this.employeeService.setSpecialAttributes(this.employee.id, updatedSpecialAttributes);
              this.employee.specialAttributes = updatedSpecialAttributes;
              this.employeeService.notifyEmployeeUpdated();
              break;
          }
        }

        this.snackBar.open('保存しました', '閉じる', {
          duration: 3000
        });
        
        // 保存完了後の状態確認
        console.log('保存完了後の状態:', {
          section,
          employeeBirthDate: this.employee?.employeeBasicInfo?.birthDate,
          employeeBirthDateType: typeof this.employee?.employeeBasicInfo?.birthDate,
          employeeBirthDateIsDate: this.employee?.employeeBasicInfo?.birthDate instanceof Date,
          formBirthDate: this.basicInfoForm.get('birthDate')?.value
        });
        
        this.editingSection[section] = false;

        // 雇用情報または休暇情報が更新された場合、社会保険の加入判定を再計算
        if (section === 'employmentInfo' || section === 'specialAttributes' || section === 'basicInfo') {
          const today = new Date();
          const year = today.getFullYear();
          const month = today.getMonth() + 1;
          const officeEmployeeCount = await this.getOfficeEmployeeCount();
          this.insuranceEligibility$ = this.insuranceEligibilityService.getInsuranceEligibility(this.employee, year, month, officeEmployeeCount);
        }
      } catch (error) {
        console.error('保存エラー:', error);
        this.snackBar.open('保存に失敗しました', '閉じる', {
          duration: 3000
        });
      }
    }
  }

  // 日付入力用フォーマット（yyyy-MM-dd）
  formatDateInput(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${d.getFullYear()}-${month}-${day}`;
  }

  addDependent() {
    const dependentsArray = this.dependentsForm.get('dependents') as FormArray;
    dependentsArray.push(this.fb.group({
      lastName: ['', Validators.required],
      firstName: ['', Validators.required],
      lastNameKana: ['', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
      firstNameKana: ['', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
      relationship: ['', Validators.required],
      relationshipOther: [''],
      birthDate: [null, [Validators.required, this.futureDateValidator]],
      income: [0, [Validators.required, Validators.min(0)]],
      residency: ['', Validators.required],
      cohabitation: ['', Validators.required],
      occupation: [''],
      schoolGrade: [''],
      occupationOther: [''],
      myNumber: ['', [Validators.pattern(/^[0-9]{12}$/)]]
    }, { validators: this.relationshipOtherRequiredValidator }));
  }

  removeDependent(index: number) {
    const dependentsArray = this.dependentsForm.get('dependents') as FormArray;
    dependentsArray.removeAt(index);
  }

  get dependentsArray(): FormArray {
    return this.dependentsForm.get('dependents') as FormArray;
  }

  async onDelete() {
    if (!this.employee) return;
    if (confirm('本当にこの従業員を削除しますか？')) {
      await this.employeeService.deleteEmployee(this.employee.id);
      this.router.navigate(['/admin/employees']);
    }
  }

  createDependentFormGroup(dependent?: Dependent): FormGroup {
    return this.fb.group({
      lastName: [dependent?.lastName || '', Validators.required],
      firstName: [dependent?.firstName || '', Validators.required],
      lastNameKana: [dependent?.lastNameKana || '', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
      firstNameKana: [dependent?.firstNameKana || '', [Validators.required, Validators.pattern(/^[ァ-ヶー]+$/)]],
      birthDate: [this.toDateSafe(dependent?.birthDate), [Validators.required, this.futureDateValidator]],
      relationship: [dependent?.relationship || '', Validators.required],
      relationshipOther: [dependent?.relationshipOther || ''],
      myNumber: [dependent?.myNumber || '', [Validators.pattern(/^[0-9]{12}$/)]],
      income: [dependent?.income || 0, [Validators.required, Validators.min(0)]],
      residency: [dependent?.residency || '', Validators.required],
      cohabitation: [dependent?.cohabitation || '', Validators.required],
      occupation: [dependent?.occupation || ''],
      schoolGrade: [dependent?.schoolGrade || ''],
      occupationOther: [dependent?.occupationOther || '']
    }, { validators: [this.relationshipOtherRequiredValidator] });
  }

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/home']);
  }

  async saveInsuranceStatus() {
    if (this.insuranceStatusForm.valid && this.employee) {
      try {
        const formValue = this.insuranceStatusForm.getRawValue();
        
        // 現在の年月を取得
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;

        // 介護保険の加入判定を厳密に行う
        const isNursingEligible = this.isNursingInsuranceEligibleAt(
          this.employee.employeeBasicInfo.birthDate,
          year,
          month
        );
        
        // 等級情報を厳密に保存
        const insuranceStatus: InsuranceStatus = {
          healthInsurance: formValue.healthInsurance,
          nursingInsurance: isNursingEligible, // 厳密な判定結果を使用
          pensionInsurance: formValue.pensionInsurance,
          qualificationAcquisitionDate: formValue.qualificationAcquisitionDate ? new Date(formValue.qualificationAcquisitionDate) : null,
          insuranceType: formValue.insuranceType,
          remunerationCurrency: formValue.remunerationCurrency,
          remunerationInKind: formValue.remunerationInKind,
          standardMonthlyRevisionDate: formValue.standardMonthlyRevisionDate ? new Date(formValue.standardMonthlyRevisionDate) : null,
          insuranceQualificationDate: formValue.insuranceQualificationDate ? new Date(formValue.insuranceQualificationDate) : null,
          qualificationLossDate: formValue.qualificationLossDate ? new Date(formValue.qualificationLossDate) : null,
          grade: formValue.grade ? Number(formValue.grade) : null,
          newGrade: formValue.newGrade ? Number(formValue.newGrade) : null,
          newStandardMonthlyWage: formValue.newStandardMonthlyWage ? Number(formValue.newStandardMonthlyWage) : null,
          newRevisionDate: formValue.newRevisionDate ? new Date(formValue.newRevisionDate) : null,
          standardMonthlyWage: formValue.grade ? this.aichiGrades[String(formValue.grade)]?.standardMonthlyWage : null
        };

        // Firestoreに保存
        await this.employeeService.setInsuranceStatus(this.employee.id, insuranceStatus);
        
        // 保存後に最新データを再取得
        const updatedEmployee = await this.employeeService.getEmployee(this.employee.id);
        if (updatedEmployee) {
          this.employee = updatedEmployee;
          this.insuranceStatusForm.patchValue({
            ...this.employee.insuranceStatus,
            qualificationAcquisitionDate: this.employee.insuranceStatus?.qualificationAcquisitionDate ? this.formatDateInput(this.employee.insuranceStatus.qualificationAcquisitionDate) : '',
            standardMonthlyRevisionDate: this.employee.insuranceStatus?.standardMonthlyRevisionDate ? this.formatDateInput(this.employee.insuranceStatus.standardMonthlyRevisionDate) : '',
            insuranceQualificationDate: this.employee.insuranceStatus?.insuranceQualificationDate ? this.formatDateInput(this.employee.insuranceStatus.insuranceQualificationDate) : '',
            qualificationLossDate: this.employee.insuranceStatus?.qualificationLossDate ? this.formatDateInput(this.employee.insuranceStatus.qualificationLossDate) : '',
            newRevisionDate: this.employee.insuranceStatus?.newRevisionDate ? this.formatDateInput(this.employee.insuranceStatus.newRevisionDate) : null
          });
        }
        
        this.snackBar.open('保険情報を保存しました', '閉じる', { duration: 3000 });
        this.editingSection['insuranceStatus'] = false;
      } catch (error) {
        console.error('保険情報の保存に失敗:', error);
        this.snackBar.open('保険情報の保存に失敗しました', '閉じる', { duration: 5000 });
      }
    }
  }

  // 介護保険の加入判定をテンプレートや他メソッドからも使えるようにpublicでラップ
  public isNursingInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    return this.insuranceEligibilityService.isNursingInsuranceEligibleAt(birthDate, year, month);
  }

  public isActuallyNursingInsuranceEligible(eligibility: any): boolean {
    return this.insuranceEligibilityService.isActuallyNursingInsuranceEligible(eligibility);
  }

  // 指定年月時点の年齢を計算するメソッドを追加
  public calculateAgeAt(birthDate: Date | string | null, year: number, month: number): number {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    
    const baseDate = new Date(year, month - 1, 1); // その月の1日
    let age = baseDate.getFullYear() - birth.getFullYear();
    const m = baseDate.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && baseDate.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  // 生年月日がDate型かどうかを判定するメソッドを追加
  public isBirthDateValid(birthDate: any): boolean {
    return birthDate instanceof Date && !isNaN(birthDate.getTime());
  }

  getInsuranceStatusMessage(): string {
    if (!this.employee) return '';

    const today = new Date();
    const endDate = this.employee.employmentInfo?.endDate ? new Date(this.employee.employmentInfo.endDate) : null;

    if (endDate) {
      const endDatePlus1 = new Date(endDate);
      endDatePlus1.setDate(endDatePlus1.getDate() + 1);

      if (endDatePlus1 <= today) {
        return '退職済みのため、社会保険の加入対象外です。';
      }

      if (endDate.getFullYear() === today.getFullYear() &&
          endDate.getMonth() === today.getMonth() &&
          endDate.getDate() === today.getDate()) {
        return '本日退職のため、本日まで社会保険の加入対象です。';
      }

      if (endDate.getFullYear() === today.getFullYear() &&
          endDate.getMonth() === today.getMonth()) {
        return `${endDate.getDate()}日退職予定のため、${endDate.getDate()}日まで社会保険の加入対象です。`;
      }
    }

    // 退職日以外は空文字を返す
    return '';
  }

  /**
   * 指定された月が休業期間中かつ免除対象の休業種別ならtrueを返す
   * その月の期間中に休業期間が重複しているかをチェック
   * 14日ルールの判定も含む
   */
  isExemptedMonth(targetDate: Date = new Date()): boolean {
    const leaveType = this.employee?.specialAttributes?.leaveType;
    const start = this.employee?.specialAttributes?.leaveStartDate ? new Date(this.employee.specialAttributes.leaveStartDate) : null;
    const end = this.employee?.specialAttributes?.leaveEndDate ? new Date(this.employee.specialAttributes.leaveEndDate) : null;
    
    if (!leaveType || !start || !end) return false;
    
    // 免除対象の休業種別
    const isExemptType = ['育児休業', '産前産後休業'].includes(leaveType);
    if (!isExemptType) return false;
    
    // 指定された月の開始日と終了日を計算
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0); // その月の最終日
    
    // 休業期間と指定月の期間が重複しているかをチェック
    const isInLeavePeriod = start <= monthEnd && end >= monthStart;
    
    if (!isInLeavePeriod) return false;
    
    // その月の休業日数を計算
    const intersectionStart = start > monthStart ? start : monthStart;
    const intersectionEnd = end < monthEnd ? end : monthEnd;

    // getTime()でミリ秒の差を取り、日数に変換。+1で該当日も含む
    const leaveDaysInMonth = Math.floor((intersectionEnd.getTime() - intersectionStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // 育児休業・産前産後休業中で、その月の休業日数が14日以上の場合に免除対象
    return leaveDaysInMonth >= 14;
  }

  /**
   * HTMLテンプレート用のヘルパーメソッド
   * 月を2桁の文字列に変換する
   */
  formatMonth(month: number): string {
    return String(month).padStart(2, '0');
  }

  /**
   * HTMLテンプレート用のヘルパーメソッド
   * 現在の年月をYYYY-MM形式で取得する
   */
  getCurrentYearMonth(): string {
    return `${this.todayYear}-${this.formatMonth(this.todayMonth)}`;
  }
}