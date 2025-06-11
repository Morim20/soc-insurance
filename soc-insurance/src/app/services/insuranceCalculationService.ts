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
  nursingInsuranceEmployeeReal: number;
}

interface PrefectureRates {
  [grade: string]: PrefectureGradeData;
}

// 都道府県コードと保険料データのマッピング
const prefectureRatesMap: { [key: string]: PrefectureRates | HokkaidoRates } = {
  '北海道': hokkaidoRates as unknown as HokkaidoRates,
  '青森県': aomoriRates as unknown as PrefectureRates,
  '岩手県': iwateRates as unknown as PrefectureRates,
  '宮城県': miyagiRates as unknown as PrefectureRates,
  '秋田県': akitaRates as unknown as PrefectureRates,
  '山形県': yamagataRates as unknown as PrefectureRates,
  '福島県': fukushimaRates as unknown as PrefectureRates,
  '茨城県': ibarakiRates as unknown as PrefectureRates,
  '栃木県': tochigiRates as unknown as PrefectureRates,
  '群馬県': gunmaRates as unknown as PrefectureRates,
  '埼玉県': saitamaRates as unknown as PrefectureRates,
  '千葉県': chibaRates as unknown as PrefectureRates,
  '東京都': tokyoRates as unknown as PrefectureRates,
  '神奈川県': kanagawaRates as unknown as PrefectureRates,
  '新潟県': niigataRates as unknown as PrefectureRates,
  '富山県': toyamaRates as unknown as PrefectureRates,
  '石川県': ishikawaRates as unknown as PrefectureRates,
  '福井県': fukuiRates as unknown as PrefectureRates,
  '山梨県': yamanashiRates as unknown as PrefectureRates,
  '長野県': naganoRates as unknown as PrefectureRates,
  '岐阜県': gifuRates as unknown as PrefectureRates,
  '静岡県': shizuokaRates as unknown as PrefectureRates,
  '愛知県': aichiRates as unknown as PrefectureRates,
  '三重県': mieRates as unknown as PrefectureRates,
  '滋賀県': shigaRates as unknown as PrefectureRates,
  '京都府': kyotoRates as unknown as PrefectureRates,
  '大阪府': osakaRates as unknown as PrefectureRates,
  '兵庫県': hyogoRates as unknown as PrefectureRates,
  '奈良県': naraRates as unknown as PrefectureRates,
  '和歌山県': wakayamaRates as unknown as PrefectureRates,
  '鳥取県': tottoriRates as unknown as PrefectureRates,
  '島根県': shimaneRates as unknown as PrefectureRates,
  '岡山県': okayamaRates as unknown as PrefectureRates,
  '広島県': hiroshimaRates as unknown as PrefectureRates,
  '山口県': yamaguchiRates as unknown as PrefectureRates,
  '徳島県': tokushimaRates as unknown as PrefectureRates,
  '香川県': kagawaRates as unknown as PrefectureRates,
  '愛媛県': ehimeRates as unknown as PrefectureRates,
  '高知県': kochiRates as unknown as PrefectureRates,
  '福岡県': fukuokaRates as unknown as PrefectureRates,
  '佐賀県': sagaRates as unknown as PrefectureRates,
  '長崎県': nagasakiRates as unknown as PrefectureRates,
  '熊本県': kumamotoRates as unknown as PrefectureRates,
  '大分県': oitaRates as unknown as PrefectureRates,
  '宮崎県': miyazakiRates as unknown as PrefectureRates,
  '鹿児島県': kagoshimaRates as unknown as PrefectureRates,
  '沖縄県': okinawaRates as unknown as PrefectureRates
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
  constructor() {
    this.prefectureService = PrefectureInsuranceRatesService.getInstance();
    this.detailedRatesService = DetailedInsuranceRatesService.getInstance();
  }

  private prefectureService: PrefectureInsuranceRatesService;
  private detailedRatesService: DetailedInsuranceRatesService;

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
          nursingInsuranceEmployee: hokkaidoData.nursingInsuranceEmployee,
          nursingInsuranceEmployeeReal: hokkaidoData.nursingInsuranceEmployee
        };
      }
    } else {
      return (prefectureData as PrefectureRates)[grade.toString()] || null;
    }

    return null;
  }

  // 等級を決定
  public determineGrade(standardMonthlyWage: number, prefecture: string): number {
    const prefectureRates = prefectureRatesMap[prefecture];
    if (!prefectureRates) {
      console.error(`都道府県「${prefecture}」の保険料率データが見つかりません`);
      return 0;
    }

    // 等級マスターから該当する等級を探す
    for (const entry of gradeMaster) {
      if (standardMonthlyWage >= entry.lowerBound && (!entry.upperBound || standardMonthlyWage < entry.upperBound)) {
        return entry.grade;
      }
    }

    console.error(`標準報酬月額「${standardMonthlyWage}円」に対応する等級が見つかりません（都道府県：${prefecture}）`);
    return 0;
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
  private calculatePensionInsurance(standardMonthlyWage: number): { employee: number; employer: number } {
    const pensionRate = 0.183; // 18.3%
    const totalPension = Math.round(standardMonthlyWage * pensionRate);
    return {
      employee: Math.round(totalPension / 2),
      employer: Math.round(totalPension / 2)
    };
  }

  // 子ども・子育て拠出金の計算
  private calculateChildContribution(standardMonthlyWage: number): number {
    // 子ども・子育て拠出金は全国統一の料率を使用
    const childContributionRate = 0.0036;
    return Math.round(standardMonthlyWage * childContributionRate);
  }

  private roundAmount(amount: number): number {
    const decimal = amount - Math.floor(amount);
    if (decimal <= 0.5) {
      return Math.floor(amount);
    } else {
      return Math.ceil(amount);
    }
  }

  // 保険料を計算
  calculateInsurance(params: InsuranceCalculationParams): InsuranceCalculationResult | null {
    const { prefecture, grade, age } = params;

    // 都道府県の保険料率データを取得
    const prefectureRates = prefectureRatesMap[prefecture];
    if (!prefectureRates) {
      console.error(`都道府県「${prefecture}」の保険料率データが見つかりません`);
      return null;
    }

    // 等級データを取得
    const gradeData = (prefectureRates as any)[grade];
    if (!gradeData) {
      console.error(`都道府県「${prefecture}」の等級「${grade}」のデータが見つかりません`);
      return null;
    }

    console.log('保険料計算パラメータ:', {
      prefecture,
      grade,
      age,
      gradeData
    });

    const healthInsuranceEmployeeRaw = gradeData.healthInsuranceEmployee;
    const healthInsuranceEmployerRaw = gradeData.healthInsurance - healthInsuranceEmployeeRaw;
    
    // 介護保険の対象年齢判定（40歳以上65歳未満）
    let nursingInsuranceEmployeeRaw = 0;
    let nursingInsuranceEmployerRaw = 0;
    if (age >= 40 && age < 65) {
      nursingInsuranceEmployeeRaw = gradeData.nursingInsuranceEmployeeReal - healthInsuranceEmployeeRaw;
      nursingInsuranceEmployerRaw = gradeData.nursingInsurance - gradeData.healthInsurance - nursingInsuranceEmployeeRaw;
    }

    const pensionInsuranceEmployeeRaw = this.calculatePensionInsurance(gradeData.standardMonthlyWage).employee;
    const pensionInsuranceEmployerRaw = this.calculatePensionInsurance(gradeData.standardMonthlyWage).employer;
    const childContributionRaw = this.calculateChildContribution(gradeData.standardMonthlyWage);
    const employeeTotalRaw = healthInsuranceEmployeeRaw + nursingInsuranceEmployeeRaw + pensionInsuranceEmployeeRaw + childContributionRaw;
    const employerBurdenRaw = healthInsuranceEmployerRaw + nursingInsuranceEmployerRaw + pensionInsuranceEmployerRaw;

    const result = {
      healthInsurance: {
        employee: healthInsuranceEmployeeRaw,
        employer: healthInsuranceEmployerRaw
      },
      nursingInsurance: {
        employee: nursingInsuranceEmployeeRaw,
        employer: nursingInsuranceEmployerRaw
      },
      pensionInsurance: {
        employee: pensionInsuranceEmployeeRaw,
        employer: pensionInsuranceEmployerRaw
      },
      childContribution: childContributionRaw,
      total: {
        employee: employeeTotalRaw,
        employer: employerBurdenRaw
      }
    };

    console.log('保険料計算結果:', result);
    return result;
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
    annualBonusTotal = 0,
    isMaternityLeave = false
  }: {
    bonusAmount: number;
    prefecture: string;
    age: number;
    year?: string;
    bonusCount: number;
    annualBonusTotal?: number;
    isMaternityLeave?: boolean;
  }): BonusInsuranceResult | null {
    if (bonusCount > 3) return null; // 4回以上は通常の報酬扱い
    if (!bonusAmount || !prefecture) return null;
    if (isMaternityLeave) {
      // 育休・産休中は全て0円
      return {
        standardBonusAmount: 0,
        healthInsuranceEmployee: 0,
        healthInsuranceEmployer: 0,
        nursingInsuranceEmployee: 0,
        nursingInsuranceEmployer: 0,
        pensionInsuranceEmployee: 0,
        pensionInsuranceEmployer: 0,
        childContribution: 0
      };
    }
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
    const nursingInsuranceRate = 0.0159; // 介護保険料率は全国一律1.59%
    const pensionInsuranceRate = 0.183; // 全国一律
    // 健康保険・介護保険・厚生年金は折半（2分の1）
    const healthInsuranceTotal = cappedBonusHealth * healthInsuranceRate;
    const healthInsuranceEmployee = healthInsuranceTotal / 2;
    const healthInsuranceEmployer = healthInsuranceTotal / 2;
    const pensionInsuranceTotal = cappedBonusPension * pensionInsuranceRate;
    const pensionInsuranceEmployee = pensionInsuranceTotal / 2;
    const pensionInsuranceEmployer = pensionInsuranceTotal / 2;
    let nursingInsuranceEmployee = 0;
    let nursingInsuranceEmployer = 0;
    if (age >= 40 && age < 65) {
      // 介護保険も健康保険と同様に573万円が上限
      const nursingInsuranceTotal = cappedBonusHealth * nursingInsuranceRate;
      nursingInsuranceEmployee = Math.floor(nursingInsuranceTotal / 2);  // 端数切り捨て
      nursingInsuranceEmployer = nursingInsuranceTotal - nursingInsuranceEmployee;  // 残りを事業主負担
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