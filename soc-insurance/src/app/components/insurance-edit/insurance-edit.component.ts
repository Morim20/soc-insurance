import { Component, Input, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
  styleUrls: ['./insurance-edit.component.scss'],
  changeDetection: ChangeDetectionStrategy.Default
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
    private insuranceCalculationService: InsuranceCalculationService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      month: [''],
      baseSalary: [0, Validators.required],
      allowances: [0, Validators.required],
      commutingAllowance: [0, [Validators.required, Validators.min(0)]],
      oneWayFare: [0, [Validators.required, Validators.min(0)]],
      bonusAmount: [{ value: 0, disabled: true }],
      standardBonusAmount: [0],
      standardMonthlyRemuneration: [0],
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

    // フォームの標準報酬月額を即座に更新
    this.form.get('standardMonthlyRemuneration')?.setValue(total, { emitEvent: false });

    this.data = {
      ...this.data,
      standardMonthlyRemuneration: total,
      standardMonthlyWage: this.standardMonthlyWage
    };

    this.calculateInsurance();
    
    // 画面更新を強制実行
    this.cdr.detectChanges();
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
      
      // employeeFullInfoを最初に取得
      this.employeeFullInfo = await this.employeeService.getEmployee(this.employeeId);
      if (!this.employeeFullInfo) {
        this.snackBar.open('従業員情報が取得できませんでした', '閉じる', { duration: 5000 });
        return;
      }

      // 保険判定サービスを最初に呼び出して育休中の判定を取得
      const officeEmployeeCount = await this.getOfficeEmployeeCount();
      this.insuranceEligibilityService.getInsuranceEligibility(
        this.employeeFullInfo,
        this.data?.period?.year || new Date().getFullYear(),
        this.data?.period?.month || (new Date().getMonth() + 1),
        officeEmployeeCount
      ).subscribe(eligibilityResult => {
        this.insuranceEligibilityResult = eligibilityResult;
        if (this.data) {
          this.data.eligibilityResult = eligibilityResult;
          // isActuallyNursingInsuranceEligible を使って判定
          this.data.isNursingInsuranceEligible = this.isActuallyNursingInsuranceEligible(eligibilityResult);
        }
        
        // 保険判定結果を取得後にFirestoreから保険料データを取得
        this.loadInsuranceDataFromFirestore();
        
        // 画面更新を強制実行
        this.cdr.detectChanges();
      });

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
        }
      }

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
        // isNursingInsuranceEligibleはeligibilityResultから設定するのでここでは何もしない
      }

      // フォーム初期値セット
      this.form.patchValue({
        baseSalary: Number(this.data?.baseSalary ?? this.employmentInfo?.baseSalary ?? 0),
        allowances: Number(this.data?.allowances ?? this.employmentInfo?.allowances ?? 0),
        commutingAllowance: Number(this.data?.commutingAllowance ?? this.employmentInfo?.commutingAllowance ?? 0),
        bonusAmount: Number(this.data?.bonusAmount ?? 0),
        standardBonusAmount: Number(this.data?.standardBonusAmount ?? 0),
        standardMonthlyRemuneration: Number(this.data?.standardMonthlyRemuneration ?? 0),
        variableWage: Number(this.data?.variableWage ?? 0),
        notes: this.data?.notes ?? ''
      }, { emitEvent: false });

      // 初期表示時に報酬月額を計算
      this.calculateStandardMonthlyRemuneration();

      // 休暇情報を即時反映
      if (this.specialAttributes?.leaveType) {
        const leaveType = this.specialAttributes.leaveType;
        const startDate = this.specialAttributes.leaveStartDate ? new Date(this.specialAttributes.leaveStartDate) : null;
        const endDate = this.specialAttributes.leaveEndDate ? new Date(this.specialAttributes.leaveEndDate) : null;
        
        const periodYear = this.data?.period?.year;
        const periodMonth = this.data?.period?.month;
        let isOnLeaveThisMonth = false;

        if (startDate && periodYear && periodMonth) {
            const monthStart = new Date(periodYear, periodMonth - 1, 1);
            const monthEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
            isOnLeaveThisMonth = startDate <= monthEnd && (!endDate || endDate >= monthStart);
        }

        let noteText = this.data?.notes ?? '';
        if (isOnLeaveThisMonth) {
          const formatDate = (date: Date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
          let periodText = '';
          if (startDate) {
            periodText = `（${formatDate(startDate)}`;
            if (endDate) {
              periodText += `〜${formatDate(endDate)}`;
            }
            periodText += '）';
          }

          if (leaveType === '介護休業') {
            noteText = `介護休暇中${periodText}`;
          } else if (leaveType === '育児休業' || leaveType === '産前産後休業') {
            noteText = `${leaveType}中${periodText}`;
          }
        } else {
          if (noteText.includes('休業中') || noteText.includes('休暇中')) {
            noteText = '';
          }
        }
        this.form.patchValue({ notes: noteText });
      }
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
          // 年度（4月～翌3月）内かどうかを判定
          const period = data['period'];
          if (!period) return false;
          const targetYear = year;
          // 4月～12月はその年、1月～3月は翌年の年度扱い
          let bonusFiscalYear = period.year;
          if (period.month >= 1 && period.month <= 3) {
            bonusFiscalYear = period.year - 1;
          }
          // 今回の賞与は除外
          const isSamePeriod = (period.year === this.data.period.year && period.month === this.data.period.month);
          return (bonusFiscalYear === targetYear && !isSamePeriod);
        })
        .map(doc => doc.data()['bonusAmount'] || 0)
        .reduce((sum, val) => sum + val, 0);
      this.data.annualBonusTotal = annualBonusTotal;
    }

    // 等級があれば標準報酬月額をセット
    if (this.insuranceStatus?.grade && this.aichiGrades[String(this.insuranceStatus.grade)]) {
      this.standardMonthlyWage = this.aichiGrades[String(this.insuranceStatus.grade)].standardMonthlyWage;
    }

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
          isNursingInsuranceEligible = this.insuranceEligibilityService.isNursingInsuranceEligibleAt(birthDate, periodYear, periodMonth);
          isPensionInsuranceEligible = this.insuranceEligibilityService.isPensionInsuranceEligibleAt(birthDate, periodYear, periodMonth);
          
          // デバッグログを追加
          console.log('賞与保険料計算時の厚生年金判定:', {
            birthDate,
            periodYear,
            periodMonth,
            isPensionInsuranceEligible,
            calculatedAge: this.calculateAgeAt(birthDate, periodYear, periodMonth)
          });
        } else {
          // 生年月日未設定の場合は厚生年金保険料を計算する（年齢による除外判定なし）
          isPensionInsuranceEligible = true;
          console.log('賞与保険料計算時: 生年月日未設定のため厚生年金保険料を計算します');
        }

        // calculateBonusInsuranceの呼び出し前のデバッグログ
        console.log('calculateBonusInsurance呼び出しパラメータ:', {
          bonusAmount: val,
          prefecture: companySettings.prefecture,
          age: isNursingInsuranceEligible ? 40 : this.data?.age,
          year: '2025',
          bonusCount,
          isMaternityLeave: false,
          annualBonusTotal: this.data?.annualBonusTotal || 0
        });

        this.bonusInsuranceResult = this.insuranceCalculationService.calculateBonusInsurance({
          bonusAmount: val,
          prefecture: companySettings.prefecture,
          age: isNursingInsuranceEligible ? 40 : this.data?.age,
          year: '2025',
          bonusCount,
          isMaternityLeave: false,
          annualBonusTotal: this.data?.annualBonusTotal || 0
        });

        // 賞与保険料計算結果の詳細ログ
        console.log('賞与保険料計算結果詳細:', {
          bonusAmount: val,
          standardBonusAmount: this.bonusInsuranceResult?.standardBonusAmount,
          healthInsuranceEmployee: this.bonusInsuranceResult?.healthInsuranceEmployee,
          healthInsuranceEmployer: this.bonusInsuranceResult?.healthInsuranceEmployer,
          nursingInsuranceEmployee: this.bonusInsuranceResult?.nursingInsuranceEmployee,
          nursingInsuranceEmployer: this.bonusInsuranceResult?.nursingInsuranceEmployer,
          pensionInsuranceEmployee: this.bonusInsuranceResult?.pensionInsuranceEmployee,
          pensionInsuranceEmployer: this.bonusInsuranceResult?.pensionInsuranceEmployer,
          childContribution: this.bonusInsuranceResult?.childContribution,
          isPensionInsuranceEligible,
          eligibilityResultPensionInsurance: this.insuranceEligibilityResult?.pensionInsurance
        });

        // 賞与の保険料計算結果をeligibilityResultに基づいて調整
        if (this.bonusInsuranceResult && this.insuranceEligibilityResult) {
          const eligibilityResult = this.insuranceEligibilityResult;
          
          // デバッグログを追加
          console.log('賞与保険料計算時の状態:', {
            bonusAmount: val,
            isBonusExempted: this.isBonusExempted,
            insuranceEligibilityResult: this.insuranceEligibilityResult,
            insuranceExemptionBonusMonths: this.insuranceEligibilityResult.insuranceExemptionBonusMonths,
            currentPeriod: `${this.data?.period?.year}-${String(this.data?.period?.month).padStart(2, '0')}`,
            bonusInsuranceResult: this.bonusInsuranceResult
          });
          
          // 賞与免除月の場合は全て0円にする
          if (this.isBonusExempted) {
            console.log('賞与免除月のため、保険料を0円に設定');
            this.bonusInsuranceResult = {
              healthInsuranceEmployee: 0,
              healthInsuranceEmployer: 0,
              nursingInsuranceEmployee: 0,
              nursingInsuranceEmployer: 0,
              pensionInsuranceEmployee: 0,
              pensionInsuranceEmployer: 0,
              childContribution: 0,
              healthInsuranceEmployeeRaw: 0,
              healthInsuranceEmployerRaw: 0,
              nursingInsuranceEmployeeRaw: 0,
              nursingInsuranceEmployerRaw: 0,
              pensionInsuranceEmployeeRaw: 0,
              pensionInsuranceEmployerRaw: 0,
              childContributionRaw: 0
            };
          } else {
            console.log('賞与免除対象外のため、通常の保険料計算を適用');
            // 賞与免除対象外の場合は通常の判定を行う
            // 健康保険
            if (!eligibilityResult.healthInsurance) {
              this.bonusInsuranceResult.healthInsuranceEmployee = 0;
              this.bonusInsuranceResult.healthInsuranceEmployer = 0;
              this.bonusInsuranceResult.healthInsuranceEmployeeRaw = 0;
              this.bonusInsuranceResult.healthInsuranceEmployerRaw = 0;
            }
            
            // 介護保険
            if (!eligibilityResult.nursingInsurance) {
              this.bonusInsuranceResult.nursingInsuranceEmployee = 0;
              this.bonusInsuranceResult.nursingInsuranceEmployer = 0;
              this.bonusInsuranceResult.nursingInsuranceEmployeeRaw = 0;
              this.bonusInsuranceResult.nursingInsuranceEmployerRaw = 0;
            }
            
            // 厚生年金
            if (!isPensionInsuranceEligible) {
              console.log('厚生年金除外判定: 除外対象のため0円に設定');
              this.bonusInsuranceResult.pensionInsuranceEmployee = 0;
              this.bonusInsuranceResult.pensionInsuranceEmployer = 0;
              this.bonusInsuranceResult.pensionInsuranceEmployeeRaw = 0;
              this.bonusInsuranceResult.pensionInsuranceEmployerRaw = 0;
            }
            
            // 子ども・子育て拠出金
            if (!eligibilityResult.healthInsurance) {
              this.bonusInsuranceResult.childContribution = 0;
              this.bonusInsuranceResult.childContributionRaw = 0;
            }
          }
        } else {
          console.log('賞与保険料計算時の問題:', {
            bonusInsuranceResult: this.bonusInsuranceResult,
            insuranceEligibilityResult: this.insuranceEligibilityResult,
            bonusAmount: val
          });
        }

        const stdBonus = Math.floor((val || 0) / 1000) * 1000;
        this.form.get('standardBonusAmount')?.setValue(stdBonus, { emitEvent: false });
        
        // 画面更新を強制実行
        this.cdr.detectChanges();
      } else {
        this.bonusInsuranceResult = null;
        this.form.get('standardBonusAmount')?.setValue(0, { emitEvent: false });
        
        // 画面更新を強制実行
        this.cdr.detectChanges();
      }
    });

    // isBonusMonthの状態に応じてbonusAmountコントロールを制御
    this.toggleBonusAmountControl();

    // 等級変更時に標準報酬月額を自動反映
    this.form.valueChanges.subscribe(() => {
      if (this.insuranceStatus?.grade && this.aichiGrades[String(this.insuranceStatus.grade)]) {
        this.standardMonthlyWage = this.aichiGrades[String(this.insuranceStatus.grade)].standardMonthlyWage;
      } else {
        this.standardMonthlyWage = null;
      }
      this.calculateStandardMonthlyRemuneration();
    });
  }

  // Firestoreから保険料データを取得するメソッドを分離
  private async loadInsuranceDataFromFirestore() {
    if (!this.employeeFullInfo || !this.insuranceEligibilityResult) return;

    const eligibilityResult = this.insuranceEligibilityResult;

    if (eligibilityResult.healthInsurance || eligibilityResult.pensionInsurance) {
      // 保険料計算を実行
      if (!this.companyPrefecture) {
        this.snackBar.open('会社の所在地（都道府県）が設定されていません。会社設定画面で確認してください。', '閉じる', { duration: 5000 });
        return;
      }
      
      const periodYear = this.data?.period?.year;
      const periodMonth = this.data?.period?.month;
      const birthDate = this.employeeFullInfo.employeeBasicInfo.birthDate;
      
      let ageForInsurance = 30; // デフォルト
      if (birthDate && periodYear && periodMonth) {
        // 介護保険料計算のために、対象なら年齢を40に、対象外なら実年齢を使う
        ageForInsurance = eligibilityResult.nursingInsurance ? 40 : this.calculateAgeAt(birthDate, periodYear, periodMonth);
      }

      const insuranceResult = this.insuranceCalculationService.calculateInsurance({
        prefecture: this.companyPrefecture,
        grade: Number(this.insuranceStatus?.grade) || 0,
        age: ageForInsurance,
        hasChildren: false
      });
      
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

      // eligibilityResultに基づいて保険料をデータにセット
      this.data.healthInsuranceEmployee = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employee : 0;
      this.data.healthInsuranceEmployer = eligibilityResult.healthInsurance ? insuranceResult.healthInsurance.employer : 0;
      this.data.nursingInsuranceEmployee = eligibilityResult.nursingInsurance ? insuranceResult.nursingInsurance.employee : 0;
      this.data.nursingInsuranceEmployer = eligibilityResult.nursingInsurance ? insuranceResult.nursingInsurance.employer : 0;
      this.data.pensionInsuranceEmployee = eligibilityResult.pensionInsurance ? insuranceResult.pensionInsurance.employee : 0;
      this.data.pensionInsuranceEmployer = eligibilityResult.pensionInsurance ? insuranceResult.pensionInsurance.employer : 0;
      this.data.childContribution = eligibilityResult.healthInsurance ? insuranceResult.childContribution : 0;
      
      // 介護保険がある場合の従業員負担分の合計計算
      if (eligibilityResult.nursingInsurance) {
        // 介護保険がある場合はnursingInsuranceEmployeeRealを使用
        this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsuranceWithNursingReal(
          this.data.healthInsuranceEmployee,
          insuranceResult.nursingInsuranceEmployeeReal,
          this.data.pensionInsuranceEmployee
        );
      } else {
        // 介護保険がない場合は従来の計算方法
        this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsurance(
          this.data.healthInsuranceEmployee,
          this.data.nursingInsuranceEmployee,
          this.data.pensionInsuranceEmployee
        );
      }
      
      this.data.employerTotalDeduction = this.calculateEmployerTotalInsurance(
        this.data.healthInsuranceEmployer,
        this.data.nursingInsuranceEmployer,
        this.data.pensionInsuranceEmployer
      );
    } else {
      // どの保険の対象でもない場合
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
    
    // 画面更新を強制実行
    this.cdr.detectChanges();
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
    
    // デバッグログを追加
    console.log('canSave判定:', {
      healthGrade,
      pensionGrade,
      hasHealth,
      hasPension,
      insuranceStatus: this.insuranceStatus
    });
    
    // 両方の等級が設定されている場合のみ組み合わせチェックを行う
    if (hasHealth && hasPension) {
      const combinationValid = this.checkGradeCombination(Number(healthGrade), Number(pensionGrade));
      console.log('等級組み合わせチェック:', {
        healthGrade: Number(healthGrade),
        pensionGrade: Number(pensionGrade),
        combinationValid
      });
      return combinationValid;
    }
    
    const result = hasHealth && hasPension;
    console.log('canSave結果:', result);
    return result;
  }

  // 健康保険と厚生年金の等級の組み合わせをチェックする関数
  public checkGradeCombination(healthGrade: number | string, pensionGrade: number | string): boolean {
    const hGrade = Number(healthGrade);
    const pGrade = Number(pensionGrade);
    
    // 健康保険等級1～4の時は厚生年金等級1
    if (hGrade >= 1 && hGrade <= 4) {
      const result = pGrade === 1;
      console.log('健康保険等級1～4の場合:', { hGrade, pGrade, result });
      return result;
    }
    
    // 健康保険等級35～50の時は厚生年金等級32
    if (hGrade >= 35 && hGrade <= 50) {
      const result = pGrade === 32;
      console.log('健康保険等級35～50の場合:', { hGrade, pGrade, result });
      return result;
    }
    
    // 許可されるペアリスト（健康保険等級5～34の場合）
    const validPairs: [number, number][] = [
      [5, 2], [6, 3], [7, 4], [8, 5], [9, 6], [10, 7], [11, 8], [12, 9], [13, 10],
      [14, 11], [15, 12], [16, 13], [17, 14], [18, 15], [19, 16], [20, 17], [21, 18], [22, 19], [23, 20],
      [24, 21], [25, 22], [26, 23], [27, 24], [28, 25], [29, 26], [30, 27], [31, 28], [32, 29], [33, 30],
      [34, 31]
    ];
    const isValid = validPairs.some(([h, p]) => h === hGrade && p === pGrade);
    console.log('checkGradeCombination（厳密ペア）:', { hGrade, pGrade, isValid });
    return isValid;
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
    let ageForInsurance = 30;
    if (this.basicInfo?.birthDate && this.data?.period?.year && this.data?.period?.month) {
      age = this.calculateAgeAt(this.basicInfo.birthDate, this.data.period.year, this.data.period.month);
      // 介護保険が加入なら40歳固定、未加入なら実年齢
      ageForInsurance = this.insuranceEligibilityResult?.nursingInsurance ? 40 : age;
    }

    // 保険料を計算
    let result = this.insuranceCalculationService.calculateInsurance({
      prefecture: this.companyPrefecture,
      grade: Number(this.insuranceStatus?.grade) || 0,
      age: ageForInsurance,
      hasChildren: false
    });

    // 育休・産休・介護休暇中なら備考自動セット
    let noteText = this.form.value.notes || '';
    if (this.specialAttributes?.leaveType) {
      const leaveType = this.specialAttributes.leaveType;
      const startDate = this.specialAttributes.leaveStartDate ? new Date(this.specialAttributes.leaveStartDate) : null;
      const endDate = this.specialAttributes.leaveEndDate ? new Date(this.specialAttributes.leaveEndDate) : null;
      
      const periodYear = this.data?.period?.year;
      const periodMonth = this.data?.period?.month;
      let isOnLeaveThisMonth = false;

      if (startDate && periodYear && periodMonth) {
          const monthStart = new Date(periodYear, periodMonth - 1, 1);
          const monthEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
          isOnLeaveThisMonth = startDate <= monthEnd && (!endDate || endDate >= monthStart);
      }

      if (isOnLeaveThisMonth) {
        const formatDate = (date: Date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
        let periodText = '';
        if (startDate) {
          periodText = `（${formatDate(startDate)}`;
          if (endDate) {
            periodText += `〜${formatDate(endDate)}`;
          }
          periodText += '）';
        }

        if (leaveType === '介護休業') {
          noteText = `介護休暇中${periodText}`;
        } else if (leaveType === '育児休業' || leaveType === '産前産後休業') {
          noteText = `${leaveType}中${periodText}`;
        }
      } else {
        if (noteText.includes('休業中') || noteText.includes('休暇中')) {
          noteText = '';
        }
      }
    }
    // 備考欄にも即時反映
    this.form.patchValue({ notes: noteText });

    // 14日ルールで免除される場合の月額保険料を0に
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
        // 賞与の社会保険料は既存データを優先し、新規計算時のみbonusInsuranceResultを使用
        bonusHealthInsuranceEmployee: this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.healthInsuranceEmployeeRaw ?? this.data?.bonusHealthInsuranceEmployee ?? 0),
        bonusHealthInsuranceEmployer: this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.healthInsuranceEmployerRaw ?? this.data?.bonusHealthInsuranceEmployer ?? 0),
        bonusNursingInsuranceEmployee: this.isBonusExempted ? 0 : (this.insuranceEligibilityResult?.nursingInsurance ? (this.bonusInsuranceResult?.nursingInsuranceEmployeeRaw ?? this.data?.bonusNursingInsuranceEmployee ?? 0) : 0),
        bonusNursingInsuranceEmployer: this.isBonusExempted ? 0 : (this.insuranceEligibilityResult?.nursingInsurance ? (this.bonusInsuranceResult?.nursingInsuranceEmployerRaw ?? this.data?.bonusNursingInsuranceEmployer ?? 0) : 0),
        bonusPensionInsuranceEmployee: this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.pensionInsuranceEmployeeRaw ?? this.data?.bonusPensionInsuranceEmployee ?? 0),
        bonusPensionInsuranceEmployer: this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.pensionInsuranceEmployerRaw ?? this.data?.bonusPensionInsuranceEmployer ?? 0),
        bonusChildContribution: this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.childContributionRaw ?? this.data?.bonusChildContribution ?? 0),
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
        isNursingInsuranceEligible: this.insuranceEligibilityResult?.nursingInsurance
      };
    } else {
      if (!result) {
        console.error('保険料計算結果がnullのため保存できません。');
        this.snackBar.open('エラー: 保険料計算に失敗しました。設定を確認してください。', '閉じる', { duration: 5000 });
        return;
      }
      saveValue = {
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
        // 賞与の社会保険料は既存データを優先し、新規計算時のみbonusInsuranceResultを使用
        bonusHealthInsuranceEmployee: Number(this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.healthInsuranceEmployeeRaw ?? this.data?.bonusHealthInsuranceEmployee ?? 0)),
        bonusHealthInsuranceEmployer: Number(this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.healthInsuranceEmployerRaw ?? this.data?.bonusHealthInsuranceEmployer ?? 0)),
        bonusNursingInsuranceEmployee: Number(this.isBonusExempted ? 0 : (this.insuranceEligibilityResult?.nursingInsurance ? (this.bonusInsuranceResult?.nursingInsuranceEmployeeRaw ?? this.data?.bonusNursingInsuranceEmployee ?? 0) : 0)),
        bonusNursingInsuranceEmployer: Number(this.isBonusExempted ? 0 : (this.insuranceEligibilityResult?.nursingInsurance ? (this.bonusInsuranceResult?.nursingInsuranceEmployerRaw ?? this.data?.bonusNursingInsuranceEmployer ?? 0) : 0)),
        bonusPensionInsuranceEmployee: Number(this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.pensionInsuranceEmployeeRaw ?? this.data?.bonusPensionInsuranceEmployee ?? 0)),
        bonusPensionInsuranceEmployer: Number(this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.pensionInsuranceEmployerRaw ?? this.data?.bonusPensionInsuranceEmployer ?? 0)),
        bonusChildContribution: Number(this.isBonusExempted ? 0 : (this.bonusInsuranceResult?.childContributionRaw ?? this.data?.bonusChildContribution ?? 0)),
        healthInsuranceEmployee: Number(this.insuranceEligibilityResult?.healthInsurance ? (result.healthInsurance.employee ?? 0) : 0),
        healthInsuranceEmployer: Number(this.insuranceEligibilityResult?.healthInsurance ? (result.healthInsurance.employer ?? 0) : 0),
        nursingInsuranceEmployee: Number(this.insuranceEligibilityResult?.nursingInsurance ? (result.nursingInsurance.employee ?? 0) : 0),
        nursingInsuranceEmployer: Number(this.insuranceEligibilityResult?.nursingInsurance ? (result.nursingInsurance.employer ?? 0) : 0),
        pensionInsuranceEmployee: Number(this.insuranceEligibilityResult?.pensionInsurance ? (result.pensionInsurance.employee ?? 0) : 0),
        pensionInsuranceEmployer: Number(this.insuranceEligibilityResult?.pensionInsurance ? (result.pensionInsurance.employer ?? 0) : 0),
        childContribution: Number(this.insuranceEligibilityResult?.healthInsurance ? (result.childContribution ?? 0) : 0),
        notes: noteText,
        employeeTotalDeduction: Number(this.insuranceEligibilityResult?.healthInsurance ? (this.data.employeeTotalDeduction ?? 0) : 0),
        employerTotalDeduction: Number(this.insuranceEligibilityResult?.healthInsurance ? (this.data.employerTotalDeduction ?? 0) : 0)
      };
    }

    if (!saveValue) {
      this.snackBar.open('保険料計算に失敗しました', '閉じる', { duration: 3000 });
      return;
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

  // 介護保険がある場合の従業員負担分の合計を計算する関数（nursingInsuranceEmployeeReal使用）
  calculateEmployeeTotalInsuranceWithNursingReal(employee: number, nursingReal: number, pension: number): number {
    const total = employee + nursingReal + pension;
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



    return { year: endYear, month: endMonth };
  }

  // 介護保険の共通判定メソッドを画面用にラップ
  isActuallyNursingInsuranceEligible(eligibility: any): boolean {
    return this.insuranceEligibilityService.isActuallyNursingInsuranceEligible(eligibility);
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

    // デバッグログを追加
    console.log('isPensionInsuranceEligible判定詳細:', {
      birthDate,
      birthYear,
      birthMonth,
      birthDay,
      targetYear,
      targetMonth,
      currentYear: year,
      currentMonth: month,
      isBeforeTarget: year < targetYear,
      isSameYear: year === targetYear,
      isBeforeTargetMonth: month < targetMonth,
      isSameMonth: month === targetMonth,
      isFirstDay: birthDay === 1
    });

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

    // 氏名・社員番号・所属
    this.data.fullName = `${this.employeeFullInfo.employeeBasicInfo.lastNameKanji ?? ''} ${this.employeeFullInfo.employeeBasicInfo.firstNameKanji ?? ''}`.trim();
    this.data.employeeId = this.employeeFullInfo.employeeBasicInfo.employeeId ?? '';
    this.data.department = this.employeeFullInfo.employmentInfo?.department ?? '';

    const periodYear = this.data?.period?.year;
    const periodMonth = this.data?.period?.month;
    const birthDate = this.employeeFullInfo.employeeBasicInfo.birthDate;

    let ageForInsurance = 30;
    if (birthDate && periodYear && periodMonth) {
      // eligibilityResultの判定を使う
      if (this.insuranceEligibilityResult) {
        ageForInsurance = this.insuranceEligibilityResult.nursingInsurance ? 40 : this.calculateAgeAt(birthDate, periodYear, periodMonth);
      } else {
        ageForInsurance = this.calculateAgeAt(birthDate, periodYear, periodMonth);
      }
      
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
      this.data.nursingInsuranceEmployee = eligibilityResult.nursingInsurance ? insuranceResult.nursingInsurance.employee : 0;
      this.data.nursingInsuranceEmployer = eligibilityResult.nursingInsurance ? insuranceResult.nursingInsurance.employer : 0;
      // 厚生年金は終了判定で加算
      this.data.pensionInsuranceEmployee = eligibilityResult.pensionInsurance ? insuranceResult.pensionInsurance.employee : 0;
      this.data.pensionInsuranceEmployer = eligibilityResult.pensionInsurance ? insuranceResult.pensionInsurance.employer : 0;
      this.data.childContribution = eligibilityResult.healthInsurance ? insuranceResult.childContribution : 0;
      
      // 介護保険がある場合の従業員負担分の合計計算
      if (eligibilityResult.nursingInsurance) {
        // 介護保険がある場合はnursingInsuranceEmployeeRealを使用
        this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsuranceWithNursingReal(
          this.data.healthInsuranceEmployee,
          insuranceResult.nursingInsuranceEmployeeReal,
          this.data.pensionInsuranceEmployee
        );
      } else {
        // 介護保険がない場合は従来の計算方法
        this.data.employeeTotalDeduction = this.calculateEmployeeTotalInsurance(
          this.data.healthInsuranceEmployee,
          this.data.nursingInsuranceEmployee,
          this.data.pensionInsuranceEmployee
        );
      }
      
      this.data.employerTotalDeduction = this.calculateEmployerTotalInsurance(
        this.data.healthInsuranceEmployer,
        this.data.nursingInsuranceEmployer,
        this.data.pensionInsuranceEmployer
      );
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
    
    // 画面更新を強制実行
    this.cdr.detectChanges();
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
  private async updateEligibilityResultAndRecalculate() {
    if (!this.employeeFullInfo) return;
    const periodYear = this.data?.period?.year || new Date().getFullYear();
    const periodMonth = this.data?.period?.month || (new Date().getMonth() + 1);
    const officeEmployeeCount2 = await this.getOfficeEmployeeCount();
    this.insuranceEligibilityService.getInsuranceEligibility(
      this.employeeFullInfo,
      periodYear,
      periodMonth,
      officeEmployeeCount2
    ).subscribe(result => {
      this.insuranceEligibilityResult = result;
      this.data.eligibilityResult = result; // 最新を保持

      // 休暇情報を即時反映
      if (this.specialAttributes?.leaveType) {
        const leaveType = this.specialAttributes.leaveType;
        const startDate = this.specialAttributes.leaveStartDate ? new Date(this.specialAttributes.leaveStartDate) : null;
        const endDate = this.specialAttributes.leaveEndDate ? new Date(this.specialAttributes.leaveEndDate) : null;
        
        // 表示月が休業期間に含まれるか判定
        const periodYear = this.data?.period?.year;
        const periodMonth = this.data?.period?.month;
        let isOnLeaveThisMonth = false;

        if (startDate && periodYear && periodMonth) {
            const monthStart = new Date(periodYear, periodMonth - 1, 1);
            const monthEnd = new Date(periodYear, periodMonth, 0, 23, 59, 59, 999);
            isOnLeaveThisMonth = startDate <= monthEnd && (!endDate || endDate >= monthStart);
        }

        let leaveNote = '';
        if (isOnLeaveThisMonth) {
          const formatDate = (date: Date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
          let periodText = '';
          if (startDate) {
            periodText = `（${formatDate(startDate)}`;
            if (endDate) {
              periodText += `〜${formatDate(endDate)}`;
            }
            periodText += '）';
          }

          if (leaveType === '介護休業') {
            leaveNote = `介護休暇中${periodText}`;
          } else if (leaveType === '育児休業' || leaveType === '産前産後休業') {
            leaveNote = `${leaveType}中${periodText}`;
          }
        }
        
        // 自動生成された休業ノートがある場合、それで上書き。なければ元のノートを維持。
        if(leaveNote){
          this.form.patchValue({ notes: leaveNote });
        } else if (this.form.value.notes.includes('休業中') || this.form.value.notes.includes('休暇中')) {
          // 休業期間外なのに休業ノートが残っている場合はクリア
          this.form.patchValue({ notes: '' });
        }
      }

      this.calculateInsurance(); // 判定結果を使って再計算
      
      // 画面更新を強制実行
      this.cdr.detectChanges();
    });
  }

  async getOfficeEmployeeCount(): Promise<number> {
    const officeDoc = await getDoc(doc(this.firestore, 'settings', 'office'));
    if (officeDoc.exists()) {
      return officeDoc.data()['actualEmployeeCount'] || 0;
    }
    return 0;
  }

  get isBonusExempted(): boolean {
    if (!this.insuranceEligibilityResult || !this.data?.period) {
      console.log('isBonusExempted判定: 必要なデータが不足', {
        insuranceEligibilityResult: this.insuranceEligibilityResult,
        period: this.data?.period
      });
      return false;
    }
    const ym = `${this.data.period.year}-${String(this.data.period.month).padStart(2, '0')}`;
    const result = Array.isArray(this.insuranceEligibilityResult.insuranceExemptionBonusMonths)
      && this.insuranceEligibilityResult.insuranceExemptionBonusMonths.includes(ym);
    
    console.log('isBonusExempted判定詳細:', {
      currentPeriod: ym,
      insuranceExemptionBonusMonths: this.insuranceEligibilityResult.insuranceExemptionBonusMonths,
      isArray: Array.isArray(this.insuranceEligibilityResult.insuranceExemptionBonusMonths),
      includes: this.insuranceEligibilityResult.insuranceExemptionBonusMonths?.includes(ym),
      result: result
    });
    
    return result;
  }

  // HTMLテンプレート用のヘルパーメソッド
  public toNumber(value: any): number {
    return Number(value);
  }
} 