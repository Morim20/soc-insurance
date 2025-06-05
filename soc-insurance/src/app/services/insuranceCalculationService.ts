import { Injectable } from '@angular/core';
import { PrefectureInsuranceRatesService } from './prefectureInsuranceRatesService';
import { DetailedInsuranceRatesService } from './detailedInsuranceRatesService';
import gradeMaster from './grade_master_with_ranges.json';
import * as pensionRatesMaster from './pension_insurance_master.json';
import bonusInsuranceRates from './bonus_insurance_rates.json';

// 都道府県別の保険料データをインポート
import * as hokkaidoRates from './01hokkaido_detailed_insurance_rates_grade1to50_final.json';
import * as aomoriRates from './02aomori_insurance_rates.json';
import * as iwateRates from './03iwate_insurance_rates.json';
import * as miyagiRates from './04miyagi_health_insurance_standardized.json';
import * as akitaRates from './05akita_insurance_rates.json';
import * as yamagataRates from './06yamagata_insurance_rates.json';
import * as fukushimaRates from './07fukushima_insurance_rates.json';
import * as ibarakiRates from './08ibaraki_insurance_rates.json';
import * as tochigiRates from './09tochigi_insurance_rates.json';
import * as gunmaRates from './10gunma_insurance_rates.json';
import * as saitamaRates from './11saitama_insurance_rates.json';
import * as chibaRates from './12chiba_insurance_rates.json';
import * as tokyoRates from './13tokyo_insurance_rates.json';
import * as kanagawaRates from './14kanagawa_insurance_rates.json';
import * as niigataRates from './15niigata_insurance_rates.json';
import * as toyamaRates from './16toyama_insurance_rates.json';
import * as ishikawaRates from './17ishikawa_insurance_rates.json';
import * as fukuiRates from './18fukui_insurance_rates.json';
import * as yamanashiRates from './19yamanashi_insurance_grades.json';
import * as naganoRates from './20nagano_insurance_grades.json';
import * as gifuRates from './21gifu_insurance_grades.json';
import * as shizuokaRates from './22shizuoka_insurance_grades.json';
import * as aichiRates from './23aichi_insurance_grades.json';
import * as mieRates from './24mie_insurance_grades.json';
import * as shigaRates from './25shiga_insurance_grades.json';
import * as kyotoRates from './26kyoto_insurance_grades.json';
import * as osakaRates from './27osaka_insurance_grades.json';
import * as hyogoRates from './28hyogo_insurance_grades.json';
import * as naraRates from './29nara_insurance_grades.json';
import * as wakayamaRates from './30wakayama_insurance_grades.json';
import * as tottoriRates from './31tottori_insurance_grades.json';
import * as shimaneRates from './32shimane_insurance_grades.json';
import * as okayamaRates from './33okayama_insurance_grades.json';
import * as hiroshimaRates from './34hiroshima_insurance_grades.json';
import * as yamaguchiRates from './35yamaguchi_insurance_grades.json';
import * as tokushimaRates from './36tokushima_insurance_grades.json';
import * as kagawaRates from './37kagawa_insurance_grades.json';
import * as ehimeRates from './38ehime_insurance_grades.json';
import * as kochiRates from './39kochi_insurance_grades.json';
import * as fukuokaRates from './40fukuoka_insurance_grades.json';
import * as sagaRates from './41saga_insurance_grades.json';
import * as nagasakiRates from './42nagasaki_insurance_grades.json';
import * as kumamotoRates from './43kumamoto_insurance_grades.json';
import * as oitaRates from './44oita_insurance_grades.json';
import * as miyazakiRates from './45miyazaki_insurance_grades.json';
import * as kagoshimaRates from './46kagoshima_insurance_grades.json';
import * as okinawaRates from './47okinawa_insurance_grades.json';

interface GradeMasterEntry {
  grade: number;
  lowerBound: number;
  upperBound: number | null;
}

interface HokkaidoGradeData {
  monthlyWageFrom: number;
  monthlyWageTo: number | null;
  standardMonthlyWage: number;
  healthInsurance: number;
  healthInsuranceEmployee: number;
  nursingInsurance: number;
  nursingInsuranceEmployee: number;
}

interface HokkaidoRates {
  "北海道": {
    [grade: string]: HokkaidoGradeData;
  };
}

interface PrefectureGradeData {
  standardMonthlyWage: number;
  healthInsurance: number;
  healthInsuranceEmployee: number;
  nursingInsurance: number;
  nursingInsuranceEmployee: number;
}

interface PrefectureRates {
  [grade: string]: PrefectureGradeData;
}

// 都道府県コードと保険料データのマッピング
const prefectureRatesMap: { [key: string]: PrefectureRates | HokkaidoRates } = {
  '北海道': hokkaidoRates as HokkaidoRates,
  '青森県': aomoriRates as PrefectureRates,
  '岩手県': iwateRates as PrefectureRates,
  '宮城県': miyagiRates as PrefectureRates,
  '秋田県': akitaRates as PrefectureRates,
  '山形県': yamagataRates as PrefectureRates,
  '福島県': fukushimaRates as PrefectureRates,
  '茨城県': ibarakiRates as PrefectureRates,
  '栃木県': tochigiRates as PrefectureRates,
  '群馬県': gunmaRates as PrefectureRates,
  '埼玉県': saitamaRates as PrefectureRates,
  '千葉県': chibaRates as PrefectureRates,
  '東京都': tokyoRates as PrefectureRates,
  '神奈川県': kanagawaRates as PrefectureRates,
  '新潟県': niigataRates as PrefectureRates,
  '富山県': toyamaRates as PrefectureRates,
  '石川県': ishikawaRates as PrefectureRates,
  '福井県': fukuiRates as PrefectureRates,
  '山梨県': yamanashiRates as PrefectureRates,
  '長野県': naganoRates as PrefectureRates,
  '岐阜県': gifuRates as PrefectureRates,
  '静岡県': shizuokaRates as PrefectureRates,
  '愛知県': aichiRates as PrefectureRates,
  '三重県': mieRates as PrefectureRates,
  '滋賀県': shigaRates as PrefectureRates,
  '京都府': kyotoRates as PrefectureRates,
  '大阪府': osakaRates as PrefectureRates,
  '兵庫県': hyogoRates as PrefectureRates,
  '奈良県': naraRates as PrefectureRates,
  '和歌山県': wakayamaRates as PrefectureRates,
  '鳥取県': tottoriRates as PrefectureRates,
  '島根県': shimaneRates as PrefectureRates,
  '岡山県': okayamaRates as PrefectureRates,
  '広島県': hiroshimaRates as PrefectureRates,
  '山口県': yamaguchiRates as PrefectureRates,
  '徳島県': tokushimaRates as PrefectureRates,
  '香川県': kagawaRates as PrefectureRates,
  '愛媛県': ehimeRates as PrefectureRates,
  '高知県': kochiRates as PrefectureRates,
  '福岡県': fukuokaRates as PrefectureRates,
  '佐賀県': sagaRates as PrefectureRates,
  '長崎県': nagasakiRates as PrefectureRates,
  '熊本県': kumamotoRates as PrefectureRates,
  '大分県': oitaRates as PrefectureRates,
  '宮崎県': miyazakiRates as PrefectureRates,
  '鹿児島県': kagoshimaRates as PrefectureRates,
  '沖縄県': okinawaRates as PrefectureRates
};

interface InsuranceCalculationResult {
  healthInsurance: {
    employee: number;
    employer: number;
  };
  nursingInsurance: {
    employee: number;
    employer: number;
  };
  pensionInsurance: {
    employee: number;
    employer: number;
  };
  childContribution: number;
  total: {
    employee: number;
    employer: number;
  };
}

interface InsuranceCalculationParams {
  prefecture: string;
  grade: number; // 等級を直接指定
  age: number;
  hasChildren: boolean;
  isOnLeave?: boolean;
}

interface PensionRateData {
  standardMonthlyWage: number;
  pensionInsurance: number;
  pensionInsuranceEmployee: number;
}

interface PensionRatesMaster {
  '厚生年金保険': {
    [key: string]: PensionRateData;
  };
}

interface BonusInsuranceResult {
  standardBonusAmount: number;
  healthInsuranceEmployee: number;
  healthInsuranceEmployer: number;
  nursingInsuranceEmployee: number;
  nursingInsuranceEmployer: number;
  pensionInsuranceEmployee: number;
  pensionInsuranceEmployer: number;
  childContribution: number;
}

@Injectable({
  providedIn: 'root'
})
export class InsuranceCalculationService {
  private prefectureService: PrefectureInsuranceRatesService;
  private detailedRatesService: DetailedInsuranceRatesService;

  constructor() {
    this.prefectureService = PrefectureInsuranceRatesService.getInstance();
    this.detailedRatesService = DetailedInsuranceRatesService.getInstance();
  }

  // 都道府県別の保険料データを取得
  private getPrefectureGradeData(prefecture: string, grade: number): PrefectureGradeData | null {
    if (grade == null) {
      // 等級が未設定の場合はnullを返す（エラーを投げない）
      return null;
    }
    const prefectureData = prefectureRatesMap[prefecture];
    if (!prefectureData) return null;

    if (prefecture === '北海道') {
      const hokkaidoData = (prefectureData as HokkaidoRates)['北海道'][grade.toString()];
      if (hokkaidoData) {
        return {
          standardMonthlyWage: hokkaidoData.standardMonthlyWage,
          healthInsurance: hokkaidoData.healthInsurance,
          healthInsuranceEmployee: hokkaidoData.healthInsuranceEmployee,
          nursingInsurance: hokkaidoData.nursingInsurance,
          nursingInsuranceEmployee: hokkaidoData.nursingInsuranceEmployee
        };
      }
    } else {
      return (prefectureData as PrefectureRates)[grade.toString()] || null;
    }

    return null;
  }

  // 等級を判定
  private determineGrade(standardMonthlyWage: number, prefecture: string): number {
    // 標準報酬月額から等級を判定
    for (const gradeInfo of (gradeMaster as GradeMasterEntry[])) {
      // 給与額が等級の範囲内にある場合
      if (standardMonthlyWage >= gradeInfo.lowerBound && 
          (gradeInfo.upperBound === null || standardMonthlyWage < gradeInfo.upperBound)) {
        return gradeInfo.grade;
      }
    }
    return 1;
  }

  // 標準報酬月額を計算
  private calculateStandardMonthlyWage(components: { baseSalary: number; allowances: number; commutingAllowance: number }, prefecture: string): number {
    // 総支給額を計算
    const total = components.baseSalary + components.allowances + components.commutingAllowance;
    
    // 千円未満を四捨五入
    const roundedTotal = Math.round(total / 1000) * 1000;
    
    // 等級を判定
    const grade = this.determineGrade(roundedTotal, prefecture);
    const gradeData = this.getPrefectureGradeData(prefecture, grade);
    
    // 等級に対応する標準報酬月額を返す
    return gradeData ? gradeData.standardMonthlyWage : roundedTotal;
  }

  // 健康保険料を計算
  private calculateHealthInsurance(prefecture: string, standardMonthlyWage: number): { employee: number; employer: number } {
    const prefectureRates = prefectureRatesMap[prefecture];
    if (!prefectureRates) {
      console.error(`都道府県「${prefecture}」の保険料率データが見つかりません`);
      throw new Error(`都道府県「${prefecture}」の保険料率データが見つかりません`);
    }

    // 等級を決定
    const grade = this.determineGrade(standardMonthlyWage, prefecture);
    if (!grade) {
      console.error(`標準報酬月額「${standardMonthlyWage}円」に対応する等級が見つかりません（都道府県：${prefecture}）`);
      throw new Error(`標準報酬月額「${standardMonthlyWage}円」に対応する等級が見つかりません（都道府県：${prefecture}）`);
    }

    // 等級データを取得
    const gradeData = (prefectureRates as any)[grade];
    if (!gradeData) {
      console.error(`都道府県「${prefecture}」の等級「${grade}」のデータが見つかりません`);
      throw new Error(`都道府県「${prefecture}」の等級「${grade}」のデータが見つかりません`);
    }

    console.log(`保険料計算情報：
    都道府県: ${prefecture}
    標準報酬月額: ${standardMonthlyWage}円
    等級: ${grade}
    健康保険料（従業員負担）: ${gradeData.healthInsuranceEmployee}円
    健康保険料（事業主負担）: ${gradeData.healthInsurance - gradeData.healthInsuranceEmployee}円`);

    return {
      employee: gradeData.healthInsuranceEmployee,
      employer: gradeData.healthInsurance - gradeData.healthInsuranceEmployee
    };
  }

  // 介護保険料を計算
  private calculateNursingInsurance(prefecture: string, standardMonthlyWage: number): number {
    const grade = this.determineGrade(standardMonthlyWage, prefecture);
    const gradeData = this.getPrefectureGradeData(prefecture, grade);
    
    if (!gradeData) {
      throw new Error(`保険料率データが見つかりません: 都道府県=${prefecture}, 等級=${grade}`);
    }

    // 介護保険料 = nursingInsurance - healthInsurance
    return Math.round(gradeData.nursingInsurance - gradeData.healthInsurance);
  }

  // 厚生年金保険料を計算
  private calculatePensionInsurance(standardMonthlyWage: number): number {
    // 健康保険・介護保険と同じ等級判定ロジックを使用
    const grade = this.determineGrade(standardMonthlyWage, '全国');
    const pensionRates = (pensionRatesMaster as PensionRatesMaster)['厚生年金保険'];
    
    if (!grade || !pensionRates[grade.toString()]) {
      throw new Error('厚生年金保険料の計算に必要な等級が見つかりません');
    }

    return pensionRates[grade.toString()].pensionInsuranceEmployee;
  }

  // 子ども・子育て拠出金の計算
  private calculateChildContribution(standardMonthlyWage: number): number {
    // 子ども・子育て拠出金は全国統一の料率を使用
    const childContributionRate = 0.0036;
    return Math.round(standardMonthlyWage * childContributionRate);
  }

  // 保険料を計算
  calculateInsurance(params: InsuranceCalculationParams): InsuranceCalculationResult | null {
    const { prefecture, grade, age } = params;

    // 等級から都道府県ごとのデータを取得
    const gradeData = this.getPrefectureGradeData(prefecture, grade);
    if (!gradeData) {
      // 等級が未設定やデータがない場合はnullを返す（エラーを投げない）
      return null;
    }

    // 健康保険料
    const healthInsuranceEmployee = gradeData.healthInsuranceEmployee;
    const healthInsuranceEmployer = gradeData.healthInsurance - gradeData.healthInsuranceEmployee;

    // 介護保険料（40歳以上の場合のみ）
    let nursingInsuranceEmployee = 0;
    let nursingInsuranceEmployer = 0;
    if (age >= 40 && age < 65) {
      const nursingInsuranceEmployeeAmount = gradeData.nursingInsuranceEmployee - gradeData.healthInsuranceEmployee;
      const decimal = nursingInsuranceEmployeeAmount - Math.floor(nursingInsuranceEmployeeAmount);
      nursingInsuranceEmployee = decimal <= 0.5 
        ? Math.floor(nursingInsuranceEmployeeAmount)
        : Math.ceil(nursingInsuranceEmployeeAmount);
      nursingInsuranceEmployer = Math.round(gradeData.nursingInsurance - gradeData.healthInsurance - nursingInsuranceEmployee);
    }

    // 厚生年金保険料
    // pensionRatesMasterの利用は従来通り（gradeを直接使う）
    const pensionRates = (pensionRatesMaster as PensionRatesMaster)['厚生年金保険'];
    const pensionInsuranceEmployee = pensionRates[grade.toString()]?.pensionInsuranceEmployee || 0;
    const pensionInsuranceEmployer = pensionInsuranceEmployee;

    // 子ども・子育て拠出金（全国統一）
    const childContributionRate = 0.0036;
    const childContribution = Math.round(gradeData.standardMonthlyWage * childContributionRate);

    // 合計
    const employeeTotal = healthInsuranceEmployee + nursingInsuranceEmployee + pensionInsuranceEmployee;
    const employerTotal = healthInsuranceEmployer + nursingInsuranceEmployer + pensionInsuranceEmployer + childContribution;

    return {
      healthInsurance: {
        employee: healthInsuranceEmployee,
        employer: healthInsuranceEmployer
      },
      nursingInsurance: {
        employee: nursingInsuranceEmployee,
        employer: nursingInsuranceEmployer
      },
      pensionInsurance: {
        employee: pensionInsuranceEmployee,
        employer: pensionInsuranceEmployer
      },
      childContribution,
      total: {
        employee: employeeTotal,
        employer: employerTotal
      }
    };
  }

  // 利用可能な都道府県のリストを取得
  getAvailablePrefectures(): string[] {
    return Object.keys(prefectureRatesMap);
  }

  // 等級を探すメソッド
  private findGrade(standardMonthlyWage: number, rates: { [key: string]: { standardMonthlyWage: number; pensionInsurance: number; pensionInsuranceEmployee: number } }): string | null {
    for (const grade in rates) {
      if (rates[grade].standardMonthlyWage >= standardMonthlyWage) {
        return grade;
      }
    }
    return null;
  }

  /**
   * 賞与に対する社会保険料計算（賞与回数が3回以下の場合のみ）
   * @param bonusAmount 賞与支給額
   * @param prefecture 会社所在地の都道府県
   * @param age 年齢
   * @param year 年度（例: '2025'）
   * @param bonusCount 賞与回数
   * @param annualBonusTotal 健康保険の年度累計（今回支給前までの累計）
   * @returns 保険料計算結果 or null
   */
  calculateBonusInsurance({
    bonusAmount,
    prefecture,
    age,
    year = '2025',
    bonusCount,
    annualBonusTotal = 0
  }: {
    bonusAmount: number;
    prefecture: string;
    age: number;
    year?: string;
    bonusCount: number;
    annualBonusTotal?: number;
  }): BonusInsuranceResult | null {
    if (bonusCount > 3) return null; // 4回以上は通常の報酬扱い
    if (!bonusAmount || !prefecture) return null;
    // 標準賞与額: 1,000円未満切り捨て
    const standardBonusAmount = Math.floor(bonusAmount / 1000) * 1000;
    // 厚生年金の1回上限: 150万円
    const cappedBonusPension = Math.min(standardBonusAmount, 1500000);
    // 健康保険の年度累計上限: 573万円
    let cappedBonusHealth = standardBonusAmount;
    if (annualBonusTotal < 5730000) {
      cappedBonusHealth = Math.min(standardBonusAmount, 5730000 - annualBonusTotal);
      cappedBonusHealth = Math.max(0, cappedBonusHealth); // マイナス防止
    } else {
      cappedBonusHealth = 0;
    }
    // 料率取得
    const rates = (bonusInsuranceRates as any)[year]?.[prefecture];
    if (!rates) return null;
    const healthInsuranceRate = rates.healthInsuranceRate;
    const nursingInsuranceRate = rates.specialInsuranceRate;
    const pensionInsuranceRate = 0.183; // 全国一律
    // 健康保険・介護保険・厚生年金は折半（2分の1）
    const healthInsuranceTotal = Math.floor(cappedBonusHealth * healthInsuranceRate);
    const healthInsuranceEmployee = Math.floor(healthInsuranceTotal / 2);
    const healthInsuranceEmployer = healthInsuranceTotal - healthInsuranceEmployee;
    const pensionInsuranceTotal = Math.floor(cappedBonusPension * pensionInsuranceRate);
    const pensionInsuranceEmployee = Math.floor(pensionInsuranceTotal / 2);
    const pensionInsuranceEmployer = pensionInsuranceTotal - pensionInsuranceEmployee;
    let nursingInsuranceEmployee = 0;
    let nursingInsuranceEmployer = 0;
    if (age >= 40 && age < 65) {
      const nursingInsuranceTotal = Math.floor(cappedBonusHealth * nursingInsuranceRate);
      nursingInsuranceEmployee = Math.floor(nursingInsuranceTotal / 2);
      nursingInsuranceEmployer = nursingInsuranceTotal - nursingInsuranceEmployee;
    }
    // 子ども・子育て拠出金（会社分のみ、健康保険の上限と同じ賞与額を使う）
    const childContribution = Math.floor(cappedBonusHealth * 0.0036);
    return {
      standardBonusAmount,
      healthInsuranceEmployee,
      healthInsuranceEmployer,
      nursingInsuranceEmployee,
      nursingInsuranceEmployer,
      pensionInsuranceEmployee,
      pensionInsuranceEmployer,
      childContribution
    };
  }
} 