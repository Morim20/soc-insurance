import hokkaidoRates from './01hokkaido_detailed_insurance_rates_grade1to50_final.json';
import aomoriRates from './02aomori_insurance_rates.json';
import iwateRates from './03iwate_insurance_rates.json';
import miyagiRates from './04miyagi_health_insurance_standardized.json';
import akitaRates from './05akita_insurance_rates.json';
import yamagataRates from './06yamagata_insurance_rates.json';
import fukushimaRates from './07fukushima_insurance_rates.json';
import ibarakiRates from './08ibaraki_insurance_rates.json';
import tochigiRates from './09tochigi_insurance_rates.json';
import gunmaRates from './10gunma_insurance_rates.json';
import saitamaRates from './11saitama_insurance_rates.json';
import chibaRates from './12chiba_insurance_rates.json';
import tokyoRates from './13tokyo_insurance_rates.json';
import kanagawaRates from './14kanagawa_insurance_rates.json';
import niigataRates from './15niigata_insurance_rates.json';
import toyamaRates from './16toyama_insurance_rates.json';
import ishikawaRates from './17ishikawa_insurance_rates.json';
import fukuiRates from './18fukui_insurance_rates.json';
import yamanashiRates from './19yamanashi_insurance_grades.json';
import naganoRates from './20nagano_insurance_grades.json';
import gifuRates from './21gifu_insurance_grades.json';
import shizuokaRates from './22shizuoka_insurance_grades.json';
import aichiRates from './23aichi_insurance_grades.json';
import mieRates from './24mie_insurance_grades.json';
import shigaRates from './25shiga_insurance_grades.json';
import kyotoRates from './26kyoto_insurance_grades.json';
import osakaRates from './27osaka_insurance_grades.json';
import hyogoRates from './28hyogo_insurance_grades.json';
import naraRates from './29nara_insurance_grades.json';
import wakayamaRates from './30wakayama_insurance_grades.json';
import tottoriRates from './31tottori_insurance_grades.json';
import shimaneRates from './32shimane_insurance_grades.json';
import okayamaRates from './33okayama_insurance_grades.json';
import hiroshimaRates from './34hiroshima_insurance_grades.json';
import yamaguchiRates from './35yamaguchi_insurance_grades.json';
import tokushimaRates from './36tokushima_insurance_grades.json';
import kagawaRates from './37kagawa_insurance_grades.json';
import ehimeRates from './38ehime_insurance_grades.json';
import kochiRates from './39kochi_insurance_grades.json';
import fukuokaRates from './40fukuoka_insurance_grades.json';
import sagaRates from './41saga_insurance_grades.json';
import nagasakiRates from './42nagasaki_insurance_grades.json';
import kumamotoRates from './43kumamoto_insurance_grades.json';
import oitaRates from './44oita_insurance_grades.json';
import miyazakiRates from './45miyazaki_insurance_grades.json';
import kagoshimaRates from './46kagoshima_insurance_grades.json';
import okinawaRates from './47okinawa_insurance_grades.json';

export interface DetailedInsuranceRate {
  standardMonthlyWage: number;
  healthInsurance: number;
  healthInsuranceEmployee: number;
  nursingInsurance: number;
  nursingInsuranceEmployeeReal: number;
}

export class DetailedInsuranceRatesService {
  private static instance: DetailedInsuranceRatesService;
  private rates: { [key: string]: { [key: string]: DetailedInsuranceRate } };

  private constructor() {
    this.rates = {
      '北海道': hokkaidoRates['北海道'],
      '青森県': aomoriRates,
      '岩手県': iwateRates,
      '宮城県': miyagiRates,
      '秋田県': akitaRates,
      '山形県': yamagataRates,
      '福島県': fukushimaRates,
      '茨城県': ibarakiRates,
      '栃木県': tochigiRates,
      '群馬県': gunmaRates,
      '埼玉県': saitamaRates,
      '千葉県': chibaRates,
      '東京都': tokyoRates,
      '神奈川県': kanagawaRates,
      '新潟県': niigataRates,
      '富山県': toyamaRates,
      '石川県': ishikawaRates,
      '福井県': fukuiRates,
      '山梨県': yamanashiRates,
      '長野県': naganoRates,
      '岐阜県': gifuRates,
      '静岡県': shizuokaRates,
      '愛知県': aichiRates,
      '三重県': mieRates,
      '滋賀県': shigaRates,
      '京都府': kyotoRates,
      '大阪府': osakaRates,
      '兵庫県': hyogoRates,
      '奈良県': naraRates,
      '和歌山県': wakayamaRates,
      '鳥取県': tottoriRates,
      '島根県': shimaneRates,
      '岡山県': okayamaRates,
      '広島県': hiroshimaRates,
      '山口県': yamaguchiRates,
      '徳島県': tokushimaRates,
      '香川県': kagawaRates,
      '愛媛県': ehimeRates,
      '高知県': kochiRates,
      '福岡県': fukuokaRates,
      '佐賀県': sagaRates,
      '長崎県': nagasakiRates,
      '熊本県': kumamotoRates,
      '大分県': oitaRates,
      '宮崎県': miyazakiRates,
      '鹿児島県': kagoshimaRates,
      '沖縄県': okinawaRates
    };
  }

  public static getInstance(): DetailedInsuranceRatesService {
    if (!DetailedInsuranceRatesService.instance) {
      DetailedInsuranceRatesService.instance = new DetailedInsuranceRatesService();
    }
    return DetailedInsuranceRatesService.instance;
  }

  public getRates(prefecture: string): { [key: string]: DetailedInsuranceRate } {
    const rates = this.rates[prefecture];
    if (!rates) {
      throw new Error(`都道府県 "${prefecture}" の詳細料率が見つかりません。`);
    }
    return rates;
  }

  public getRateByWage(prefecture: string, monthlyWage: number): DetailedInsuranceRate {
    const rates = this.getRates(prefecture);
    const grade = this.findGradeByWage(rates, monthlyWage);
    return rates[grade];
  }

  private findGradeByWage(rates: { [key: string]: DetailedInsuranceRate }, monthlyWage: number): string {
    const grades = Object.keys(rates).sort((a, b) => parseInt(a) - parseInt(b));
    
    for (const grade of grades) {
      const rate = rates[grade];
      if (monthlyWage <= rate.standardMonthlyWage) {
        return grade;
      }
    }
    
    // 最高等級を超える場合は最高等級を返す
    return grades[grades.length - 1];
  }

  public getAvailablePrefectures(): string[] {
    return Object.keys(this.rates);
  }
} 