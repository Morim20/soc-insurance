import { Injectable } from '@angular/core';

// 固定の料率を定義
const DEFAULT_CHILD_FUND_RATE = 0.0036; // 0.36%

@Injectable({
  providedIn: 'root'
})
export class PrefectureInsuranceRatesService {
  private static instance: PrefectureInsuranceRatesService;

  private constructor() {}

  public static getInstance(): PrefectureInsuranceRatesService {
    if (!PrefectureInsuranceRatesService.instance) {
      PrefectureInsuranceRatesService.instance = new PrefectureInsuranceRatesService();
    }
    return PrefectureInsuranceRatesService.instance;
  }

  public getChildFundRate(): number {
    return DEFAULT_CHILD_FUND_RATE;
  }
} 