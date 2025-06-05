import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormArray, ReactiveFormsModule, AbstractControl } from '@angular/forms';
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
        birthDate: [null, Validators.required],
        gender: ['', Validators.required],
        address: ['' ],
        myNumber: [''],
        email: ['', [Validators.email]],
        phoneNumber: ['', [Validators.pattern(/^[0-9]{2,4}-[0-9]{2,4}-[0-9]{4}$/)]],
        role: ['user'],
      }),
      employmentInfo: this.fb.group({
        employmentType: ['', Validators.required],
        department: ['', Validators.required],
        startDate: [null, Validators.required],
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
      }),
      insuranceStatus: this.fb.group({
        qualificationAcquisitionDate: [null],
        qualificationLossDate: [null],
        insuranceType: ['協会けんぽ'],
        remunerationCurrency: [0],
        remunerationInKind: [''],
        standardMonthlyRevisionDate: [null],
        insuranceQualificationDate: [null]
      }),
      dependents: this.fb.array([]),
      specialAttributes: this.fb.group({
        leaveType: [''],
        leaveStartDate: [null],
        leaveEndDate: [null],
        isOver70: [false],
        pensionExempt: [false],
        reached70Date: [null],
        isShortTimeWorker: [false],
        monthlyIncome: [0],
        residencyCertificateLocation: [''],
        assignmentAllowance: [0],
        cohabitationWithFamily: [true]
      })
    });
  }

  async ngOnInit() {
    this.employeeId = this.route.snapshot.paramMap.get('id');
    await this.loadDepartments();
    if (this.employeeId) {
      await this.loadEmployee();
    }
    // 等級変更時に標準報酬月額を自動反映
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
            birthDate: employee.employeeBasicInfo.birthDate instanceof Timestamp ? employee.employeeBasicInfo.birthDate.toDate() : employee.employeeBasicInfo.birthDate,
            hireDate: employee.employeeBasicInfo.hireDate instanceof Timestamp ? employee.employeeBasicInfo.hireDate.toDate() : employee.employeeBasicInfo.hireDate,
            department: employee.employmentInfo.department || ''
          },
          employmentInfo: {
            ...employee.employmentInfo,
            department: employee.employmentInfo.department || '',
            startDate: employee.employmentInfo.startDate instanceof Timestamp ? employee.employmentInfo.startDate.toDate() : employee.employmentInfo.startDate,
            endDate: employee.employmentInfo.endDate instanceof Timestamp ? employee.employmentInfo.endDate.toDate() : employee.employmentInfo.endDate
          },
          insuranceStatus: {
            ...employee.insuranceStatus,
            qualificationAcquisitionDate: employee.insuranceStatus.qualificationAcquisitionDate instanceof Timestamp ? employee.insuranceStatus.qualificationAcquisitionDate.toDate() : employee.insuranceStatus.qualificationAcquisitionDate,
            qualificationLossDate: employee.insuranceStatus.qualificationLossDate instanceof Timestamp ? employee.insuranceStatus.qualificationLossDate.toDate() : employee.insuranceStatus.qualificationLossDate,
            standardMonthlyRevisionDate: employee.insuranceStatus.standardMonthlyRevisionDate instanceof Timestamp ? employee.insuranceStatus.standardMonthlyRevisionDate.toDate() : employee.insuranceStatus.standardMonthlyRevisionDate,
            insuranceQualificationDate: employee.insuranceStatus.insuranceQualificationDate instanceof Timestamp ? employee.insuranceStatus.insuranceQualificationDate.toDate() : employee.insuranceStatus.insuranceQualificationDate
          },
          specialAttributes: {
            ...employee.specialAttributes,
            leaveStartDate: employee.specialAttributes.leaveStartDate instanceof Timestamp ? employee.specialAttributes.leaveStartDate.toDate() : employee.specialAttributes.leaveStartDate,
            leaveEndDate: employee.specialAttributes.leaveEndDate instanceof Timestamp ? employee.specialAttributes.leaveEndDate.toDate() : employee.specialAttributes.leaveEndDate,
            reached70Date: employee.specialAttributes.reached70Date instanceof Timestamp ? employee.specialAttributes.reached70Date.toDate() : employee.specialAttributes.reached70Date
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
              occupation: [dependent.occupation]
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
      lastName: [''],
      firstName: [''],
      lastNameKana: [''],
      firstNameKana: [''],
      myNumber: [''],
      birthDate: [null],
      relationship: [''],
      relationshipOther: [''],
      income: [0],
      residency: ['国内'],
      cohabitation: ['同居'],
      occupation: ['']
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
} 