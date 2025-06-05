import { Component, Input, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { EmployeeService } from '../../services/employee.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { InsuranceCalculationService } from '../../services/insuranceCalculationService';
import { InsuranceData } from '../../models/insurance.model';
import aichiGradesData from '../../services/23aichi_insurance_grades.json';
import { SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-insurance-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './insurance-edit.component.html',
  styleUrls: ['./insurance-edit.component.scss']
})
export class InsuranceEditComponent implements OnInit {
  @Input() data: any;
  @ViewChild('pdfContent', { static: false }) pdfContent?: ElementRef;
  form: FormGroup;
  showDownloadButtons = false;
  savedInsuranceData: any = null;
  months = [
    { value: '2024-01', label: '2024年1月' },
    { value: '2024-02', label: '2024年2月' },
    { value: '2024-03', label: '2024年3月' },
    { value: '2024-04', label: '2024年4月' },
    { value: '2024-05', label: '2024年5月' },
    { value: '2024-06', label: '2024年6月' },
    // 必要に応じて追加
  ];
  insuranceData: InsuranceData | null = null;
  employeeId: string | null = null;
  basicInfo: any = null;
  employmentInfo: any = null;
  specialAttributes: any = null;
  today = new Date();
  private insuranceCalculationService = new InsuranceCalculationService();
  private companyPrefecture: string | null = null;
  public aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGradesData;
  public standardMonthlyWage: number | null = null;
  insuranceStatus: any = null;
  isBonusMonth = false;
  bonusInsuranceResult: any = null;
  bonusCount: number = 0;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private employeeService: EmployeeService,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    private settingsService: SettingsService
  ) {
    this.form = this.fb.group({
      month: [''],
      baseSalary: [0, Validators.required],
      allowances: [0, Validators.required],
      commutingAllowance: [0, Validators.required],
      bonusAmount: [0],
      standardBonusAmount: [0],
      notes: ['']
    });
    this.data = this.data || {}; // dataの初期化

    // 会社の所在地を取得
    this.loadCompanyPrefecture();

    // 標準報酬月額の自動計算
    this.form.valueChanges.subscribe(() => {
      this.calculateStandardMonthlyRemuneration();
    });
  }

  private async loadCompanyPrefecture() {
    try {
      const settingsDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
      if (settingsDoc.exists()) {
        this.companyPrefecture = settingsDoc.data()['prefecture'];
        console.log('会社の所在地を取得:', this.companyPrefecture);
      } else {
        console.error('会社設定が見つかりません');
        this.snackBar.open('会社設定が見つかりません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
        this.router.navigate(['/admin/settings']); // 設定画面に遷移
      }
    } catch (error) {
      console.error('会社設定の取得に失敗:', error);
      this.snackBar.open('会社設定の取得に失敗しました。', '閉じる', { duration: 5000 });
      this.router.navigate(['/admin/settings']); // 設定画面に遷移
    }
  }

  // 標準報酬月額を計算するメソッド
  private calculateStandardMonthlyRemuneration() {
    const baseSalary = this.form.get('baseSalary')?.value || 0;
    const allowances = this.form.get('allowances')?.value || 0;
    const commutingAllowance = this.form.get('commutingAllowance')?.value || 0;
    let total = baseSalary + allowances + commutingAllowance;

    // 賞与が年4回以上かつ賞与月の場合は賞与も加算
    if (this.bonusCount >= 4 && this.isBonusMonth) {
      const bonusAmount = this.form.get('bonusAmount')?.value || 0;
      total += bonusAmount;
    }

    this.data = {
      ...this.data,
      standardMonthlyRemuneration: total,
      standardMonthlyWage: this.standardMonthlyWage
    };

    this.calculateInsurance();
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    let stateData = history.state.data;
    console.log('編集画面 stateData:', stateData);

    // periodのセットを厳密に
    if (!this.data.period && stateData?.period) {
      this.data.period = stateData.period;
    }
    if (!this.data.period && this.route.snapshot.queryParams['year'] && this.route.snapshot.queryParams['month']) {
      this.data.period = {
        year: Number(this.route.snapshot.queryParams['year']),
        month: Number(this.route.snapshot.queryParams['month'])
      };
    }

    if (id) {
      this.employeeId = id;
      this.basicInfo = await this.employeeService.getBasicInfo(id);
      this.employmentInfo = await this.employeeService.getEmploymentInfo(id);
      this.insuranceStatus = await this.employeeService.getInsuranceStatus(id);
      this.specialAttributes = await this.employeeService.getSpecialAttributes(id);

      // Firestoreから必ず取得
      let insuranceDetail = null;
      if (this.data?.period) {
        insuranceDetail = await this.employeeService.getInsuranceDetail(this.employeeId, this.data.period);
        console.log('Firestore insuranceDetail:', insuranceDetail);
      }

      if (insuranceDetail) {
        this.data = { ...this.data, ...insuranceDetail };
        // 年齢・介護保険料対象フラグもセット
        if (this.basicInfo?.age !== undefined) {
          this.data.age = this.basicInfo.age;
          this.data.isNursingInsuranceEligible = (this.basicInfo.age >= 40 && this.basicInfo.age < 65);
        }
        // 保存済みのデータをフォームに反映
        this.form.patchValue({
          baseSalary: Number(insuranceDetail?.baseSalary ?? this.employmentInfo?.baseSalary ?? 0),
          allowances: Number(insuranceDetail?.allowances ?? this.employmentInfo?.allowances ?? 0),
          commutingAllowance: Number(insuranceDetail?.commutingAllowance ?? this.employmentInfo?.commutingAllowance ?? 0),
          bonusAmount: Number(insuranceDetail?.bonusAmount ?? 0),
          standardBonusAmount: Number(insuranceDetail?.standardBonusAmount ?? 0),
          notes: insuranceDetail?.notes ?? ''
        });
        // 氏名・社員番号・所属をthis.dataにセット
        if (this.basicInfo) {
          this.data.fullName = `${this.basicInfo.lastNameKanji ?? ''} ${this.basicInfo.firstNameKanji ?? ''}`.trim();
          this.data.employeeId = this.basicInfo.employeeId ?? '';
        }
        if (this.employmentInfo) {
          this.data.department = this.employmentInfo.department ?? '';
        }
        // 等級はinsuranceStatusからセット
        if (this.insuranceStatus) {
          this.data.grade = this.insuranceStatus.grade;
        }
        // 保存済みの保険料データを反映
        this.data.healthInsuranceEmployee = insuranceDetail.healthInsuranceEmployee;
        this.data.healthInsuranceEmployer = insuranceDetail.healthInsuranceEmployer;
        this.data.nursingInsuranceEmployee = insuranceDetail.nursingInsuranceEmployee;
        this.data.nursingInsuranceEmployer = insuranceDetail.nursingInsuranceEmployer;
        this.data.pensionInsuranceEmployee = insuranceDetail.pensionInsuranceEmployee;
        this.data.pensionInsuranceEmployer = insuranceDetail.pensionInsuranceEmployer;
        this.data.childContribution = insuranceDetail.childContribution;
        this.data.employeeTotalDeduction = insuranceDetail.employeeTotalDeduction;
        this.data.employerTotalDeduction = insuranceDetail.employerTotalDeduction;
        this.data.standardMonthlyRemuneration = insuranceDetail.standardMonthlyRemuneration;
        this.data.standardMonthlyWage = insuranceDetail.standardMonthlyWage;
        // 賞与保険料の保存値を反映
        this.bonusInsuranceResult = {
          healthInsuranceEmployee: insuranceDetail.bonusHealthInsuranceEmployee ?? 0,
          healthInsuranceEmployer: insuranceDetail.bonusHealthInsuranceEmployer ?? 0,
          nursingInsuranceEmployee: insuranceDetail.bonusNursingInsuranceEmployee ?? 0,
          nursingInsuranceEmployer: insuranceDetail.bonusNursingInsuranceEmployer ?? 0,
          pensionInsuranceEmployee: insuranceDetail.bonusPensionInsuranceEmployee ?? 0,
          pensionInsuranceEmployer: insuranceDetail.bonusPensionInsuranceEmployer ?? 0,
          childContribution: insuranceDetail.bonusChildContribution ?? 0,
        };
      } else {
        // 新規作成の場合
        if (this.basicInfo?.age !== undefined) {
          this.data.age = this.basicInfo.age;
          this.data.isNursingInsuranceEligible = (this.basicInfo.age >= 40 && this.basicInfo.age < 65);
        }
        this.form.patchValue({
          baseSalary: Number(this.employmentInfo?.baseSalary ?? 0),
          allowances: 0,
          commutingAllowance: 0,
          bonusAmount: 0,
          standardBonusAmount: 0,
          notes: ''
        });
        // 新規作成時も氏名・社員番号・所属をthis.dataに必ずセット
        if (this.basicInfo) {
          this.data.fullName = `${this.basicInfo.lastNameKanji ?? ''} ${this.basicInfo.firstNameKanji ?? ''}`.trim();
          this.data.employeeId = this.basicInfo.employeeId ?? '';
        }
        if (this.employmentInfo) {
          this.data.department = this.employmentInfo.department ?? '';
        }
        // 等級はinsuranceStatusからセット
        if (this.insuranceStatus) {
          this.data.grade = this.insuranceStatus.grade;
        }
      }

      await this.loadCompanyPrefecture();
      this.calculateStandardMonthlyRemuneration();
      // 育休・産休中なら保険料0円＋備考自動セット
      if (this.specialAttributes) {
        const leaveType = this.specialAttributes.leaveType;
        const leaveStart = this.specialAttributes.leaveStartDate;
        const leaveEnd = this.specialAttributes.leaveEndDate;
        let isOnLeave = false;
        if (leaveType && (leaveType === '育児休業' || leaveType === '産前産後休業' || leaveType === '介護休業') && leaveStart) {
          const today = new Date();
          const start = new Date(leaveStart);
          const end = leaveEnd ? new Date(leaveEnd) : null;
          isOnLeave = today >= start && (!end || today <= end);
        }
        if (isOnLeave) {
          // 休暇期間テキスト生成
          let periodText = '';
          if (this.specialAttributes?.leaveStartDate) {
            periodText += this.formatDate(this.specialAttributes.leaveStartDate);
            if (this.specialAttributes?.leaveEndDate) {
              periodText += '～' + this.formatDate(this.specialAttributes.leaveEndDate);
            } else {
              periodText += '～';
            }
          }
          if (this.specialAttributes?.leaveType === '介護休業') {
            // 保険料0円処理は行わず、備考欄のみ自動セット
            this.form.patchValue({ notes: `介護休暇中${periodText ? '（' + periodText + '）' : ''}` });
          } else {
            // 育児休業・産前産後休業のみ保険料0円処理
            this.data.healthInsuranceEmployee = 0;
            this.data.healthInsuranceEmployer = 0;
            this.data.nursingInsuranceEmployee = 0;
            this.data.nursingInsuranceEmployer = 0;
            this.data.pensionInsuranceEmployee = 0;
            this.data.pensionInsuranceEmployer = 0;
            this.data.childContribution = 0;
            this.data.employeeTotalDeduction = 0;
            this.data.employerTotalDeduction = 0;
            this.form.patchValue({ notes: `育児休暇中のため${periodText ? '（' + periodText + '）' : ''}` });
          }
        }
      }
      // 備考自動セット（noteがあれば）
      if (this.data.note) {
        this.form.patchValue({ notes: this.data.note });
      }
    }

    // 等級があれば標準報酬月額をセット
    if (this.insuranceStatus?.grade && this.aichiGrades[String(this.insuranceStatus.grade)]) {
      this.standardMonthlyWage = this.aichiGrades[String(this.insuranceStatus.grade)].standardMonthlyWage;
    }
    // 等級変更時に標準報酬月額を自動反映
    this.form.valueChanges.subscribe(() => {
      if (this.insuranceStatus?.grade && this.aichiGrades[String(this.insuranceStatus.grade)]) {
        this.standardMonthlyWage = this.aichiGrades[String(this.insuranceStatus.grade)].standardMonthlyWage;
      } else {
        this.standardMonthlyWage = null;
      }
    });

    // 会社設定から賞与支給月リストと賞与回数を取得
    const companySettings = await this.settingsService.getCompanySettings();
    const bonusMonths: number[] = companySettings.bonusMonths || [];
    const bonusCount: number = companySettings.bonusCount || 0;
    const currentMonth = this.data?.period?.month;
    this.isBonusMonth = bonusMonths.includes(currentMonth);
    this.bonusCount = bonusCount;

    // 賞与額・年齢・都道府県が揃ったら計算
    this.form.get('bonusAmount')?.valueChanges.subscribe((val: number) => {
      if (bonusCount >= 4 && this.isBonusMonth) {
        // 賞与が年4回以上かつ賞与月の場合のみ加算
        const baseSalary = this.form.get('baseSalary')?.value || 0;
        const allowances = this.form.get('allowances')?.value || 0;
        const commutingAllowance = this.form.get('commutingAllowance')?.value || 0;
        // 通常の総支給額＋賞与額
        const total = baseSalary + allowances + commutingAllowance + (val || 0);
        this.data.standardMonthlyRemuneration = total;
        this.form.get('standardBonusAmount')?.setValue(0, { emitEvent: false });
        // 保険料再計算
        this.calculateInsurance();
      } else if (this.isBonusMonth && bonusCount <= 3) {
        this.bonusInsuranceResult = this.insuranceCalculationService.calculateBonusInsurance({
          bonusAmount: val,
          prefecture: companySettings.prefecture,
          age: this.data?.age,
          year: '2025',
          bonusCount
        });
        const stdBonus = Math.floor((val || 0) / 1000) * 1000;
        this.form.get('standardBonusAmount')?.setValue(stdBonus, { emitEvent: false });
      } else {
        this.bonusInsuranceResult = null;
        this.form.get('standardBonusAmount')?.setValue(0, { emitEvent: false });
      }
    });
  }

  // 日付を日本語表記（YYYY年MM月DD日）で表示する関数
  private formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // 生年月日から年齢を計算する関数を追加
  private calculateAge(birthDate: string): number {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  async onSave() {
    if (!this.employeeId || !this.data?.period) {
      this.snackBar.open('保存に必要な情報が不足しています', '閉じる', { duration: 3000 });
      return;
    }
    if (this.form.get('baseSalary')?.invalid) {
      this.snackBar.open('基本給は必須です', '閉じる', { duration: 3000 });
      return;
    }

    if (!this.companyPrefecture) {
      this.snackBar.open('会社の所在地（都道府県）が設定されていません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
      return;
    }

    // 標準報酬月額と保険料を計算
    const baseSalary = Number(this.form.value.baseSalary) || 0;
    const allowances = Number(this.form.value.allowances) || 0;
    const commutingAllowance = Number(this.form.value.commutingAllowance) || 0;
    const total = baseSalary + allowances + commutingAllowance;
    const standardMonthlyRemuneration = Math.floor(total);

    // 生年月日から年齢を再計算
    let age = 30;
    let isNursingInsuranceEligible = false;
    if (this.basicInfo?.birthDate) {
      age = this.calculateAge(this.basicInfo.birthDate);
      isNursingInsuranceEligible = (age >= 40 && age < 65);
      console.log('保存時の年齢計算:', { birthDate: this.basicInfo.birthDate, age, isNursingInsuranceEligible });
    }

    // 保険料を計算
    let result = this.insuranceCalculationService.calculateInsurance({
      prefecture: this.companyPrefecture,
      grade: typeof this.insuranceStatus?.grade === 'number' ? this.insuranceStatus.grade : 0,
      age,
      hasChildren: false
    });

    // 育休・産休・介護休暇中なら備考自動セット
    let noteText = this.form.value.notes || '';
    if (this.isChildCareLeave) {
      if (this.specialAttributes?.leaveType === '介護休業') {
        noteText = '介護休暇中';
      } else if (this.specialAttributes?.leaveType === '育児休業' || this.specialAttributes?.leaveType === '産前産後休業') {
        noteText = '育児休暇中のため';
      }
    }
    // 備考欄にも即時反映
    this.form.patchValue({ notes: noteText });

    // 育休・産休中なら保険料を0に
    let saveValue;
    if (this.isChildCareLeave) {
      saveValue = {
        baseSalary,
        allowances,
        commutingAllowance,
        standardMonthlyRemuneration: 0,
        standardMonthlyWage: 0, // 標準報酬月額も0に
        bonusAmount: Number(this.form.value.bonusAmount) || 0,
        standardBonusAmount: Number(this.form.value.standardBonusAmount) || 0,
        // 賞与の社会保険料も0で保存
        bonusHealthInsuranceEmployee: 0,
        bonusHealthInsuranceEmployer: 0,
        bonusNursingInsuranceEmployee: 0,
        bonusNursingInsuranceEmployer: 0,
        bonusPensionInsuranceEmployee: 0,
        bonusPensionInsuranceEmployer: 0,
        bonusChildContribution: 0,
        notes: noteText,
        healthInsuranceEmployee: 0,
        healthInsuranceEmployer: 0,
        nursingInsuranceEmployee: 0,
        nursingInsuranceEmployer: 0,
        pensionInsuranceEmployee: 0,
        pensionInsuranceEmployer: 0,
        childContribution: 0,
        employeeTotalDeduction: 0,
        employerTotalDeduction: 0,
        fullName: this.data.fullName,
        department: this.data.department,
        employeeId: this.employeeId,
        age,
        isNursingInsuranceEligible
      };
    } else {
      saveValue = result ? {
        baseSalary,
        allowances,
        commutingAllowance,
        standardMonthlyRemuneration,
        standardMonthlyWage: this.standardMonthlyWage || 0, // 標準報酬月額を保存
        bonusAmount: Number(this.form.value.bonusAmount) || 0,
        standardBonusAmount: Number(this.form.value.standardBonusAmount) || 0,
        // 賞与の社会保険料も保存
        bonusHealthInsuranceEmployee: this.bonusInsuranceResult?.healthInsuranceEmployee || 0,
        bonusHealthInsuranceEmployer: this.bonusInsuranceResult?.healthInsuranceEmployer || 0,
        bonusNursingInsuranceEmployee: this.bonusInsuranceResult?.nursingInsuranceEmployee || 0,
        bonusNursingInsuranceEmployer: this.bonusInsuranceResult?.nursingInsuranceEmployer || 0,
        bonusPensionInsuranceEmployee: this.bonusInsuranceResult?.pensionInsuranceEmployee || 0,
        bonusPensionInsuranceEmployer: this.bonusInsuranceResult?.pensionInsuranceEmployer || 0,
        bonusChildContribution: this.bonusInsuranceResult?.childContribution || 0,
        notes: noteText,
        healthInsuranceEmployee: result.healthInsurance.employee,
        healthInsuranceEmployer: result.healthInsurance.employer,
        nursingInsuranceEmployee: isNursingInsuranceEligible ? result.nursingInsurance.employee : 0,
        nursingInsuranceEmployer: isNursingInsuranceEligible ? result.nursingInsurance.employer : 0,
        pensionInsuranceEmployee: result.pensionInsurance.employee,
        pensionInsuranceEmployer: result.pensionInsurance.employer,
        childContribution: result.childContribution,
        employeeTotalDeduction: result.total.employee,
        employerTotalDeduction: result.total.employer,
        fullName: this.data.fullName,
        department: this.data.department,
        employeeId: this.employeeId,
        age,
        isNursingInsuranceEligible
      } : {
        baseSalary,
        allowances,
        commutingAllowance,
        standardMonthlyRemuneration,
        standardMonthlyWage: this.standardMonthlyWage || 0, // 標準報酬月額を保存
        bonusAmount: Number(this.form.value.bonusAmount) || 0,
        standardBonusAmount: Number(this.form.value.standardBonusAmount) || 0,
        // 賞与の社会保険料も0で保存
        bonusHealthInsuranceEmployee: 0,
        bonusHealthInsuranceEmployer: 0,
        bonusNursingInsuranceEmployee: 0,
        bonusNursingInsuranceEmployer: 0,
        bonusPensionInsuranceEmployee: 0,
        bonusPensionInsuranceEmployer: 0,
        bonusChildContribution: 0,
        notes: noteText,
        healthInsuranceEmployee: 0,
        healthInsuranceEmployer: 0,
        nursingInsuranceEmployee: 0,
        nursingInsuranceEmployer: 0,
        pensionInsuranceEmployee: 0,
        pensionInsuranceEmployer: 0,
        childContribution: 0,
        employeeTotalDeduction: 0,
        employerTotalDeduction: 0,
        fullName: this.data.fullName,
        department: this.data.department,
        employeeId: this.employeeId,
        age,
        isNursingInsuranceEligible
      };
    }

    try {
      await this.employeeService.saveInsuranceDetail(this.employeeId, this.data.period, saveValue);
      // 保存したデータをthis.dataとsavedInsuranceDataの両方に反映
      this.data = { ...this.data, ...saveValue };
      this.savedInsuranceData = saveValue;
      this.showDownloadButtons = true;

      this.snackBar.open('保存が完了しました', '閉じる', { duration: 2000 });
      this.router.navigate(['/admin/insurance']);
    } catch (e: any) {
      console.error('保存エラー:', e);
      this.snackBar.open('保存に失敗しました: ' + (e?.message || e), '閉じる', { duration: 3000 });
    }
  }

  onBack() {
    this.router.navigate(['/admin/insurance']);
  }

  async downloadPdf() {
    if (!this.pdfContent || !this.savedInsuranceData) {
      alert('PDF出力用の内容が見つかりません');
      return;
    }
    try {
      // 保存したデータをthis.dataに反映（PDFテンプレート用）
      this.data = {
        ...this.data,
        ...this.savedInsuranceData,
        standardMonthlyWage: this.standardMonthlyWage,
        standardMonthlyRemuneration: this.data.standardMonthlyRemuneration
      };
      
      const element = this.pdfContent.nativeElement;
      const originalDisplay = element.style.display;
      element.style.display = 'block';

      // データの反映を待つため、待機時間を延長
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // クローンされた要素にデータが反映されていることを確認
          console.log('PDF生成時のデータ:', this.data);
        }
      });

      element.style.display = originalDisplay;

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const yearMonth = this.data?.period ? `${this.data.period.year}年${this.data.period.month}月` : '';
      const name = this.savedInsuranceData.fullName || '';
      const employeeId = this.savedInsuranceData.employeeId || '';
      // 等級はinsuranceStatusから取得
      const grade = this.insuranceStatus?.grade ?? '';
      const fileName = `社会保険料明細書_${yearMonth}_${name}_${employeeId}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF出力エラー:', error);
      alert('PDFの出力中にエラーが発生しました。');
    }
  }

  downloadCsv() {
    if (!this.savedInsuranceData) {
      alert('CSV出力用のデータが見つかりません');
      return;
    }

    const yearMonth = this.data?.period ? `${this.data.period.year}年${this.data.period.month}月` : '';
    const name = this.savedInsuranceData.fullName || '';
    const employeeId = this.savedInsuranceData.employeeId || '';

    const headers = [
      '氏名', '社員番号', '等級', '年月', '標準報酬月額', '賞与支給額（該当月）', '標準賞与額',
      '健康保険料（個人分）', '健康保険料（会社分）', '介護保険料（個人分）', '介護保険料（会社分）',
      '厚生年金保険料（個人分）', '厚生年金保険料（会社分）', '子ども・子育て拠出金',
      '個人負担保険料合計', '会社負担保険料合計', '備考'
    ];

    const row = [
      `"${name}"`,
      `"${employeeId}"`,
      `"${this.insuranceStatus?.grade || ''}"`,
      `"${yearMonth}"`,
      `"${this.savedInsuranceData.standardMonthlyRemuneration || 0}"`,
      `"${this.savedInsuranceData.bonusAmount || 0}"`,
      `"${this.savedInsuranceData.standardBonusAmount || 0}"`,
      `"${this.savedInsuranceData.healthInsuranceEmployee || 0}"`,
      `"${this.savedInsuranceData.healthInsuranceEmployer || 0}"`,
      `"${this.savedInsuranceData.nursingInsuranceEmployee || 0}"`,
      `"${this.savedInsuranceData.nursingInsuranceEmployer || 0}"`,
      `"${this.savedInsuranceData.pensionInsuranceEmployee || 0}"`,
      `"${this.savedInsuranceData.pensionInsuranceEmployer || 0}"`,
      `"${this.savedInsuranceData.childContribution || 0}"`,
      `"${this.savedInsuranceData.employeeTotalDeduction || 0}"`,
      `"${this.savedInsuranceData.employerTotalDeduction || 0}"`,
      `"${this.savedInsuranceData.notes || ''}"`
    ];

    const csvContent = [headers.join(','), row.join(',')].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `社会保険料明細書_${yearMonth}_${name}_${employeeId}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  public floor(value: number): number {
    return Math.floor(value);
  }

  /**
   * 端数処理を行う
   * 50銭以下は切り捨て、50銭超は切り上げ
   */
  roundAmount(amount: number): number {
    return Math.round(amount);
  }

  private calculateInsurance() {
    if (!this.companyPrefecture) {
      console.error('会社の所在地（都道府県）が設定されていません');
      this.snackBar.open('会社の所在地（都道府県）が設定されていません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
      return;
    }

    const baseSalary = this.form.get('baseSalary')?.value || 0;
    const allowances = this.form.get('allowances')?.value || 0;
    const commutingAllowance = this.form.get('commutingAllowance')?.value || 0;

    // 生年月日から年齢を計算
    let age = 30;
    const birthDate = this.basicInfo?.birthDate || this.data.birthDate;
    if (birthDate) {
      age = this.calculateAge(birthDate);
    }
    console.log('保険料再計算: 都道府県=', this.companyPrefecture, '年齢=', age, '基本給=', baseSalary, '手当=', allowances, '通勤手当=', commutingAllowance);

    // 保険料計算
    const result = this.insuranceCalculationService.calculateInsurance({
      prefecture: this.companyPrefecture,
      grade: typeof this.insuranceStatus?.grade === 'number' ? this.insuranceStatus.grade : 0,
      age,
      hasChildren: false
    });

    // 結果をdataに反映
    if (this.data) {
      this.data.healthInsuranceEmployee = result ? result.healthInsurance.employee : 0;
      this.data.healthInsuranceEmployer = result ? result.healthInsurance.employer : 0;
      this.data.nursingInsuranceEmployee = result ? result.nursingInsurance.employee : 0;
      this.data.nursingInsuranceEmployer = result ? result.nursingInsurance.employer : 0;
      this.data.pensionInsuranceEmployee = result ? result.pensionInsurance.employee : 0;
      this.data.pensionInsuranceEmployer = result ? result.pensionInsurance.employer : 0;
      this.data.childContribution = result ? result.childContribution : 0;
      this.data.employeeTotalDeduction = result ? result.total.employee : 0;
      this.data.employerTotalDeduction = result ? result.total.employer : 0;
    }
  }

  get isChildCareLeave(): boolean {
    if (!this.specialAttributes) return false;
    const leaveType = this.specialAttributes.leaveType;
    const leaveStart = this.specialAttributes.leaveStartDate;
    const leaveEnd = this.specialAttributes.leaveEndDate;
    if (leaveType && (leaveType === '育児休業' || leaveType === '産前産後休業') && leaveStart) {
      const today = new Date();
      const start = new Date(leaveStart);
      const end = leaveEnd ? new Date(leaveEnd) : null;
      return today >= start && (!end || today <= end);
    }
    return false;
  }
} 