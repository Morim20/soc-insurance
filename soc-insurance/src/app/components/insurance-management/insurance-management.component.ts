import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
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
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { InsuranceEligibilityService } from '../../services/insurance-eligibility.service';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
// @ts-ignore
import * as ipaexg from '../../../assets/fonts/ipaexg-normal.js';

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
export class InsuranceManagementComponent implements OnInit {
  @ViewChild('pdfContent', { static: false }) pdfContent?: ElementRef;
  displayedColumns: string[] = [
    'fullName',
    'employeeId',
    'department',
    'grade',
    'baseSalary',
    'standardMonthlyWage',
    'standardMonthlyRemuneration',
    'actions',
    'export'
  ];

  filterForm: FormGroup;
  showEmployeeId = true;
  dataSource: InsuranceData[] = [];
  isLoading = false;
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

  private updateDisplayedColumns(): void {
    const baseColumns = [
      'fullName',
      'department',
      'grade',
      'baseSalary',
      'standardMonthlyWage',
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

  private async loadData(): Promise<void> {
    try {
      this.isLoading = true;
      this.error = null;
      await this.loadInsuranceData();
      this.dataSource = this.insuranceData;
    } catch (error) {
      console.error('Error loading insurance data:', error);
      this.error = 'データの読み込み中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  onEdit(insuranceData: InsuranceData): void {
    this.router.navigate(['/admin/insurance', insuranceData.id, 'edit'], { state: { data: insuranceData } });
  }

  get totalStandardMonthlyRemuneration(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.standardMonthlyRemuneration || 0), 0);
  }
  get totalHealthInsuranceEmployee(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.healthInsuranceEmployee || 0), 0);
  }
  get totalHealthInsuranceEmployer(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.healthInsuranceEmployer || 0), 0);
  }
  get totalNursingInsuranceEmployee(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.nursingInsuranceEmployee || 0), 0);
  }
  get totalPensionInsuranceEmployee(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.pensionInsuranceEmployee || 0), 0);
  }
  get totalEmployeeTotalDeduction(): number {
    return this.dataSource.reduce((sum, row) => sum + (row.employeeTotalDeduction || 0), 0);
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
    const totalEmployer = totalHealthInsuranceEmployer + totalNursingInsuranceEmployer + totalPensionInsuranceEmployer ;
    const totalEmployee = totalHealthInsuranceEmployee + totalNursingInsuranceEmployee + totalPensionInsuranceEmployee;
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

  private async loadCompanyPrefecture() {
    try {
      const settingsDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
      if (settingsDoc.exists()) {
        this.companyPrefecture = settingsDoc.data()['prefecture'];
        console.log('会社の所在地を取得:', this.companyPrefecture);
      } else {
        console.error('会社設定が見つかりません');
        this.error = '会社設定が見つかりません。会社設定画面で確認してください。';
        this.router.navigate(['/admin/settings']);
      }
    } catch (error) {
      console.error('会社設定の取得に失敗:', error);
      this.error = '会社設定の取得に失敗しました。';
      this.router.navigate(['/admin/settings']);
    }
  }

  private async loadCompanyName() {
    try {
      const settingsDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
      if (settingsDoc.exists()) {
        this.companyName = settingsDoc.data()['name'] || '';
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
        if (startDate > targetMonthEnd) continue;
        if (endDate && endDate < targetMonthStart) continue;

        // 保険加入判定
        const eligibility = await this.insuranceEligibilityService.getInsuranceEligibility(employee).toPromise();
        if (!eligibility.healthInsurance && !eligibility.pensionInsurance) {
          continue; // 加入していない場合はスキップ
        }

        // 保険ステータスを取得
        const insuranceStatus = await this.employeeService.getInsuranceStatus(employee.id);
        const gradeForDisplay = insuranceStatus?.grade ?? '未設定';
        const gradeForCalc = typeof insuranceStatus?.grade === 'number' ? insuranceStatus.grade : 0;

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

        const birthDate = employee.employeeBasicInfo.birthDate;
        const age = birthDate ? this.calculateAge(birthDate) : 0;
        const period = { year: this.selectedYear, month: this.selectedMonth };
        let standardMonthlyRemuneration: number | null = null;
        let baseSalary: number | null = null;

        // FirestoreからinsuranceDetailsを取得
        const insuranceDetail = await this.employeeService.getInsuranceDetail(employee.id, period);
        // データがなければ未確定・未設定で埋める
        if (!insuranceDetail) {
          this.insuranceData.push({
            id: employee.id,
            employeeId: employee.employeeBasicInfo.employeeId,
            fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
            department: employee.employmentInfo?.department || '未設定',
            grade: gradeForDisplay,
            baseSalary: employee.employmentInfo?.baseSalary ?? null,
            standardMonthlyRemuneration: null,
            healthInsuranceEmployee: null,
            healthInsuranceEmployer: null,
            nursingInsuranceEmployee: null,
            nursingInsuranceEmployer: null,
            pensionInsuranceEmployee: null,
            pensionInsuranceEmployer: null,
            childContribution: null,
            employeeTotalDeduction: null,
            period,
            age,
            isNursingInsuranceEligible: age >= 40 && age < 65,
            standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
            bonusAmount: null,
            standardBonusAmount: null,
            notes: ''
          });
          continue;
        }

        // データがある場合は従来通り
        standardMonthlyRemuneration = insuranceDetail.standardMonthlyRemuneration ?? null;
        baseSalary = employee.employmentInfo?.baseSalary ?? null;
        const bonusAmount = insuranceDetail?.bonusAmount ?? null;
        const standardBonusAmount = insuranceDetail?.standardBonusAmount ?? null;
        const notes = insuranceDetail?.notes ?? '';
        // 賞与保険料プロパティを取得
        const bonusHealthInsuranceEmployee = insuranceDetail?.bonusHealthInsuranceEmployee ?? 0;
        const bonusHealthInsuranceEmployer = insuranceDetail?.bonusHealthInsuranceEmployer ?? 0;
        const bonusNursingInsuranceEmployee = insuranceDetail?.bonusNursingInsuranceEmployee ?? 0;
        const bonusNursingInsuranceEmployer = insuranceDetail?.bonusNursingInsuranceEmployer ?? 0;
        const bonusPensionInsuranceEmployee = insuranceDetail?.bonusPensionInsuranceEmployee ?? 0;
        const bonusPensionInsuranceEmployer = insuranceDetail?.bonusPensionInsuranceEmployer ?? 0;
        const bonusChildContribution = insuranceDetail?.bonusChildContribution ?? 0;

        if (isOnLeave) {
          this.insuranceData.push({
            id: employee.id,
            employeeId: employee.employeeBasicInfo.employeeId,
            fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
            department: employee.employmentInfo?.department || '未設定',
            grade: gradeForDisplay,
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
            notes: '育児休暇中のため',
            standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
            bonusAmount,
            standardBonusAmount
          });
          continue;
        }

        const result = this.insuranceCalculationService.calculateInsurance({
          prefecture: this.companyPrefecture || '東京都',
          grade: gradeForCalc,
          age,
          hasChildren: false
        });

        this.insuranceData.push(result ? {
          id: employee.id,
          employeeId: employee.employeeBasicInfo.employeeId,
          fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
          department: employee.employmentInfo?.department || '未設定',
          grade: gradeForDisplay,
          baseSalary: baseSalary,
          standardMonthlyRemuneration: standardMonthlyRemuneration,
          healthInsuranceEmployee: result.healthInsurance.employee,
          healthInsuranceEmployer: result.healthInsurance.employer,
          nursingInsuranceEmployee: result.nursingInsurance.employee,
          nursingInsuranceEmployer: result.nursingInsurance.employer,
          pensionInsuranceEmployee: result.pensionInsurance.employee,
          pensionInsuranceEmployer: result.pensionInsurance.employer,
          childContribution: result.childContribution,
          employeeTotalDeduction: result.total.employee,
          period,
          age,
          isNursingInsuranceEligible: age >= 40 && age < 65,
          standardMonthlyWage: insuranceStatus?.standardMonthlyWage || null,
          bonusAmount,
          standardBonusAmount,
          // 賞与保険料もセット
          bonusHealthInsuranceEmployee,
          bonusHealthInsuranceEmployer,
          bonusNursingInsuranceEmployee,
          bonusNursingInsuranceEmployer,
          bonusPensionInsuranceEmployee,
          bonusPensionInsuranceEmployer,
          bonusChildContribution,
          notes
        } : {
          id: employee.id,
          employeeId: employee.employeeBasicInfo.employeeId,
          fullName: `${employee.employeeBasicInfo.lastNameKanji} ${employee.employeeBasicInfo.firstNameKanji}`,
          department: employee.employmentInfo?.department || '未設定',
          grade: gradeForDisplay,
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
          // 賞与保険料もセット（0で）
          bonusHealthInsuranceEmployee,
          bonusHealthInsuranceEmployer,
          bonusNursingInsuranceEmployee,
          bonusNursingInsuranceEmployer,
          bonusPensionInsuranceEmployee,
          bonusPensionInsuranceEmployer,
          bonusChildContribution,
          notes
        });
      }
    } catch (error) {
      console.error('保険料データの読み込みに失敗しました:', error);
    } finally {
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

  downloadCsv() {
    const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
    const headers = [
      '氏名', '社員番号', '所属', '等級', '基本給', '標準報酬月額',
      '健康保険料（個人分）', '健康保険料（会社分）',
      '介護保険料（個人分）', '介護保険料（会社分）',
      '厚生年金保険料（個人分）', '厚生年金保険料（会社分）',
      '子ども・子育て拠出金', '個人負担保険料合計', '会社負担保険料合計'
    ];

    const rows = this.dataSource.map(row => [
      `"${row.fullName || ''}"`,
      `"${row.employeeId || ''}"`,
      `"${row.department || ''}"`,
      `"${row.grade || ''}"`,
      `"${row.baseSalary || 0}"`,
      `"${row.standardMonthlyRemuneration || 0}"`,
      `"${row.healthInsuranceEmployee || 0}"`,
      `"${row.healthInsuranceEmployer || 0}"`,
      `"${row.nursingInsuranceEmployee || 0}"`,
      `"${row.nursingInsuranceEmployer || 0}"`,
      `"${row.pensionInsuranceEmployee || 0}"`,
      `"${row.pensionInsuranceEmployer || 0}"`,
      `"${row.childContribution || 0}"`,
      `"${row.employeeTotalDeduction || 0}"`,
      `"${(row.healthInsuranceEmployer || 0) + (row.nursingInsuranceEmployer || 0) + (row.pensionInsuranceEmployer || 0)}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `社会保険料明細書_${yearMonth}_${this.companyName}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async downloadIndividualPdf(element: InsuranceData) {
    try {
      // 社員の保険ステータスを取得
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';
      // 賞与回数（4回以上なら賞与枠を表示）
      const bonusCount = (element as any).bonusCount ?? 0;
      const showBonusRow = bonusCount > 3;
      // 保険料合計計算
      const healthTotal = (element.healthInsuranceEmployee || 0) + (element.healthInsuranceEmployer || 0);
      const nursingTotal = (element.nursingInsuranceEmployee || 0) + (element.nursingInsuranceEmployer || 0);
      const pensionTotal = (element.pensionInsuranceEmployee || 0) + (element.pensionInsuranceEmployer || 0);
      const childTotal = element.childContribution || 0;
      const total = healthTotal + nursingTotal + pensionTotal + childTotal;
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
            <strong>等級：</strong>${grade}
          </div>
          <!-- 給与情報テーブル -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <td style="border: 1px solid #888; padding: 8px; width: 40%; background: #f5f5f5;">基本給</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.baseSalary?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5;">報酬月額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.standardMonthlyRemuneration?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; background: #f5f5f5;">標準報酬月額</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.standardMonthlyWage?.toLocaleString() || '0'}円</td>
            </tr>
            ${showBonusRow ? `
            <tr>
              <td style='border: 1px solid #888; padding: 8px; background: #f5f5f5;'>賞与支給額</td>
              <td style='border: 1px solid #888; padding: 8px; text-align: right;'>${element.bonusAmount?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style='border: 1px solid #888; padding: 8px; background: #f5f5f5;'>標準賞与額</td>
              <td style='border: 1px solid #888; padding: 8px; text-align: right;'>${element.standardBonusAmount?.toLocaleString() || '0'}円</td>
            </tr>
            ` : ''}
          </table>
          <!-- 保険料合計テーブル -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">項目</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">個人分</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">会社分</th>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">健康保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.healthInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.healthInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">介護保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.nursingInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.nursingInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">厚生年金保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.pensionInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.pensionInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">子ども・子育て拠出金</td>
              <td colspan="2" style="border: 1px solid #888; padding: 8px; text-align: right;">${element.childContribution?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5;">合計</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${((element.healthInsuranceEmployee || 0) + (element.nursingInsuranceEmployee || 0) + (element.pensionInsuranceEmployee || 0)).toLocaleString()}円</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${((element.healthInsuranceEmployer || 0) + (element.nursingInsuranceEmployer || 0) + (element.pensionInsuranceEmployer || 0)).toLocaleString()}円</td>
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
      // 社員の保険ステータスを取得
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';

      const yearMonth = `${this.selectedYear}年${this.selectedMonth}月`;
      const headers = [
        '氏名', '社員番号', '所属', '等級', '基本給', '標準報酬月額',
        '健康保険料（個人分）', '健康保険料（会社分）',
        '介護保険料（個人分）', '介護保険料（会社分）',
        '厚生年金保険料（個人分）', '厚生年金保険料（会社分）',
        '子ども・子育て拠出金', '個人負担保険料合計'
      ];
      const row = [
        `"${element.fullName || ''}"`,
        `"${element.employeeId || ''}"`,
        `"${element.department || ''}"`,
        `"${grade}"`,
        `"${element.baseSalary || 0}"`,
        `"${element.standardMonthlyRemuneration || 0}"`,
        `"${element.healthInsuranceEmployee || 0}"`,
        `"${element.healthInsuranceEmployer || 0}"`,
        `"${element.nursingInsuranceEmployee || 0}"`,
        `"${element.nursingInsuranceEmployer || 0}"`,
        `"${element.pensionInsuranceEmployee || 0}"`,
        `"${element.pensionInsuranceEmployer || 0}"`,
        `"${element.childContribution || 0}"`,
        `"${element.employeeTotalDeduction || 0}"`
      ];
      const csvContent = [headers.join(','), row.join(',')].join('\r\n');
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

  // 端数
  roundAmount(amount: number): number {
    return Math.round(amount);
  }

  async downloadIndividualBonusPdf(element: InsuranceData) {
    try {
      const insuranceStatus = await this.employeeService.getInsuranceStatus(element.id);
      const grade = insuranceStatus?.grade ?? '未設定';
      if (!element.bonusAmount || element.bonusAmount === 0) {
        alert('この月は賞与がありません');
        return;
      }
      // 合計計算
      const totalEmployee =
        (element.bonusHealthInsuranceEmployee || 0) +
        (element.bonusNursingInsuranceEmployee || 0) +
        (element.bonusPensionInsuranceEmployee || 0);
      const totalEmployer =
        (element.bonusHealthInsuranceEmployer || 0) +
        (element.bonusNursingInsuranceEmployer || 0) +
        (element.bonusPensionInsuranceEmployer || 0);
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
          <div style="margin-bottom: 20px; font-size: 14px;">
            <strong>等級：</strong>${grade}
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
            <tr>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">項目</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">個人分</th>
              <th style="border: 1px solid #888; padding: 8px; background: #f5f5f5; width: 33%;">会社分</th>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">賞与支給額</td>
              <td colspan="2" style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusAmount?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">標準賞与額</td>
              <td colspan="2" style="border: 1px solid #888; padding: 8px; text-align: right;">${element.standardBonusAmount?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">健康保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusHealthInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusHealthInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">介護保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusNursingInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusNursingInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px;">厚生年金保険料</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusPensionInsuranceEmployee?.toLocaleString() || '0'}円</td>
              <td style="border: 1px solid #888; padding: 8px; text-align: right;">${element.bonusPensionInsuranceEmployer?.toLocaleString() || '0'}円</td>
            </tr>
            <tr>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5;">合計</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${totalEmployee.toLocaleString()}円</td>
              <td style="border: 1px solid #888; padding: 8px; font-weight: bold; background: #f5f5f5; text-align: right;">${totalEmployer.toLocaleString()}円</td>
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
} 