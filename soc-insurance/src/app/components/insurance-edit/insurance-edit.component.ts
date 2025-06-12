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
import { Firestore, doc, setDoc, getDoc, getDocs, query, where, collection } from '@angular/fire/firestore';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { InsuranceCalculationService } from '../../services/insuranceCalculationService';
import { InsuranceData } from '../../models/insurance.model';
import aichiGradesData from '../../services/23aichi_insurance_grades.json';
import { SettingsService } from '../../services/settings.service';
import { InsuranceSummaryService } from '../../services/insurance-summary.service';
import { InsuranceEligibilityService } from '../../services/insurance-eligibility.service';

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
  private companyPrefecture: string | null = null;
  public aichiGrades: { [key: string]: { standardMonthlyWage: number } } = aichiGradesData;
  public standardMonthlyWage: number | null = null;
  insuranceStatus: any = null;
  isBonusMonth = false;
  bonusInsuranceResult: any = null;
  bonusCount: number = 0;
  @Input() companySummaryTable: any;
  @Input() companyBonusSummaryTable: any;
  @Input() hasBonus: boolean = false;
  insuranceEligibilityResult: any = null;
  employeeFullInfo: any = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private employeeService: EmployeeService,
    private snackBar: MatSnackBar,
    private firestore: Firestore,
    private settingsService: SettingsService,
    private insuranceSummaryService: InsuranceSummaryService,
    private insuranceEligibilityService: InsuranceEligibilityService,
    private insuranceCalculationService: InsuranceCalculationService
  ) {
    this.form = this.fb.group({
      month: [''],
      baseSalary: [0, Validators.required],
      allowances: [0, Validators.required],
      commutingAllowance: [0, Validators.required],
      bonusAmount: [{ value: 0, disabled: true }],
      standardBonusAmount: [0],
      variableWage: [0],
      notes: ['']
    });
    this.data = this.data || {}; // dataの初期化

    // 会社の所在地を取得
    this.loadCompanyPrefecture();

    // 標準報酬月額の自動計算
    this.form.valueChanges.subscribe(() => {
      this.calculateStandardMonthlyRemuneration();
      if (this.isExemptedByFourteenDayRule) {
        this.bonusInsuranceResult = {
          healthInsuranceEmployee: 0,
          healthInsuranceEmployer: 0,
          nursingInsuranceEmployee: 0,
          nursingInsuranceEmployer: 0,
          pensionInsuranceEmployee: 0,
          pensionInsuranceEmployer: 0,
          childContribution: 0
        };
      }
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
    const variableWage = this.form.get('variableWage')?.value || 0;
    let total = baseSalary + allowances + commutingAllowance + variableWage;

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

    // ここから累計賞与額の取得処理を追加
    if (this.data?.period?.year && id) {
      const year = this.data.period.year;
      const employeeId = id;
      let annualBonusTotal = 0;
      // Firestoreから今年の賞与合計を取得（今回の賞与を除く）
      const bonusDocs = await getDocs(
        query(
          collection(this.firestore, 'insuranceDetails'),
          where('employeeId', '==', employeeId)
        )
      );
      annualBonusTotal = bonusDocs.docs
        .filter(doc => {
          const data = doc.data();
          // 今年分のみ、かつ今回のperiodと異なるもの
          return data['period']?.year === year && (data['period']?.month !== this.data.period.month);
        })
        .map(doc => doc.data()['bonusAmount'] || 0)
        .reduce((sum, val) => sum + val, 0);
      this.data.annualBonusTotal = annualBonusTotal;
    }

    if (id) {
      this.employeeId = id;
      this.basicInfo = await this.employeeService.getBasicInfo(id);
      this.employmentInfo = await this.employeeService.getEmploymentInfo(id);
      this.insuranceStatus = await this.employeeService.getInsuranceStatus(id);
      this.specialAttributes = await this.employeeService.getSpecialAttributes(id);
      // Firestoreから必ず取得
      if (this.data?.period) {
        const insuranceDetail = await this.employeeService.getInsuranceDetail(this.employeeId, this.data.period);
      if (insuranceDetail) {
        this.data = { ...this.data, ...insuranceDetail };
          // Firestoreから取得した賞与保険料計算結果を常にセット
        this.bonusInsuranceResult = {
          healthInsuranceEmployee: insuranceDetail.bonusHealthInsuranceEmployee ?? 0,
          healthInsuranceEmployer: insuranceDetail.bonusHealthInsuranceEmployer ?? 0,
          nursingInsuranceEmployee: insuranceDetail.bonusNursingInsuranceEmployee ?? 0,
          nursingInsuranceEmployer: insuranceDetail.bonusNursingInsuranceEmployer ?? 0,
          pensionInsuranceEmployee: insuranceDetail.bonusPensionInsuranceEmployee ?? 0,
          pensionInsuranceEmployer: insuranceDetail.bonusPensionInsuranceEmployer ?? 0,
            childContribution: insuranceDetail.bonusChildContribution ?? 0
          };
          console.log('DEBUG: Firestoreから取得した賞与保険料計算結果:', this.bonusInsuranceResult);
        }
      }
      // employeeFullInfoを取得
      this.employeeFullInfo = await this.employeeService.getEmployee(this.employeeId);
      if (this.employeeFullInfo) {
        // 氏名・社員番号・所属・年齢・介護保険判定をセット
        this.data.fullName = `${this.employeeFullInfo.employeeBasicInfo.lastNameKanji ?? ''} ${this.employeeFullInfo.employeeBasicInfo.firstNameKanji ?? ''}`.trim();
        this.data.employeeId = this.employeeFullInfo.employeeBasicInfo.employeeId ?? '';
        this.data.department = this.employeeFullInfo.employmentInfo?.department ?? '';
        const periodYear = this.data?.period?.year;
        const periodMonth = this.data?.period?.month;
        const birthDate = this.employeeFullInfo.employeeBasicInfo.birthDate;
        if (birthDate && periodYear && periodMonth) {
          const age = this.calculateAgeAt(birthDate, periodYear, periodMonth);
          this.data.age = age;
          this.data.isNursingInsuranceEligible = (age >= 40 && age < 65);
        }
        // フォーム初期値セット・初期計算・購読
        this.form.patchValue({
          baseSalary: Number(this.data?.baseSalary ?? this.employmentInfo?.baseSalary ?? 0),
          allowances: Number(this.data?.allowances ?? this.employmentInfo?.allowances ?? 0),
          commutingAllowance: Number(this.data?.commutingAllowance ?? this.employmentInfo?.commutingAllowance ?? 0),
          bonusAmount: Number(this.data?.bonusAmount ?? 0),
          standardBonusAmount: Number(this.data?.standardBonusAmount ?? 0),
          variableWage: Number(this.data?.variableWage ?? 0),
          notes: this.data?.notes ?? ''
        }, { emitEvent: false });
        // データ取得後のみ購読・計算
        this.form.valueChanges.subscribe(() => {
          this.updateEligibilityResultAndRecalculate();
        });
        this.calculateStandardMonthlyRemuneration();
      } else {
        this.snackBar.open('従業員情報が取得できませんでした', '閉じる', { duration: 5000 });
        return;
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
        // 賞与の介護保険判定
        let isNursingInsuranceEligible = false;
        let isPensionInsuranceEligible = false;
        const birthDate = this.employeeFullInfo?.employeeBasicInfo?.birthDate;
        const periodYear = this.data?.period?.year;
        const periodMonth = this.data?.period?.month;
        if (birthDate && periodYear && periodMonth) {
          isNursingInsuranceEligible = this.isNursingInsuranceEligible(birthDate, periodYear, periodMonth);
          isPensionInsuranceEligible = this.isPensionInsuranceEligible(birthDate, periodYear, periodMonth);
          console.log('DEBUG: 賞与の保険料判定:', {
            birthDate,
            periodYear,
            periodMonth,
            isNursingInsuranceEligible,
            isPensionInsuranceEligible,
            eligibilityResult: this.insuranceEligibilityResult
          });
        }

        this.bonusInsuranceResult = this.insuranceCalculationService.calculateBonusInsurance({
          bonusAmount: val,
          prefecture: companySettings.prefecture,
          age: isNursingInsuranceEligible ? 40 : this.data?.age,
          year: '2025',
          bonusCount,
          isMaternityLeave: this.form.value.isMaternityLeave || false,
          annualBonusTotal: this.data?.annualBonusTotal || 0
        });

        // 賞与の保険料計算結果をeligibilityResultに基づいて調整
        if (this.bonusInsuranceResult && this.insuranceEligibilityResult) {
          const eligibilityResult = this.insuranceEligibilityResult;
          
          // 健康保険
          if (!eligibilityResult.healthInsurance) {
            this.bonusInsuranceResult.healthInsuranceEmployee = 0;
            this.bonusInsuranceResult.healthInsuranceEmployer = 0;
          }
          
          // 介護保険
          if (!eligibilityResult.nursingInsurance) {
            this.bonusInsuranceResult.nursingInsuranceEmployee = 0;
            this.bonusInsuranceResult.nursingInsuranceEmployer = 0;
          }
          
          // 厚生年金
          if (!isPensionInsuranceEligible) {
            this.bonusInsuranceResult.pensionInsuranceEmployee = 0;
            this.bonusInsuranceResult.pensionInsuranceEmployer = 0;
          }
          
          // 子ども・子育て拠出金
          if (!eligibilityResult.healthInsurance) {
            this.bonusInsuranceResult.childContribution = 0;
          }

          console.log('DEBUG: 賞与の保険料計算結果:', {
            bonusAmount: val,
            bonusInsuranceResult: this.bonusInsuranceResult,
            eligibilityResult,
            isNursingInsuranceEligible,
            isPensionInsuranceEligible
          });
        }

        const stdBonus = Math.floor((val || 0) / 1000) * 1000;
        this.form.get('standardBonusAmount')?.setValue(stdBonus, { emitEvent: false });
      } else {
        this.bonusInsuranceResult = null;
        this.form.get('standardBonusAmount')?.setValue(0, { emitEvent: false });
      }
    });

    // isBonusMonthの状態に応じてbonusAmountコントロールを制御
    this.toggleBonusAmountControl();

    // 保険判定サービスから免除月情報を取得
    if (this.employeeId) {
      // EmployeeFullInfoを取得して保持
      this.employeeFullInfo = await this.employeeService.getEmployee(this.employeeId);
      if (this.employeeFullInfo) {
        const eligibilityService = new (await import('../../services/insurance-eligibility.service')).InsuranceEligibilityService(this.firestore);
        const periodYear = this.data?.period?.year;
        const periodMonth = this.data?.period?.month;
        const today = new Date();
        const year = periodYear || today.getFullYear();
        const month = periodMonth || (today.getMonth() + 1);
        this.insuranceEligibilityService.getInsuranceEligibility(this.employeeFullInfo, year, month).subscribe(eligibilityResult => {
          this.insuranceEligibilityResult = eligibilityResult;
          if (this.data) {
            this.data.eligibilityResult = eligibilityResult;
            // その月の介護保険判定
            let isNursingInsuranceEligible = false;
            if (periodYear && periodMonth && this.basicInfo?.birthDate) {
              isNursingInsuranceEligible = this.insuranceEligibilityService.isNursingInsuranceEligibleAt(
                this.basicInfo.birthDate, periodYear, periodMonth
              );
            }
            console.log('介護保険判定:', { isNursingInsuranceEligible, eligibilityResult });
            if (eligibilityResult.healthInsurance || eligibilityResult.pensionInsurance) {
              // 保険料計算を実行
              if (!this.companyPrefecture) {
                console.error('会社の所在地（都道府県）が設定されていません');
                this.snackBar.open('会社の所在地（都道府県）が設定されていません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
                return;
              }
              const periodYear = this.data?.period?.year;
              const periodMonth = this.data?.period?.month;
              const birthDate = this.employeeFullInfo.employeeBasicInfo.birthDate;
              let ageForInsurance = 30;
              let isNursingInsuranceEligible = false;
              let isPensionInsuranceEligible = false;
              if (birthDate && periodYear && periodMonth) {
                // 介護保険控除開始月ロジック
                const { year: startYear, month: startMonth } = this.getNursingInsuranceStartMonth(birthDate);
                const ym = periodYear * 100 + periodMonth;
                const startYm = startYear * 100 + startMonth;
                isNursingInsuranceEligible = ym >= startYm;
                ageForInsurance = isNursingInsuranceEligible ? 40 : this.calculateAgeAt(birthDate, periodYear, periodMonth);
                // 厚生年金終了判定
                isPensionInsuranceEligible = this.isPensionInsuranceEligible(birthDate, periodYear, periodMonth);
                console.log('DEBUG: 控除開始年月:', startYear, startMonth, '今月:', periodYear, periodMonth, 'isNursingInsuranceEligible:', isNursingInsuranceEligible, 'isPensionInsuranceEligible:', isPensionInsuranceEligible);
              }
              console.log('DEBUG: age for insurance calculation (控除開始月ロジック適用):', ageForInsurance);

              const insuranceResult = this.insuranceCalculationService.calculateInsurance({
                prefecture: this.companyPrefecture,
                grade: Number(this.insuranceStatus?.grade) || 0,
                age: ageForInsurance,
                hasChildren: false
              });
              console.log('DEBUG: insuranceResult:', insuranceResult);
              if (insuranceResult == null) {
                console.error('保険料計算失敗時の詳細:', {
                  prefecture: this.companyPrefecture,
                  grade: Number(this.insuranceStatus?.grade) || 0,
                  age: ageForInsurance,
                  insuranceStatus: this.insuranceStatus,
                  data: this.data
                });
                this.snackBar.open('保険料計算に失敗しました。都道府県・等級・標準報酬月額を確認してください。', '閉じる', { duration: 5000 });
                return;
              }

              const eligibilityResult = this.insuranceEligibilityResult;
              if (eligibilityResult && (eligibilityResult.healthInsurance || eligibilityResult.pensionInsurance)) {
                this.data.healthInsuranceEmployee = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employee : 0;
                this.data.healthInsuranceEmployer = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employer : 0;
                // 介護保険はeligibilityResultの判定結果に基づいて計算
                this.data.nursingInsuranceEmployee = (eligibilityResult.healthInsurance && eligibilityResult.nursingInsurance) ? insuranceResult.nursingInsurance.employee : 0;
                this.data.nursingInsuranceEmployer = (eligibilityResult.healthInsurance && eligibilityResult.nursingInsurance) ? insuranceResult.nursingInsurance.employer : 0;
                // 厚生年金は終了判定で加算
                this.data.pensionInsuranceEmployee = isPensionInsuranceEligible ? insuranceResult.pensionInsurance.employee : 0;
                this.data.pensionInsuranceEmployer = isPensionInsuranceEligible ? insuranceResult.pensionInsurance.employer : 0;
                this.data.childContribution = eligibilityResult.healthInsurance ? insuranceResult.childContribution : 0;
                this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsurance(
                  this.data.healthInsuranceEmployee,
                  this.data.nursingInsuranceEmployee,
                  this.data.pensionInsuranceEmployee
                );
                this.data.employerTotalDeduction = this.calculateEmployerTotalInsurance(
                  this.data.healthInsuranceEmployer,
                  this.data.nursingInsuranceEmployer,
                  this.data.pensionInsuranceEmployer
                );
                console.log('保険料計算結果:', {
                  health: { employee: this.data.healthInsuranceEmployee, employer: this.data.healthInsuranceEmployer },
                  nursing: { employee: this.data.nursingInsuranceEmployee, employer: this.data.nursingInsuranceEmployer },
                  pension: { employee: this.data.pensionInsuranceEmployee, employer: this.data.pensionInsuranceEmployer },
                  total: { employee: this.data.employeeTotalDeduction, employer: this.data.employerTotalDeduction },
                  eligibilityResult: this.insuranceEligibilityResult
                });
              } else {
                this.data.healthInsuranceEmployee = 0;
                this.data.healthInsuranceEmployer = 0;
                this.data.nursingInsuranceEmployee = 0;
                this.data.nursingInsuranceEmployer = 0;
                this.data.pensionInsuranceEmployee = 0;
                this.data.pensionInsuranceEmployer = 0;
                this.data.childContribution = 0;
                this.data.employeeTotalDeduction = 0;
                this.data.employerTotalDeduction = 0;
              }
            } else {
              this.data.healthInsuranceEmployee = 0;
              this.data.healthInsuranceEmployer = 0;
              this.data.nursingInsuranceEmployee = 0;
              this.data.nursingInsuranceEmployer = 0;
              this.data.pensionInsuranceEmployee = 0;
              this.data.pensionInsuranceEmployer = 0;
              this.data.childContribution = 0;
              this.data.employeeTotalDeduction = 0;
              this.data.employerTotalDeduction = 0;
            }
          }
        });
      }
    }
    // データ取得前には計算・購読を絶対に行わない
  }

  // isBonusMonthの変化に応じてbonusAmountコントロールを制御するメソッドを追加
  private toggleBonusAmountControl() {
    const bonusAmountControl = this.form.get('bonusAmount');
    if (!this.isBonusMonth) {
      bonusAmountControl?.disable({ emitEvent: false });
    } else {
      bonusAmountControl?.enable({ emitEvent: false });
    }
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

  // 指定年月日時点の年齢を計算
  private calculateAgeAt(birthDate: string, year: number, month: number): number {
    const baseDate = new Date(year, month - 1, 1); // その月の1日
    const birth = new Date(birthDate);
    let age = baseDate.getFullYear() - birth.getFullYear();
    const m = baseDate.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && baseDate.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  get canSave(): boolean {
    // 健康保険等級と厚生年金等級の両方が未設定ならfalse、両方登録されていればtrue
    const healthGrade = this.insuranceStatus?.grade;
    const pensionGrade = this.insuranceStatus?.newGrade;
    const hasHealth = healthGrade !== null && healthGrade !== undefined && healthGrade !== '' && healthGrade !== 0 && healthGrade !== '未設定';
    const hasPension = pensionGrade !== null && pensionGrade !== undefined && pensionGrade !== '' && pensionGrade !== 0 && pensionGrade !== '未設定';
    
    // 等級が設定されていても、組み合わせが正しくない場合はfalse
    if (hasHealth && hasPension) {
      return this.checkGradeCombination(Number(healthGrade), Number(pensionGrade));
    }
    
    return hasHealth && hasPension;
  }

  // 健康保険と厚生年金の等級の組み合わせをチェックする関数
  private checkGradeCombination(healthGrade: number | string, pensionGrade: number | string): boolean {
    const hGrade = Number(healthGrade);
    const pGrade = Number(pensionGrade);
    // 厚生年金等級が1の場合、健康保険等級は1～4のみOK
    if (pGrade === 1) {
      return hGrade >= 1 && hGrade <= 4;
    }
    // 厚生年金等級が32の場合、健康保険等級は35～50のみOK
    if (pGrade === 32) {
      return hGrade >= 35 && hGrade <= 50;
    }
    // それ以外は従来通りtrue
    return true;
  }

  async onSave() {
    if (!this.canSave) {
      this.snackBar.open('健康保険等級と厚生年金等級の両方を設定してください', '閉じる', { duration: 3000 });
      return;
    }

    // 健康保険と厚生年金の等級の組み合わせをチェック
    const healthGrade = Number(this.insuranceStatus?.grade);
    const pensionGrade = Number(this.insuranceStatus?.newGrade);
    
    if (!this.checkGradeCombination(healthGrade, pensionGrade)) {
      this.snackBar.open('健康保険等級と厚生年金等級の組み合わせが正しくありません。正しい組み合わせを設定してください。', '閉じる', { duration: 5000 });
      return;
    }

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
    const variableWage = Number(this.form.value.variableWage) || 0;
    const total = baseSalary + allowances + commutingAllowance + variableWage;
    const standardMonthlyRemuneration = Math.floor(total);

    // 生年月日から年齢を再計算
    let age = 30;
    let isNursingInsuranceEligible = false;
    if (this.basicInfo?.birthDate) {
      age = this.calculateAge(this.basicInfo.birthDate);
      // その月の介護保険判定
      if (this.data?.period?.year && this.data?.period?.month) {
        isNursingInsuranceEligible = this.insuranceEligibilityService.isNursingInsuranceEligibleAt(
          this.basicInfo.birthDate, this.data.period.year, this.data.period.month
        );
      } else {
      isNursingInsuranceEligible = (age >= 40 && age < 65);
      }
      console.log('保存時の年齢計算:', { birthDate: this.basicInfo.birthDate, age, isNursingInsuranceEligible });
    }

    // 保険料を計算
    let result = this.insuranceCalculationService.calculateInsurance({
      prefecture: this.companyPrefecture,
      grade: Number(this.insuranceStatus?.grade) || 0,
      age: age,
      hasChildren: false
    });

    // 育休・産休・介護休暇中なら備考自動セット
    let noteText = this.form.value.notes || '';
    if (this.isExemptedByFourteenDayRule) {
      if (this.specialAttributes?.leaveType === '介護休業') {
        noteText = '介護休暇中';
      } else if (this.specialAttributes?.leaveType === '育児休業' || this.specialAttributes?.leaveType === '産前産後休業') {
        noteText = '育児休暇';
      }
    }
    // 備考欄にも即時反映
    this.form.patchValue({ notes: noteText });

    // 育休・産休中なら保険料を0に
    let saveValue;
    if (this.isExemptedByFourteenDayRule) {
      saveValue = {
        baseSalary,
        allowances,
        commutingAllowance,
        variableWage,
        standardMonthlyRemuneration: 0,
        grade: this.insuranceStatus?.grade ?? null,
        standardMonthlyWage: this.insuranceStatus?.standardMonthlyWage ?? null,
        newGrade: this.insuranceStatus?.newGrade ?? null,
        newStandardMonthlyWage: this.insuranceStatus?.newStandardMonthlyWage ?? null,
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
      // 通常計算値を必ず保存
      const bonusRaw = this.bonusInsuranceResult || {};
      saveValue = result ? {
        baseSalary,
        allowances,
        commutingAllowance,
        variableWage,
        standardMonthlyRemuneration,
        grade: this.insuranceStatus?.grade ?? null,
        standardMonthlyWage: this.insuranceStatus?.standardMonthlyWage ?? null,
        newGrade: this.insuranceStatus?.newGrade ?? null,
        newStandardMonthlyWage: this.insuranceStatus?.newStandardMonthlyWage ?? null,
        bonusAmount: Number(this.form.value.bonusAmount) || 0,
        standardBonusAmount: Number(this.form.value.standardBonusAmount) || 0,
        // 賞与の社会保険料は2分割直後の値（端数処理前）を保存
        bonusHealthInsuranceEmployee: typeof bonusRaw.healthInsuranceEmployee === 'number' ? bonusRaw.healthInsuranceEmployee : 0,
        bonusHealthInsuranceEmployer: typeof bonusRaw.healthInsuranceEmployer === 'number' ? bonusRaw.healthInsuranceEmployer : 0,
        bonusNursingInsuranceEmployee: typeof bonusRaw.nursingInsuranceEmployee === 'number' ? bonusRaw.nursingInsuranceEmployee : 0,
        bonusNursingInsuranceEmployer: typeof bonusRaw.nursingInsuranceEmployer === 'number' ? bonusRaw.nursingInsuranceEmployer : 0,
        bonusPensionInsuranceEmployee: typeof bonusRaw.pensionInsuranceEmployee === 'number' ? bonusRaw.pensionInsuranceEmployee : 0,
        bonusPensionInsuranceEmployer: typeof bonusRaw.pensionInsuranceEmployer === 'number' ? bonusRaw.pensionInsuranceEmployer : 0,
        bonusChildContribution: typeof bonusRaw.childContribution === 'number' ? bonusRaw.childContribution : 0,
        notes: noteText,
        healthInsuranceEmployee: result.healthInsurance.employee,
        healthInsuranceEmployer: result.healthInsurance.employer,
        nursingInsuranceEmployee: isNursingInsuranceEligible ? (result.nursingInsurance.employee - result.healthInsurance.employee) : 0,
        nursingInsuranceEmployer: isNursingInsuranceEligible ? (result.nursingInsurance.employer - result.healthInsurance.employer - result.nursingInsurance.employee) : 0,
        pensionInsuranceEmployee: result.pensionInsurance.employee,
        pensionInsuranceEmployer: result.pensionInsurance.employer,
        childContribution: result.childContribution,
        employeeTotalDeduction: this.calculateEmployeeTotalInsurance(
          this.data.healthInsuranceEmployee,
          this.data.nursingInsuranceEmployee,
          this.data.pensionInsuranceEmployee
        ),
        employerTotalDeduction: this.calculateEmployerTotalInsurance(
          this.data.healthInsuranceEmployer,
          this.data.nursingInsuranceEmployer,
          this.data.pensionInsuranceEmployer
        ),
        fullName: this.data.fullName,
        department: this.data.department,
        employeeId: this.employeeId,
        age,
        isNursingInsuranceEligible
      } : {
        baseSalary,
        allowances,
        commutingAllowance,
        variableWage,
        standardMonthlyRemuneration,
        grade: this.insuranceStatus?.grade ?? null,
        standardMonthlyWage: this.insuranceStatus?.standardMonthlyWage ?? null,
        newGrade: this.insuranceStatus?.newGrade ?? null,
        newStandardMonthlyWage: this.insuranceStatus?.newStandardMonthlyWage ?? null,
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
      // Firestoreから最新データを再取得して反映
      const latest = await this.employeeService.getInsuranceDetail(this.employeeId, this.data.period);
      this.data = { ...this.data, ...latest };
      this.savedInsuranceData = latest;
      this.showDownloadButtons = true;

      // 会社全体の保険料明細も即時更新
      if (this.data?.period && this.companySummaryTable && this.companyBonusSummaryTable !== undefined && this.hasBonus !== undefined) {
        await this.insuranceSummaryService.saveCompanySummary(
          this.data.period.year,
          this.data.period.month,
          this.companySummaryTable,
          this.companyBonusSummaryTable,
          this.hasBonus
        );
      }

      this.snackBar.open('保存が完了しました', '閉じる', { duration: 2000 });
      this.router.navigate(['/admin/insurance'], {
        state: {
          year: this.data?.period?.year,
          month: this.data?.period?.month
        }
      });
    } catch (e: any) {
      console.error('保存エラー:', e);
      this.snackBar.open('保存に失敗しました: ' + (e?.message || e), '閉じる', { duration: 3000 });
    }
  }

  onBack() {
    this.router.navigate(['/admin/insurance'], {
      state: {
        year: this.data?.period?.year,
        month: this.data?.period?.month
      }
    });
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
        standardMonthlyRemuneration: this.savedInsuranceData.standardMonthlyRemuneration,
        healthInsuranceEmployee: this.savedInsuranceData.healthInsuranceEmployee,
        healthInsuranceEmployer: this.savedInsuranceData.healthInsuranceEmployer,
        nursingInsuranceEmployee: this.savedInsuranceData.nursingInsuranceEmployee,
        nursingInsuranceEmployer: this.savedInsuranceData.nursingInsuranceEmployer,
        pensionInsuranceEmployee: this.savedInsuranceData.pensionInsuranceEmployee,
        pensionInsuranceEmployer: this.savedInsuranceData.pensionInsuranceEmployer,
        childContribution: this.savedInsuranceData.childContribution,
        employeeTotalDeduction: this.savedInsuranceData.employeeTotalDeduction,
        employerTotalDeduction: this.savedInsuranceData.employerTotalDeduction,
        bonusAmount: this.savedInsuranceData.bonusAmount,
        standardBonusAmount: this.savedInsuranceData.standardBonusAmount
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
      '氏名', '社員番号', '等級', '年月', /* '標準報酬月額', */ '賞与支給額（該当月）', '標準賞与額',
      '健康保険料（個人分）', '健康保険料（会社分）', '介護保険料（個人分）', '介護保険料（会社分）',
      '厚生年金保険料（個人分）', '厚生年金保険料（会社分）', '子ども・子育て拠出金',
      '個人負担保険料合計', '会社負担保険料合計', '備考'
    ];

    const row = [
      `"${name}"`,
      `"${employeeId}"`,
      `"${this.insuranceStatus?.grade || ''}"`,
      `"${yearMonth}"`,
      // `"${this.savedInsuranceData.standardMonthlyWage || 0}"`, // ← 削除
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
    const decimal = total - Math.floor(total);
    
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

  // 介護保険控除開始月（1日生まれは前月、2日以降は誕生月）
  private getNursingInsuranceStartMonth(birthDate: string): { year: number, month: number } {
    const birth = new Date(birthDate);
    const birthDay = birth.getDate();
    let startYear = birth.getFullYear() + 40;
    let startMonth = birth.getMonth() + 1; // JSは0始まり

    // 1日生まれは前月から開始
    if (birthDay === 1) {
      startMonth -= 1;
      if (startMonth === 0) {
        startMonth = 12;
        startYear -= 1;
      }
    }
    // 2日以降は誕生月から開始（そのまま）

    console.log('DEBUG: 介護保険開始月計算:', {
      birthDate,
      birthDay,
      startYear,
      startMonth
    });

    return { year: startYear, month: startMonth };
  }

  // 介護保険終了月（1日生まれは2ヶ月前、2日以降は前月）
  private getNursingInsuranceEndMonth(birthDate: string): { year: number, month: number } {
    const birth = new Date(birthDate);
    const birthDay = birth.getDate();
    let endYear = birth.getFullYear() + 65;
    let endMonth = birth.getMonth() + 1; // JSは0始まり

    // 1日生まれは2ヶ月前まで
    if (birthDay === 1) {
      endMonth -= 2;
      if (endMonth <= 0) {
        endMonth += 12;
        endYear -= 1;
      }
    } else {
      // 2日以降は前月まで
      endMonth -= 1;
      if (endMonth === 0) {
        endMonth = 12;
        endYear -= 1;
      }
    }

    console.log('DEBUG: 介護保険終了月計算:', {
      birthDate,
      birthDay,
      endYear,
      endMonth
    });

    return { year: endYear, month: endMonth };
  }

  // 介護保険の対象判定（40歳以上65歳未満）
  private isNursingInsuranceEligible(birthDate: string, year: number, month: number): boolean {
    const { year: startYear, month: startMonth } = this.getNursingInsuranceStartMonth(birthDate);
    const { year: endYear, month: endMonth } = this.getNursingInsuranceEndMonth(birthDate);
    
    const currentYm = year * 100 + month;
    const startYm = startYear * 100 + startMonth;
    const endYm = endYear * 100 + endMonth;
    
    const isEligible = currentYm >= startYm && currentYm <= endYm;
    
    console.log('DEBUG: 介護保険判定:', {
      birthDate,
      currentYm,
      startYm,
      endYm,
      isEligible
    });
    
    return isEligible;
  }

  // 厚生年金の終了判定（70歳到達月の前月まで）
  private isPensionInsuranceEligible(birthDate: string, year: number, month: number): boolean {
    const birth = new Date(birthDate);
    const birthYear = birth.getFullYear();
    const birthMonth = birth.getMonth() + 1; // JSは0始まり
    const birthDay = birth.getDate();

    // 70歳到達月の前月まで
    const targetYear = birthYear + 70;
    const targetMonth = birthMonth;

    // 年月を比較
    if (year < targetYear) return true;
    if (year > targetYear) return false;
    
    // 同年の場合、月で比較
    if (month < targetMonth) return true;
    if (month > targetMonth) return false;
    
    // 同月の場合、日付で比較
    // 1日生まれは前月まで、2日以降は誕生月まで
    if (birthDay === 1) return false;
    return true;
  }

  private calculateInsurance() {
    if (!this.companyPrefecture) {
      console.error('会社の所在地（都道府県）が設定されていません');
      this.snackBar.open('会社の所在地（都道府県）が設定されていません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
      return;
    }
    if (!this.employeeFullInfo) {
      console.error('従業員情報が取得できていません');
      this.snackBar.open('従業員情報が取得できていません', '閉じる', { duration: 5000 });
      return;
    }

    // デバッグログを追加
    console.log('DEBUG: insuranceStatus:', this.insuranceStatus);
    console.log('DEBUG: grade type:', typeof this.insuranceStatus?.grade);
    console.log('DEBUG: grade value:', this.insuranceStatus?.grade);

    // 氏名・社員番号・所属
    this.data.fullName = `${this.employeeFullInfo.employeeBasicInfo.lastNameKanji ?? ''} ${this.employeeFullInfo.employeeBasicInfo.firstNameKanji ?? ''}`.trim();
    this.data.employeeId = this.employeeFullInfo.employeeBasicInfo.employeeId ?? '';
    this.data.department = this.employeeFullInfo.employmentInfo?.department ?? '';

    const periodYear = this.data?.period?.year;
    const periodMonth = this.data?.period?.month;
    const birthDate = this.employeeFullInfo.employeeBasicInfo.birthDate;

    let ageForInsurance = 30;
    let isNursingInsuranceEligible = false;
    let isPensionInsuranceEligible = false;

    if (birthDate && periodYear && periodMonth) {
      // 介護保険と厚生年金の判定を個別に実行
      isNursingInsuranceEligible = this.isNursingInsuranceEligible(birthDate, periodYear, periodMonth);
      isPensionInsuranceEligible = this.isPensionInsuranceEligible(birthDate, periodYear, periodMonth);
      
      // 年齢計算（介護保険判定用）
      ageForInsurance = isNursingInsuranceEligible ? 40 : this.calculateAgeAt(birthDate, periodYear, periodMonth);
      
      console.log('DEBUG: 保険料計算判定:', {
        birthDate,
        periodYear,
        periodMonth,
        isNursingInsuranceEligible,
        isPensionInsuranceEligible,
        ageForInsurance,
        eligibilityResult: this.insuranceEligibilityResult
      });
    }

    // gradeの取得と型チェックを強化
    const gradeRaw = this.insuranceStatus?.grade;
    const grade = Number(gradeRaw);
    if (!grade || isNaN(grade) || grade === 0) {
      console.warn('等級が0または未設定のため、保険料計算をスキップします');
      return;
    }

    const insuranceResult = this.insuranceCalculationService.calculateInsurance({
      prefecture: this.companyPrefecture,
      grade: Number(this.insuranceStatus?.grade) || 0,
      age: ageForInsurance,
      hasChildren: false
    });
    console.log('DEBUG: insuranceResult:', insuranceResult);
    if (insuranceResult == null) {
      console.error('保険料計算失敗時の詳細:', {
        prefecture: this.companyPrefecture,
        grade: Number(this.insuranceStatus?.grade) || 0,
        age: ageForInsurance,
        insuranceStatus: this.insuranceStatus,
        data: this.data
      });
      this.snackBar.open('保険料計算に失敗しました。都道府県・等級・標準報酬月額を確認してください。', '閉じる', { duration: 5000 });
      return;
    }

    const eligibilityResult = this.insuranceEligibilityResult;
    if (eligibilityResult && (eligibilityResult.healthInsurance || eligibilityResult.pensionInsurance)) {
      this.data.healthInsuranceEmployee = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employee : 0;
      this.data.healthInsuranceEmployer = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employer : 0;
      // 介護保険はeligibilityResultの判定結果に基づいて計算
      this.data.nursingInsuranceEmployee = (eligibilityResult.healthInsurance && eligibilityResult.nursingInsurance) ? insuranceResult.nursingInsurance.employee : 0;
      this.data.nursingInsuranceEmployer = (eligibilityResult.healthInsurance && eligibilityResult.nursingInsurance) ? insuranceResult.nursingInsurance.employer : 0;
      // 厚生年金は終了判定で加算
      this.data.pensionInsuranceEmployee = isPensionInsuranceEligible ? insuranceResult.pensionInsurance.employee : 0;
      this.data.pensionInsuranceEmployer = isPensionInsuranceEligible ? insuranceResult.pensionInsurance.employer : 0;
      this.data.childContribution = eligibilityResult.healthInsurance ? insuranceResult.childContribution : 0;
      this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsurance(
        this.data.healthInsuranceEmployee,
        this.data.nursingInsuranceEmployee,
        this.data.pensionInsuranceEmployee
      );
      this.data.employerTotalDeduction = this.calculateEmployerTotalInsurance(
        this.data.healthInsuranceEmployer,
        this.data.nursingInsuranceEmployer,
        this.data.pensionInsuranceEmployer
      );
      console.log('保険料計算結果:', {
        health: { employee: this.data.healthInsuranceEmployee, employer: this.data.healthInsuranceEmployer },
        nursing: { employee: this.data.nursingInsuranceEmployee, employer: this.data.nursingInsuranceEmployer },
        pension: { employee: this.data.pensionInsuranceEmployee, employer: this.data.pensionInsuranceEmployer },
        total: { employee: this.data.employeeTotalDeduction, employer: this.data.employerTotalDeduction },
        eligibilityResult: this.insuranceEligibilityResult
      });
    } else {
      this.data.healthInsuranceEmployee = 0;
      this.data.healthInsuranceEmployer = 0;
      this.data.nursingInsuranceEmployee = 0;
      this.data.nursingInsuranceEmployer = 0;
      this.data.pensionInsuranceEmployee = 0;
      this.data.pensionInsuranceEmployer = 0;
      this.data.childContribution = 0;
      this.data.employeeTotalDeduction = 0;
      this.data.employerTotalDeduction = 0;
    }
  }

  get isExemptedByFourteenDayRule(): boolean {
    if (!this.specialAttributes || !this.data?.period || !this.insuranceEligibilityResult) return false;
    const ym = `${this.data.period.year}-${String(this.data.period.month).padStart(2, '0')}`;
    return (
      (this.specialAttributes.leaveType === '育児休業' || this.specialAttributes.leaveType === '産前産後休業') &&
      Array.isArray(this.insuranceEligibilityResult.insuranceExemptionFourteenDayRuleMonths) &&
      this.insuranceEligibilityResult.insuranceExemptionFourteenDayRuleMonths.includes(ym)
    );
  }

  // eligibilityResultを最新化し、計算に反映する
  private updateEligibilityResultAndRecalculate() {
    if (!this.employeeFullInfo) return;
    const periodYear = this.data?.period?.year || new Date().getFullYear();
    const periodMonth = this.data?.period?.month || (new Date().getMonth() + 1);
    this.insuranceEligibilityService.getInsuranceEligibility(
      this.employeeFullInfo,
      periodYear,
      periodMonth
    ).subscribe(result => {
      this.insuranceEligibilityResult = result;
      this.data.eligibilityResult = result; // 最新を保持
      this.calculateInsurance(); // 判定結果を使って再計算
    });
  }
} 