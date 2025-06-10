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
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray, Validators, AbstractControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import aichiGradesData from '../../services/23aichi_insurance_grades.json';
import pensionGradesData from '../../services/pension_grades.json';

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
  public aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGradesData;
  public pensionGrades: { [key: string]: { standardMonthlyWage: number } } = pensionGradesData;

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

  constructor(
    private route: ActivatedRoute,
    private employeeService: EmployeeService,
    private router: Router,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private insuranceEligibilityService: InsuranceEligibilityService
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
      employeeId: [''],
      lastNameKanji: [''],
      firstNameKanji: [''],
      lastNameKana: [''],
      firstNameKana: [''],
      birthDate: [''],
      gender: [''],
      address: [''],
      myNumber: [''],
      email: [''],
      phoneNumber: [''],
      role: ['']
    });

    this.employmentInfoForm = this.fb.group({
      employmentType: ['', Validators.required],
      department: ['', Validators.required],
      startDate: ['', Validators.required],
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
    });

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
        // birthDate
        if (this.employee.employeeBasicInfo.birthDate && typeof (this.employee.employeeBasicInfo.birthDate as any).toDate === 'function') {
          this.employee.employeeBasicInfo.birthDate = (this.employee.employeeBasicInfo.birthDate as any).toDate();
        }
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
        this.employmentInfoForm.patchValue(this.employee.employmentInfo);
        this.insuranceStatusForm.patchValue({
          ...this.employee.insuranceStatus,
          grade: this.employee.insuranceStatus.grade ?? null,
          newGrade: this.employee.insuranceStatus.newGrade ?? null,
          newStandardMonthlyWage: this.employee.insuranceStatus.newStandardMonthlyWage ?? null,
          newRevisionDate: this.employee.insuranceStatus.newRevisionDate ?? null
        });
        this.specialAttributesForm.patchValue(this.employee.specialAttributes);
        // 社会保険の加入判定を計算
        this.insuranceEligibility$ = this.insuranceEligibilityService.getInsuranceEligibility(this.employee);
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
        // 初期値セット時も反映
        const initialGrade = this.employmentInfoForm.get('grade')?.value;
        if (initialGrade && this.aichiGrades[String(initialGrade)]) {
          this.standardMonthlyWage = this.aichiGrades[String(initialGrade)].standardMonthlyWage;
        }
        this.insuranceStatusForm.get('newGrade')?.valueChanges.subscribe((grade) => {
          const key = String(grade);
          if (grade && this.pensionGrades[key]) {
            this.insuranceStatusForm.get('newStandardMonthlyWage')?.setValue(this.pensionGrades[key].standardMonthlyWage);
          } else {
            this.insuranceStatusForm.get('newStandardMonthlyWage')?.setValue(null);
          }
        });
      }
    } catch (error) {
      console.error('従業員情報の取得に失敗しました:', error);
      this.error = '従業員情報の取得に失敗しました';
    } finally {
      this.isLoading = false;
    }
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
        startDate: this.employee.employmentInfo.startDate ? this.formatDateInput(this.employee.employmentInfo.startDate) : '',
        monthlyWorkDays: this.employee.employmentInfo.monthlyWorkDays || ''
      });
    }
    if (section === 'insuranceStatus' && this.employee) {
      this.insuranceStatusForm.patchValue({
        ...this.employee.insuranceStatus,
        qualificationAcquisitionDate: this.employee.insuranceStatus.qualificationAcquisitionDate ? this.formatDateInput(this.employee.insuranceStatus.qualificationAcquisitionDate) : '',
        standardMonthlyRevisionDate: this.employee.insuranceStatus.standardMonthlyRevisionDate ? this.formatDateInput(this.employee.insuranceStatus.standardMonthlyRevisionDate) : '',
        insuranceQualificationDate: this.employee.insuranceStatus.insuranceQualificationDate ? this.formatDateInput(this.employee.insuranceStatus.insuranceQualificationDate) : '',
        qualificationLossDate: this.employee.insuranceStatus.qualificationLossDate ? this.formatDateInput(this.employee.insuranceStatus.qualificationLossDate) : '',
        grade: this.employee.insuranceStatus.grade ?? null,
        newGrade: this.employee.insuranceStatus.newGrade ?? null,
        newStandardMonthlyWage: this.employee.insuranceStatus.newStandardMonthlyWage ?? null,
        newRevisionDate: this.employee.insuranceStatus.newRevisionDate ? this.formatDateInput(this.employee.insuranceStatus.newRevisionDate) : null
      });
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
            birthDate: dep.birthDate ? new Date(dep.birthDate) : null
          }));
          
          await this.employeeService.setDependents(this.employee.id, dependents);
          this.employee.dependents = dependents;
        } else {
          // 他のセクションの保存処理
          switch (section) {
            case 'basicInfo':
              const updatedBasicInfo: EmployeeBasicInfo = {
                ...formValue,
                birthDate: formValue.birthDate ? new Date(formValue.birthDate) : null,
                hireDate: formValue.hireDate ? new Date(formValue.hireDate) : null
              };
              await this.employeeService.setBasicInfo(this.employee.id, updatedBasicInfo);
              this.employee.employeeBasicInfo = updatedBasicInfo;
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
              break;
            case 'insuranceStatus':
              const insuranceStatusValue = this.insuranceStatusForm.value;
              // 日付型の変換（他項目と同様）
              if (insuranceStatusValue.qualificationAcquisitionDate instanceof Date) {
                insuranceStatusValue.qualificationAcquisitionDate = insuranceStatusValue.qualificationAcquisitionDate;
              }
              if (insuranceStatusValue.standardMonthlyRevisionDate instanceof Date) {
                insuranceStatusValue.standardMonthlyRevisionDate = insuranceStatusValue.standardMonthlyRevisionDate;
              }
              if (insuranceStatusValue.newRevisionDate instanceof Date) {
                insuranceStatusValue.newRevisionDate = insuranceStatusValue.newRevisionDate;
              }
              // 保存
              this.employee.insuranceStatus = {
                ...this.employee.insuranceStatus,
                ...insuranceStatusValue
              };
              // 保存前に内容を出力
              console.log('保存するinsuranceStatus:', this.employee.insuranceStatus);
              // サブコレクションにも保存（employee.idを使う）
              await this.employeeService.setInsuranceStatus(this.employee.id, this.employee.insuranceStatus);
              this.editingSection['insuranceStatus'] = false;
              this.snackBar.open('社会保険情報を更新しました', '閉じる', { duration: 3000 });
              break;
            case 'specialAttributes':
              const updatedSpecialAttributes: SpecialAttributes = {
                ...formValue,
                leaveStartDate: formValue.leaveStartDate ? new Date(formValue.leaveStartDate) : null,
                leaveEndDate: formValue.leaveEndDate ? new Date(formValue.leaveEndDate) : null
              };
              await this.employeeService.setSpecialAttributes(this.employee.id, updatedSpecialAttributes);
              this.employee.specialAttributes = updatedSpecialAttributes;
              break;
          }
        }

        this.snackBar.open('保存しました', '閉じる', {
          duration: 3000
        });
        this.editingSection[section] = false;

        // 雇用情報または休暇情報が更新された場合、社会保険の加入判定を再計算
        if (section === 'employmentInfo' || section === 'specialAttributes') {
          this.insuranceEligibility$ = this.insuranceEligibilityService.getInsuranceEligibility(this.employee);
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
      name: [''],
      lastName: [''],
      firstName: [''],
      lastNameKana: [''],
      firstNameKana: [''],
      myNumber: [''],
      relationship: [''],
      relationshipOther: [''],
      birthDate: [null],
      income: [0],
      residency: ['国内'],
      cohabitation: ['同居'],
      occupation: ['']
    }));
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
      lastName: [dependent?.lastName || ''],
      firstName: [dependent?.firstName || ''],
      lastNameKana: [dependent?.lastNameKana || ''],
      firstNameKana: [dependent?.firstNameKana || ''],
      relationship: [dependent?.relationship || ''],
      relationshipOther: [dependent?.relationshipOther || ''],
      birthDate: [dependent?.birthDate || null],
      income: [dependent?.income || 0],
      residency: [dependent?.residency || ''],
      cohabitation: [dependent?.cohabitation || ''],
      occupation: [dependent?.occupation || ''],
      myNumber: [dependent?.myNumber || '']
    });
  }
}