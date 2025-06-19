import { Component, OnInit, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { InsuranceData } from '../../models/insurance.model';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { EmployeeService } from '../../services/employee.service';
import { InsuranceCalculationService } from '../../services/insuranceCalculationService';
import { InsuranceEditComponent } from '../insurance-edit/insurance-edit.component';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { InsuranceEligibilityService } from '../../services/insurance-eligibility.service';

@Component({
  selector: 'app-insurance-management',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule
  ],
  templateUrl: './insurance-management.component.html',
  styleUrls: ['./insurance-management.component.scss']
})
export class InsuranceManagementComponent implements OnInit, AfterViewInit {
  @ViewChild('pdfContent', { static: false }) pdfContent?: ElementRef;
  displayedColumns: string[] = [
    'fullName',
    'employeeId',
    'department',
    'grade',
    'pensionGrade',
    'baseSalary',
    'standardMonthlyRemuneration',
    'actions',
    'export'
  ];

  filterForm: FormGroup;
  showEmployeeId = true;
  dataSource: InsuranceData[] = [];
  isLoading = true;
  error: string | null = null;
  currentYear: number;
  currentMonth: number;
  selectedYear: number;
  selectedMonth: number;
  insuranceData: any[] = [];
  private companyPrefecture: string | null = null;
  companyName: string = '';
  today = new Date();
  bonusCount: number = 3; // 賞与回数の初期値を3に設定
  departments: string[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private dialog: MatDialog,
    private employeeService: EmployeeService,
    private insuranceCalculationService: InsuranceCalculationService,
    private firestore: Firestore,
    private insuranceEligibilityService: InsuranceEligibilityService
  ) {
    this.filterForm = this.fb.group({
      year: [new Date().getFullYear()],
      month: [new Date().getMonth() + 1],
      department: ['all'],
      showEmployeeId: [true]
    });

    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;
    this.selectedYear = this.currentYear;
    this.selectedMonth = this.currentMonth;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCompanyPrefecture();
    await this.loadCompanyName();
    this.departments = await this.employeeService.getDepartments();
    // 部署リストにない値なら'all'にリセット
    const currentDept = this.filterForm.get('department')?.value;
    if (currentDept !== 'all' && !this.departments.includes(currentDept)) {
      this.filterForm.patchValue({ department: 'all' });
    }
    // URLやstateから年月を復元
    const nav = window.history.state;
    if (nav && nav.year && nav.month) {
      this.filterForm.patchValue({ year: nav.year, month: nav.month });
      this.selectedYear = nav.year;
      this.selectedMonth = nav.month;
    }
    this.filterForm.valueChanges.subscribe(values => {
      this.showEmployeeId = values.showEmployeeId;
      this.selectedYear = values.year;
      this.selectedMonth = values.month;
      this.updateDisplayedColumns();
      this.loadData();
    });
    // 初期値も反映
    this.selectedYear = this.filterForm.get('year')?.value;
    this.selectedMonth = this.filterForm.get('month')?.value;
    this.loadData();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      const nav = window.history.state;
      if (nav && nav.year && nav.month) {
        const formYear = this.filterForm.get('year')?.value;
        const formMonth = this.filterForm.get('month')?.value;
        if (formYear !== nav.year || formMonth !== nav.month) {
          this.filterForm.patchValue({ year: nav.year, month: nav.month });
        }
      }
    }, 0);
  }

  private updateDisplayedColumns(): void {
    const baseColumns = [
      'fullName',
      'department',
      'grade',
      'pensionGrade',
      'baseSalary',
      'standardMonthlyRemuneration',
      'actions',
      'export'
    ];
    if (this.showEmployeeId) {
      this.displayedColumns = ['fullName', 'employeeId', ...baseColumns.filter(col => col !== 'fullName')];
    } else {
      this.displayedColumns = baseColumns;
    }
  }

  // 会社全体の保険料明細をFirestoreに保存する共通処理
  async saveCompanySummaryToFirestore() {
    const yearMonth = `${this.selectedYear}_${('0' + this.selectedMonth).slice(-2)}`;
    const companyDocRef = doc(this.firestore, 'insuranceDetails', yearMonth, 'company', 'summary');
    const saveData = {
      main: this.companySummaryTable.rows,
      bonus: this.hasBonus ? this.companyBonusSummaryTable.rows : []
    };
    await setDoc(companyDocRef, saveData);
  }

  // データロード後、全員分が確定していれば自動保存
  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      await this.loadInsuranceData();
      this.dataSource = this.insuranceData;
      // 全員分が確定していれば自動保存
      if (this.isAllConfirmed) {
        await this.saveCompanySummaryToFirestore();
      }
    } catch (error) {
      console.error('Error loading insurance data:', error);
      this.error = 'データの読み込み中にエラーが発生しました。';
    } finally {
      // 社員番号（employeeId）で昇順ソート
      this.insuranceData.sort((a, b) => a.employeeId - b.employeeId);
      this.isLoading = false;
    }
  }

  onEdit(insuranceData: InsuranceData): void {
    this.router.navigate([
      '/admin/insurance',
      insuranceData.id,
      'edit'
    ], {
      state: {
        data: insuranceData,
        year: this.selectedYear,
        month: this.selectedMonth
      }
    });
  }

  get totalStandardMonthlyRemuneration(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.standardMonthlyRemuneration || 0), 0);
  }
  get totalHealthInsuranceEmployee(): number {
    return this.dataSource.filter(row => row.hasInsuranceDetail).reduce((sum, row) => sum + (row.healthInsuranceEmployee || 0), 0);
  }
  get totalHealthInsuranceEmployer(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.healthInsuranceEmployer || 0), 0);
  }
  get totalNursingInsuranceEmployee(): number {
    return this.dataSource.filter(row => row.hasInsuranceDetail).reduce((sum, row) => sum + (row.nursingInsuranceEmployee || 0), 0);
  }
  get totalPensionInsuranceEmployee(): number {
    return this.dataSource.filter(row => row.hasInsuranceDetail).reduce((sum, row) => sum + (row.pensionInsuranceEmployee || 0), 0);
  }
  get totalEmployeeTotalDeduction(): number {
    return this.dataSource.filter(row => row.hasInsuranceDetail).reduce((sum, row) => sum + (row.employeeTotalDeduction || 0), 0);
  }

  // 会社全体の保険料明細を表示するためのプロパティ
  get isAllConfirmed(): boolean {
    return this.dataSource.every(row => row.standardMonthlyRemuneration !== null && row.standardMonthlyRemuneration !== undefined);
  }

  get companySummary() {
    // 会社名は設定から取得（例: settings/office）
    const officeName = this.companyName || '（会社名未設定）';
    // 対象期間
    const period = `${this.selectedYear}年${this.selectedMonth}月`;
    // 合計計算
    const totalHealthInsuranceEmployer = this.dataSource.reduce((sum, row) => sum + (row.healthInsuranceEmployer || 0), 0);
    const totalHealthInsuranceEmployee = this.dataSource.reduce((sum, row) => sum + (row.healthInsuranceEmployee || 0), 0);
    const totalNursingInsuranceEmployer = this.dataSource.reduce((sum, row) => sum + (row.nursingInsuranceEmployer || 0), 0);
    const totalNursingInsuranceEmployee = this.dataSource.reduce((sum, row) => sum + (row.nursingInsuranceEmployee || 0), 0);
    const totalPensionInsuranceEmployer = this.dataSource.reduce((sum, row) => sum + (row.pensionInsuranceEmployer || 0), 0);
    const totalPensionInsuranceEmployee = this.dataSource.reduce((sum, row) => sum + (row.pensionInsuranceEmployee || 0), 0);
    const totalChildContribution = this.dataSource.reduce((sum, row) => sum + (row.childContribution || 0), 0);
    
    // 従業員負担分の合計は端数処理を適用
    const totalEmployee = this.calculateEmployeeTotalInsurance(
      totalHealthInsuranceEmployee,
      totalNursingInsuranceEmployee,
      totalPensionInsuranceEmployee
    );
    
    // 会社負担分の合計は端数処理せず単純合算（小数点あり）
    const totalEmployer = totalHealthInsuranceEmployer + totalNursingInsuranceEmployer + totalPensionInsuranceEmployer;

    return {
      period,
      officeName,
      totalHealthInsuranceEmployer,
      totalHealthInsuranceEmployee,
      totalNursingInsuranceEmployer,
      totalNursingInsuranceEmployee,
      totalPensionInsuranceEmployer,
      totalPensionInsuranceEmployee,
      totalChildContribution,
      totalEmployer,
      totalEmployee
    };
  }

  get companySummaryTable() {
    // 画面に表示されている従業員のデータのみを使用
    const displayedRows = this.dataSource.filter(row => row.employeeId && row.hasInsuranceDetail);

    // 健康保険＋介護保険（従業員負担）
    const totalHealthNursingEmployee = displayedRows.reduce((sum, row) => {
      const healthEmployee = row.healthInsuranceEmployee || 0;
      const nursingEmployee = row.nursingInsuranceEmployee || 0;
      // 個人ごとに端数処理してから合計
      return sum + this.roundAmount(healthEmployee + nursingEmployee);
    }, 0);



    // 健康保険＋介護保険（会社負担）
    const totalHealthNursingEmployer = displayedRows.reduce((sum, row) => {
      const healthEmployer = row.healthInsuranceEmployer || 0;
      const nursingEmployer = row.nursingInsuranceEmployer || 0;
      return sum + healthEmployer + nursingEmployer;
    }, 0);


    // 健康保険＋介護保険（納入告知額）
    const totalHealthNursingNotice = Math.floor(totalHealthNursingEmployer * 2);


    // 厚生年金保険（従業員負担）
    const totalPensionEmployee = displayedRows.reduce((sum, row) =>
      sum + this.roundAmount(row.pensionInsuranceEmployee || 0), 0);



    // 厚生年金保険（会社負担）
    const totalPensionEmployer = displayedRows.reduce((sum, row) => 
      sum + (row.pensionInsuranceEmployer || 0), 0);

    // 厚生年金保険（納入告知額）
    const totalPensionNotice = Math.floor(totalPensionEmployer * 2);


    // 合計納入告知額
    const totalNotice = totalHealthNursingNotice + totalPensionNotice;
    const totalEmployee = totalHealthNursingEmployee + totalPensionEmployee;
    const totalEmployer = totalNotice - totalEmployee;


    return {
      rows: [
        {
          label: '健康保険＋介護保険',
          notice: totalHealthNursingNotice,
          employee: totalHealthNursingEmployee,
          employer: totalHealthNursingNotice - totalHealthNursingEmployee
        },
        {
          label: '厚生年金保険',
          notice: totalPensionNotice,
          employee: totalPensionEmployee,
          employer: totalPensionNotice - totalPensionEmployee
        },
        {
          label: '合計',
          notice: totalNotice,
          employee: totalEmployee,
          employer: totalEmployer
        }
      ]
    };
  }

  private async loadCompanyPrefecture() {
    try {
      const settingsDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
      if (settingsDoc.exists()) {
        this.companyPrefecture = settingsDoc.data()['prefecture'];
        console.log('会社の所在地を取得:', this.companyPrefecture);
      } else {
        console.error('会社設定が見つかりません');
        this.error = '会社設定が見つかりません。会社設定画面で確認してください。';
      }
    } catch (error) {
      console.error('会社設定の取得に失敗:', error);
      this.error = '会社設定の取得に失敗しました。';
    }
  }

  private async loadCompanyName() {
    try {
      const settingsDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
      if (settingsDoc.exists()) {
        this.companyName = settingsDoc.data()['name'] || settingsDoc.data()['officeName'] || '';
      }
    } catch (e) {
      this.companyName = '';
    }
  }

  async loadInsuranceData(): Promise<void> {
    this.isLoading = true;
    try {
      const employees = await this.employeeService.getAllEmployees();
      this.insuranceData = [];

      for (const employee of employees) {
        // 在籍判定
        const startDate = employee.employmentInfo?.startDate ? new Date(employee.employmentInfo.startDate) : null;
        const endDate = employee.employmentInfo?.endDate ? new Date(employee.employmentInfo.endDate) : null;
        const targetDate = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        // 入社日が未設定の場合は除外
        if (!startDate) continue;
        // 在籍判定: 入社日 <= 対象月末 && (退職日が未設定 or 退職日 >= 対象月初)
        const targetMonthStart = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        const targetMonthEnd = new Date(this.selectedYear, this.selectedMonth, 0, 23, 59, 59, 999);
        // 入社日が選択された月より後の場合は除外
        if (startDate > targetMonthEnd) continue;
        // 退職日が選択された月より前の場合は除外
        if (endDate && endDate < targetMonthStart) continue;

        // 保険加入判定（選択された年月で判定）
        const officeEmployeeCount = await this.getOfficeEmployeeCount();
        const eligibility = await this.insuranceEligibilityService.getInsuranceEligibility(
          employee,
          this.selectedYear,
          this.selectedMonth,
          officeEmployeeCount
        ).toPromise();

        if (!eligibility || (!eligibility.healthInsurance && !eligibility.pensionInsurance)) {
          continue; // 加入していない場合や判定失敗時はスキップ
        }

        // 保険ステータスを取得
        const insuranceStatus = await this.employeeService.getInsuranceStatus(employee.id);
        const period = { year: this.selectedYear, month: this.selectedMonth };
        const birthDate = employee.employeeBasicInfo.birthDate;
        const age = birthDate ? this.calculateAge(birthDate) : 0;

        // FirestoreからinsuranceDetailを取得
        const insuranceDetail = await this.employeeService.getInsuranceDetail(employee.id, period);


        // データがなければ未確定・未設定で埋める
        if (!insuranceDetail) {
          // insuranceStatusのgradeを厳密に判定
          const gradeForCalc = Number(insuranceStatus?.grade) || 0;
          const gradeForDisplay = insuranceStatus?.grade || '未設定';
          const newGradeForCalc = Number(insuranceStatus?.newGrade) || 0;
          const newGradeForDisplay = insuranceStatus?.newGrade || '未設定';

          // 等級が無効な場合はスキップ
          if (!gradeForCalc || gradeForCalc <= 0) {
            console.warn(`従業員 ${employee.employeeBasicInfo.employeeId} の等級が無効です:`, gradeForCalc);
            continue;
          }

          this.insuranceData.push({
            id: employee.id,
            employeeId: employee.employeeBasicInfo.employeeId,
            fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
            department: employee.employmentInfo?.department || '未設定',
            grade: gradeForDisplay,
            newGrade: newGradeForDisplay,
            baseSalary: employee.employmentInfo?.baseSalary ?? null,
            standardMonthlyRemuneration: null,
            healthInsuranceEmployee: eligibility.healthInsurance ? null : 0,
            healthInsuranceEmployer: eligibility.healthInsurance ? null : 0,
            nursingInsuranceEmployee: eligibility.nursingInsurance ? null : 0,
            nursingInsuranceEmployer: eligibility.nursingInsurance ? null : 0,
            pensionInsuranceEmployee: eligibility.pensionInsurance ? null : 0,
            pensionInsuranceEmployer: eligibility.pensionInsurance ? null : 0,
            childContribution: null,
            employeeTotalDeduction: null,
            period,
            age,
            isNursingInsuranceEligible: eligibility.nursingInsurance,
            standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
            bonusAmount: null,
            standardBonusAmount: null,
            bonusHealthInsuranceEmployee: null,
            bonusHealthInsuranceEmployer: null,
            bonusNursingInsuranceEmployee: null,
            bonusNursingInsuranceEmployer: null,
            bonusPensionInsuranceEmployee: null,
            bonusPensionInsuranceEmployer: null,
            bonusChildContribution: null,
            notes: eligibility.reason || '',
            variableWage: null,
            insuranceEligibility: eligibility,
            hasInsuranceDetail: false
          });
          continue;
        }

        // データがある場合はinsuranceDetailのgradeを優先
        const gradeForCalc = Number(insuranceDetail.grade) || 0;
        const gradeForDisplay = (Number.isFinite(gradeForCalc) && gradeForCalc > 0) ? gradeForCalc : '未設定';
        const newGradeForCalc = Number(insuranceDetail.newGrade) || 0;
        const newGradeForDisplay = (Number.isFinite(newGradeForCalc) && newGradeForCalc > 0) ? newGradeForCalc : '未設定';

        // 育休・産休中判定
        const leaveType = employee.specialAttributes?.leaveType;
        const leaveStart = employee.specialAttributes?.leaveStartDate;
        const leaveEnd = employee.specialAttributes?.leaveEndDate;
        let isOnLeave = false;
        if (leaveType && (leaveType === '育児休業' || leaveType === '産前産後休業') && leaveStart) {
          const today = new Date();
          const start = new Date(leaveStart);
          const end = leaveEnd ? new Date(leaveEnd) : null;
          isOnLeave = today >= start && (!end || today <= end);
        }

        // 免除フラグ（insuranceDetailにexemptionがtrueなら免除）
        const isExempted = insuranceDetail?.exemption === true;

        let standardMonthlyRemuneration: number | null = null;
        let baseSalary: number | null = null;

        // データがある場合は従来通り
        standardMonthlyRemuneration = insuranceDetail.standardMonthlyRemuneration ?? null;
        baseSalary = employee.employmentInfo?.baseSalary ?? null;
        const bonusAmount = insuranceDetail?.bonusAmount ?? null;
        const standardBonusAmount = insuranceDetail?.standardBonusAmount ?? null;
        const variableWage = insuranceDetail?.variableWage ?? null;
        const notes = insuranceDetail?.notes ?? '';
        // 賞与保険料プロパティを取得
        const bonusHealthInsuranceEmployee = insuranceDetail?.bonusHealthInsuranceEmployee ?? 0;
        const bonusHealthInsuranceEmployer = insuranceDetail?.bonusHealthInsuranceEmployer ?? 0;
        const bonusNursingInsuranceEmployee = insuranceDetail?.bonusNursingInsuranceEmployee ?? 0;
        const bonusNursingInsuranceEmployer = insuranceDetail?.bonusNursingInsuranceEmployer ?? 0;
        const bonusPensionInsuranceEmployee = insuranceDetail?.bonusPensionInsuranceEmployee ?? 0;
        const bonusPensionInsuranceEmployer = insuranceDetail?.bonusPensionInsuranceEmployer ?? 0;
        const bonusChildContribution = insuranceDetail?.bonusChildContribution ?? 0;

        // 免除ありの場合は0円でpush（すでに対応済み）
        if (isOnLeave && isExempted) {
          this.insuranceData.push({
            id: employee.id,
            employeeId: employee.employeeBasicInfo.employeeId,
            fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
            department: employee.employmentInfo?.department || '未設定',
            grade: gradeForDisplay,
            newGrade: newGradeForDisplay,
            baseSalary: baseSalary,
            standardMonthlyRemuneration: standardMonthlyRemuneration,
            healthInsuranceEmployee: 0,
            healthInsuranceEmployer: 0,
            nursingInsuranceEmployee: 0,
            nursingInsuranceEmployer: 0,
            pensionInsuranceEmployee: 0,
            pensionInsuranceEmployer: 0,
            childContribution: 0,
            employeeTotalDeduction: 0,
            period,
            age,
            isNursingInsuranceEligible: age >= 40 && age < 65,
            standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
            bonusAmount,
            standardBonusAmount,
            variableWage,
            bonusHealthInsuranceEmployee,
            bonusHealthInsuranceEmployer,
            bonusNursingInsuranceEmployee,
            bonusNursingInsuranceEmployer,
            bonusPensionInsuranceEmployee,
            bonusPensionInsuranceEmployer,
            bonusChildContribution,
            notes: '育児休暇中（免除）',
            insuranceEligibility: eligibility,
            hasInsuranceDetail: true
          });
          continue;
        }

        // Firestoreの値を必ず使う（免除なし・免除あり両方）
        this.insuranceData.push({
          id: employee.id,
          employeeId: employee.employeeBasicInfo.employeeId,
          fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
          department: employee.employmentInfo?.department || '未設定',
          grade: gradeForDisplay,
          newGrade: newGradeForDisplay,
          baseSalary: baseSalary,
          standardMonthlyRemuneration: standardMonthlyRemuneration,
          healthInsuranceEmployee: insuranceDetail.healthInsuranceEmployee ?? 0,
          healthInsuranceEmployer: insuranceDetail.healthInsuranceEmployer ?? 0,
          nursingInsuranceEmployee: insuranceDetail.nursingInsuranceEmployee ?? 0,
          nursingInsuranceEmployer: insuranceDetail.nursingInsuranceEmployer ?? 0,
          pensionInsuranceEmployee: insuranceDetail.pensionInsuranceEmployee ?? 0,
          pensionInsuranceEmployer: insuranceDetail.pensionInsuranceEmployer ?? 0,
          childContribution: insuranceDetail.childContribution ?? 0,
          employeeTotalDeduction: insuranceDetail.employeeTotalDeduction ?? 0,
          period,
          age,
          isNursingInsuranceEligible: age >= 40 && age < 65,
          standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
          bonusAmount,
          standardBonusAmount,
          variableWage,
          bonusHealthInsuranceEmployee,
          bonusHealthInsuranceEmployer,
          bonusNursingInsuranceEmployee,
          bonusNursingInsuranceEmployer,
          bonusPensionInsuranceEmployee,
          bonusPensionInsuranceEmployer,
          bonusChildContribution,
          notes,
          insuranceEligibility: eligibility,
          hasInsuranceDetail: true
        });
      }

      // FirestoreにinsuranceDetailがあるかチェック
      const period = { year: this.selectedYear, month: this.selectedMonth };
      await Promise.all(this.insuranceData.map(async (row) => {
        const insuranceDetail = await this.employeeService.getInsuranceDetail(row.id, period);
        row.hasInsuranceDetail = !!insuranceDetail;
      }));
    } catch (error) {
      console.error('保険料データの読み込みに失敗しました:', error);
    } finally {
      // 社員番号（employeeId）で昇順ソート
      this.insuranceData.sort((a, b) => a.employeeId - b.employeeId);
      this.isLoading = false;
    }
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  }

  onYearMonthChange(): void {
    this.loadInsuranceData();
  }

  openEditDialog(employeeId: string): void {
    const dialogRef = this.dialog.open(InsuranceEditComponent, {
      width: '600px',
      data: {
        employeeId,
        period: {
          year: this.selectedYear,
          month: this.selectedMonth
        }
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadInsuranceData();
      }
    });
  }

  async downloadPdf() {
    const { jsPDF } = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default;
    // @ts-ignore
    const ipaexg = await import('../../../assets/fonts/ipaexg-normal.js');
    if (!this.pdfContent) {
      alert('PDF出力用の内容が見つかりません');
      return;
    }
    try {
      const element = this.pdfContent.nativeElement;
      const originalDisplay = element.style.display;
      element.style.display = 'block';

      // フォントの読み込みを待機
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      element.style.display = originalDisplay;

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // フォントの設定
      (pdf as any).addFileToVFS('ipaexg.ttf', ipaexg);
      (pdf as any).addFont('ipaexg.ttf', 'ipaexg', 'normal');
      pdf.setFont('ipaexg');

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      // 画像の品質を向上
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

      const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
      const fileName = `社会保険料明細書_${yearMonth}_${this.companyName}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDFの出力中にエラーが発生しました。もう一度お試しください。');
    }
  }

  async downloadCsv() {
    // CSV出力時にも最新内容を保存
    await this.saveCompanySummaryToFirestore();
    const yearMonth = `${this.selectedYear}_${('0' + this.selectedMonth).slice(-2)}`;
    const companyDocRef = doc(this.firestore, 'insuranceDetails', yearMonth, 'company', 'summary');
    // 保存したデータを取得
    const snap = await getDoc(companyDocRef);
    let csvRows: any[] = [];
    if (snap.exists()) {
      const data = snap.data();
      // main表
      csvRows.push(['保険種別','納入告知額（合計納付額）','従業員負担額合計','事業主負担額合計']);
      for (const row of data['main']) {
        csvRows.push([row.label, `${row.notice}円`, `${row.employee}円`, `${row.employer}円`]);
      }
      csvRows.push([]);
      // bonus表
      if (data['bonus'] && data['bonus'].length > 0) {
        csvRows.push(['賞与分']);
        csvRows.push(['保険種別','納入告知額（合計納付額）','従業員負担額合計','事業主負担額合計']);
        for (const row of data['bonus']) {
          csvRows.push([row.label, `${row.notice}円`, `${row.employee}円`, `${row.employer}円`]);
        }
      }
    }
    // CSV生成
    const csvContent = csvRows.map(row => row.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `会社全体保険料明細_${yearMonth}.csv`;
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 端数処理の関数（従業員負担分のみに使用）
  roundAmount(amount: number): number {
    const decimal = amount - Math.floor(amount);
    if (decimal <= 0.5) {
      return Math.floor(amount);
    } else {
      return Math.ceil(amount);
    }
  }

  // 従業員負担分の合計を計算する関数
  calculateEmployeeTotalInsurance(employee: number, nursing: number, pension: number): number {
    const total = employee + nursing + pension;
    return this.roundAmount(total);
  }

  // 会社負担分の合計を計算する関数（個人分の端数処理に応じて端数処理）
  calculateEmployerTotalInsurance(employee: number, nursing: number, pension: number): number {
    const total = employee + nursing + pension;
    
    // 個人分の合計を計算
    const employeeTotal = employee + nursing + pension;
    const employeeTotalDecimal = employeeTotal - Math.floor(employeeTotal);
    
    // 個人分の端数処理を確認（50銭以下は切り捨て、50銭超は切り上げ）
    const wasEmployeeRoundedUp = employeeTotalDecimal > 0.5;
    
    // 個人分が切り上げられた場合は切り捨て、切り捨てられた場合は切り上げ
    if (wasEmployeeRoundedUp) {
      return Math.floor(total);
    } else {
      return Math.ceil(total);
    }
  }

  async downloadIndividualPdf(element: InsuranceData) {
    const { jsPDF } = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default;
    // @ts-ignore
    const ipaexg = await import('../../../assets/fonts/ipaexg-normal.js');
    try {
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';
      const standardMonthlyWage = insuranceStatus?.standardMonthlyWage ?? '未設定';
      const pensionGrade = insuranceStatus?.newGrade ?? '未設定';
      const pensionStandardMonthlyWage = insuranceStatus?.newStandardMonthlyWage ?? '未設定';
      const bonusCount = (element as any).bonusCount ?? 0;
      const showBonusRow = bonusCount === 0 || bonusCount >= 4;
      const showBonusAmount = !(element.standardBonusAmount && element.standardBonusAmount > 0);
      // Firestoreから最新のinsuranceDetailを取得
      const period = { year: this.selectedYear, month: this.selectedMonth };
      const insuranceDetail = await this.employeeService.getInsuranceDetail(element.id, period);
      // insuranceDetailがあればそちらを優先
      const baseSalary = insuranceDetail?.baseSalary ?? element.baseSalary ?? 0;
      const standardMonthlyRemuneration = insuranceDetail?.standardMonthlyRemuneration ?? element.standardMonthlyRemuneration ?? 0;
      const bonusAmount = insuranceDetail?.bonusAmount ?? element.bonusAmount ?? 0;
      const standardBonusAmount = insuranceDetail?.standardBonusAmount ?? element.standardBonusAmount ?? 0;
      const healthEmployee = (insuranceDetail?.healthInsuranceEmployee ?? element.healthInsuranceEmployee) || 0;
      const nursingEmployee = (insuranceDetail?.nursingInsuranceEmployee ?? element.nursingInsuranceEmployee) || 0;
      const pensionEmployee = (insuranceDetail?.pensionInsuranceEmployee ?? element.pensionInsuranceEmployee) || 0;
      const notes = insuranceDetail?.notes ?? element.notes ?? '';
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.innerHTML = `
        <div style="font-family: 'Noto Sans JP', sans-serif; padding: 20px;">
          <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            社会保険料明細書
          </h1>
          <div style="margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 14px;">
            <div>
              <strong>対象期間：</strong>${element.period.year}年${element.period.month}月
            </div>
            <div>
              <strong>氏名：</strong>${element.fullName}
            </div>
            <div>
              <strong>社員番号：</strong>${element.employeeId}
            </div>
          </div>
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>健康保険等級：</strong>${grade}　<strong>標準報酬月額：</strong>${standardMonthlyWage}円<br>
            <strong>厚生年金等級：</strong>${pensionGrade}　<strong>標準報酬月額：</strong>${pensionStandardMonthlyWage}円
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <td style="border: 1px solid #888; padding: 8px; width: 40%; background: #f5f5f5;">基本給</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(baseSalary).toLocaleString()}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5;">報酬月額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(standardMonthlyRemuneration).toLocaleString()}円</td>
            </tr>
            ${showBonusRow && showBonusAmount ? `
            <tr>
              <td style='border: 1px solid #888; padding: 8px; background: #f5f5f5;'>賞与支給額</td>
              <td style='border: 1px solid #888; padding: 8px; text-align: right;'>${this.roundAmount(bonusAmount).toLocaleString()}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5;">報酬月額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(bonusCount >= 4 ? (standardMonthlyRemuneration + bonusAmount) : standardMonthlyRemuneration).toLocaleString()}円</td>
            </tr>
            ` : ''}
          </table>
          <!-- 保険料合計テーブル -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">項目</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">従業員負担分</th>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">健康保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${healthEmployee}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">介護保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(nursingEmployee).toLocaleString()}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">厚生年金保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(pensionEmployee).toLocaleString()}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5;">合計</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${this.calculateEmployeeTotalInsurance(
                healthEmployee,
                nursingEmployee,
                pensionEmployee
              ).toLocaleString()}円</td>
            </tr>
          </table>
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>備考：</strong>${notes}
          </div>
          <div style="margin-top: 30px; font-size: 12px; text-align: right;">
            <p>出力日時: ${new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      `;
      document.body.appendChild(tempDiv);
      const canvas = await html2canvas(tempDiv, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = 210;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
      const fileName = `社会保険料明細書_${yearMonth}_${element.fullName || ''}_${element.employeeId || ''}.pdf`;
      pdf.save(fileName);
      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDFの出力中にエラーが発生しました。もう一度お試しください。');
    }
  }

  async downloadIndividualCsv(element: InsuranceData) {
    try {
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';
      const standardMonthlyWage = insuranceStatus?.standardMonthlyWage ?? '未設定';
      const pensionGrade = insuranceStatus?.newGrade ?? '未設定';
      const pensionStandardMonthlyWage = insuranceStatus?.newStandardMonthlyWage ?? '未設定';
      const bonusCount = (element as any).bonusCount ?? 0;
      const showBonusRow = bonusCount === 0 || bonusCount >= 4;
      const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
      // Firestoreから最新のinsuranceDetailを取得
      const period = { year: this.selectedYear, month: this.selectedMonth };
      const insuranceDetail = await this.employeeService.getInsuranceDetail(element.id, period);
      const baseSalary = insuranceDetail?.baseSalary ?? '';
      const allowances = insuranceDetail?.allowances ?? '';
      const commutingAllowance = insuranceDetail?.commutingAllowance ?? '';
      const variableWage = insuranceDetail?.variableWage ?? '';
      const standardMonthlyRemuneration = insuranceDetail?.standardMonthlyRemuneration ?? '';
      // 保険料本体もFirestore優先で取得
      const healthEmployee = (insuranceDetail?.healthInsuranceEmployee ?? element.healthInsuranceEmployee) || 0;
      const nursingEmployee = (insuranceDetail?.nursingInsuranceEmployee ?? element.nursingInsuranceEmployee) || 0;
      const pensionEmployee = (insuranceDetail?.pensionInsuranceEmployee ?? element.pensionInsuranceEmployee) || 0;
      const employeeTotal = healthEmployee + nursingEmployee + pensionEmployee;
      // 賞与分もFirestore優先で取得
      const bonusHealthEmployee = (insuranceDetail?.bonusHealthInsuranceEmployee ?? element.bonusHealthInsuranceEmployee) || 0;
      const bonusNursingEmployee = (insuranceDetail?.bonusNursingInsuranceEmployee ?? element.bonusNursingInsuranceEmployee) || 0;
      const bonusPensionEmployee = (insuranceDetail?.bonusPensionInsuranceEmployee ?? element.bonusPensionInsuranceEmployee) || 0;
      const bonusEmployeeTotal = bonusHealthEmployee + bonusNursingEmployee + bonusPensionEmployee;

      // ヘッダー（タブ区切り、指定順）
      const headers = [
        '年月', '氏名', '社員番号', '所属',
        '健康保険等級', '健康保険標準報酬月額', '厚生年金等級', '厚生年金標準報酬月額',
        '基本給', '手当', '通勤手当', '報酬月額', '非固定的賃金',
        '賞与支給額', '標準賞与額',
        '健康保険料（従業員負担分）', '介護保険料（従業員負担分）', '厚生年金保険料（従業員負担分）', '従業員負担保険料合計',
        '賞与健康保険料（従業員負担分）', '賞与介護保険料（従業員負担分）', '賞与厚生年金保険料（従業員負担分）', '賞与従業員負担保険料合計',
        '備考'
      ];
      // データ（タブ区切り、指定順、すべて文字列化）
      const row = [
        yearMonth,
        element.fullName || '',
        element.employeeId || '',
        element.department || '',
        grade,
        standardMonthlyWage,
        pensionGrade,
        pensionStandardMonthlyWage,
        baseSalary,
        allowances,
        commutingAllowance,
        standardMonthlyRemuneration,
        variableWage,
        showBonusRow ? (element.bonusAmount || 0) : '',
        showBonusRow ? (element.standardBonusAmount || 0) : '',
        healthEmployee,
        nursingEmployee,
        pensionEmployee,
        employeeTotal,
        bonusHealthEmployee,
        bonusNursingEmployee,
        bonusPensionEmployee,
        bonusEmployeeTotal,
        element.notes || ''
      ].map(v => String(v));


      const csvContent = [headers.join('\t'), row.join('\t')].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const fileName = `社会保険料明細書_${yearMonth}_${element.fullName || ''}_${element.employeeId || ''}.csv`;
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSVの出力中にエラーが発生しました。もう一度お試しください。');
    }
  }

  // 保険料合計を計算する関数を追加
  calculateTotalInsurance(employee: number, nursing: number, pension: number): number {
    const total = employee + nursing + pension;
    return this.roundAmount(total);
  }

  async downloadIndividualBonusPdf(element: InsuranceData) {
    const { jsPDF } = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default;
    // @ts-ignore
    const ipaexg = await import('../../../assets/fonts/ipaexg-normal.js');
    try {
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';
      if (!element.bonusAmount || element.bonusAmount === 0) {
        alert('この月は賞与がありません');
        return;
      }
      const bonusHealthEmployee = this.roundAmount(element.bonusHealthInsuranceEmployee || 0);
      const bonusNursingEmployee = this.roundAmount(element.bonusNursingInsuranceEmployee || 0);
      const bonusPensionEmployee = this.roundAmount(element.bonusPensionInsuranceEmployee || 0);
      const totalEmployee = bonusHealthEmployee + bonusNursingEmployee + bonusPensionEmployee;
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'fixed';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '800px';
      tempDiv.innerHTML = `
        <div style="font-family: 'Noto Sans JP', sans-serif; padding: 20px;">
          <h1 style="text-align: center; font-size: 20px; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px;">
            賞与分 社会保険料明細書
          </h1>
          <div style="margin-bottom: 20px; display: flex; justify-content: space-between; font-size: 14px;">
            <div>
              <strong>対象期間：</strong>${element.period.year}年${element.period.month}月
            </div>
            <div>
              <strong>氏名：</strong>${element.fullName}
            </div>
            <div>
              <strong>社員番号：</strong>${element.employeeId}
            </div>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 50%;">賞与支給額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(element.bonusAmount || 0).toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5;">標準賞与額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${this.roundAmount(element.standardBonusAmount || 0).toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
          </table>
          <!-- 下段：保険料明細テーブル -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">項目</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">従業員負担分</th>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">健康保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${bonusHealthEmployee.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">介護保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${bonusNursingEmployee.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">厚生年金保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${bonusPensionEmployee.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5;">合計</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${totalEmployee.toLocaleString('ja-JP', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}円</td>
            </tr>
          </table>
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>備考：</strong>${element.notes || ''}
          </div>
          <div style="margin-top: 30px; font-size: 12px; text-align: right;">
            <p>出力日時: ${new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      `;
      document.body.appendChild(tempDiv);
      const canvas = await html2canvas(tempDiv, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = 210;
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
      const fileName = `賞与分社会保険料明細書_${yearMonth}_${element.fullName || ''}_${element.employeeId || ''}.pdf`;
      pdf.save(fileName);
      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('賞与PDF出力エラー:', error);
      alert('賞与PDFの出力中にエラーが発生しました。もう一度お試しください。');
    }
  }

  get hasBonus() {
    return this.dataSource.some(row => (row.bonusAmount || 0) > 0);
  }

  get companyBonusSummaryTable() {
    // 画面に表示されている従業員のデータのみを使用
    const displayedRows = this.dataSource.filter(row => row.employeeId && row.hasInsuranceDetail);
    const bonusRows = displayedRows.filter(row => (row.bonusAmount || 0) > 0);


    // 健康保険＋介護保険（従業員負担）
    const totalHealthNursingEmployee = bonusRows.reduce((sum, row) => {
      return sum + this.roundAmount((row.bonusHealthInsuranceEmployee || 0) + (row.bonusNursingInsuranceEmployee || 0));
    }, 0);

    

    // 健康保険＋介護保険（会社負担）
    const totalHealthNursingEmployer = bonusRows.reduce((sum, row) => {
      return sum + (row.bonusHealthInsuranceEmployer || 0) + (row.bonusNursingInsuranceEmployer || 0);
    }, 0);

    // 健康保険＋介護保険（納入告知額）
    const totalHealthNursingNotice = Math.floor(totalHealthNursingEmployer * 2);

    // 厚生年金保険（従業員負担）
    const totalPensionEmployee = bonusRows.reduce((sum, row) =>
      sum + this.roundAmount(row.bonusPensionInsuranceEmployee || 0), 0);


    // 厚生年金保険（会社負担）
    const totalPensionEmployer = bonusRows.reduce((sum, row) => 
      sum + (row.bonusPensionInsuranceEmployer || 0), 0);

    // 厚生年金保険（納入告知額）
    const totalPensionNotice = Math.floor(totalPensionEmployer * 2);

    // 合計
    const totalNotice = totalHealthNursingNotice + totalPensionNotice;
    const totalEmployee = totalHealthNursingEmployee + totalPensionEmployee;
    const totalEmployer = totalNotice - totalEmployee;

    return {
      rows: [
        {
          label: '健康保険＋介護保険（賞与）',
          notice: totalHealthNursingNotice,
          employee: totalHealthNursingEmployee,
          employer: totalHealthNursingNotice - totalHealthNursingEmployee
        },
        {
          label: '厚生年金保険（賞与）',
          notice: totalPensionNotice,
          employee: totalPensionEmployee,
          employer: totalPensionNotice - totalPensionEmployee
        },
        {
          label: '合計',
          notice: totalNotice,
          employee: totalEmployee,
          employer: totalEmployer
        }
      ]
    };
  }

  // 小数点第3位以下切り捨てで2位まで表示する関数
  toFixedFloor(value: number): string {
    return (Math.floor(value * 100) / 100).toFixed(2);
  }

  get hasUnconfirmedRemuneration(): boolean {
    return this.dataSource.some(row => row.standardMonthlyRemuneration === null || row.standardMonthlyRemuneration === undefined);
  }

  // 介護保険の共通判定メソッドを画面用にラップ
  isActuallyNursingInsuranceEligible(eligibility: any): boolean {
    return this.insuranceEligibilityService.isActuallyNursingInsuranceEligible(eligibility);
  }

  async getOfficeEmployeeCount(): Promise<number> {
    const officeDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
    if (officeDoc.exists()) {
      return officeDoc.data()['actualEmployeeCount'] || 0;
    }
    return 0;
  }

  // 画面の表示制御用プロパティを追加
  get isCompanySettingAvailable(): boolean {
    // 会社名や所在地など、最低限必要な設定が未登録ならfalseを返す
    return !!this.companyName && !!this.companyPrefecture;
  }
}