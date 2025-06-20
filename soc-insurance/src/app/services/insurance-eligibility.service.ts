import { Injectable } from '@angular/core';
import { EmployeeFullInfo } from '../models/employee.model';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

export interface InsuranceEligibilityResult {
  healthInsurance: boolean;
  nursingInsurance: boolean;
  pensionInsurance: boolean;
  reason: string;
  nursingInsuranceStartMonth?: string | null | undefined; // 介護保険開始月（YYYY-MM形式）
  nursingInsuranceEndMonth?: string | null | undefined; // 介護保険終了月（YYYY-MM形式）
  pensionInsuranceStartMonth?: string | null | undefined; // 厚生年金開始月（YYYY-MM形式）
  pensionInsuranceEndMonth?: string | null | undefined; // 厚生年金終了月（YYYY-MM形式）
  insuranceExemptionStartMonth?: string | null | undefined;
  insuranceExemptionEndMonth?: string | null | undefined;
  insuranceExemptionFourteenDayRuleMonths?: string[] | null | undefined;
  insuranceExemptionBonusMonths?: string[] | null | undefined;
}

@Injectable({
  providedIn: 'root'
})
export class InsuranceEligibilityService {
  constructor(private firestore: Firestore) {
    // 初期化処理不要
  }

  private fetchOfficeEmployeeCount(): Observable<number> {
    return from(getDoc(doc(this.firestore, 'settings', 'office'))).pipe(
      map(doc => {
        if (doc.exists()) {
          return doc.data()['actualEmployeeCount'] || 0;
        }
        return 0;
      }),
      catchError(error => {
        console.error('事業所の従業員数の取得に失敗しました:', error);
        return [0];
      })
    );
  }

  calculateAge(birthDate: Date | null): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 指定年月時点での年齢を計算する
   * @param birthDate 生年月日
   * @param year 対象年
   * @param month 対象月（1-12）
   * @returns 年齢
   */
  calculateAgeAt(birthDate: Date | string | null, year: number, month: number): number {
    if (!birthDate) return 0;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 0;
    
    // その月の1日で年齢を計算
    const baseDate = new Date(year, month - 1, 1);
    let age = baseDate.getFullYear() - birth.getFullYear();
    const m = baseDate.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && baseDate.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  isFullTimeEmployee(employee: EmployeeFullInfo): boolean {
    const weeklyHours = employee.employmentInfo.weeklyHours;
    const monthlyWorkDays = employee.employmentInfo.monthlyWorkDays;
    const monthlyWage =
      (Number(employee.employmentInfo.baseSalary) || 0) +
      (Number(employee.employmentInfo.allowances) || 0) +
      (Number(employee.employmentInfo.commutingAllowance) || 0);

    // 正社員の場合
    if (employee.employmentInfo.employmentType === '正社員') {
      return true;
    }

    // パート・アルバイトの場合、通常社員の4分の3以上の労働時間
    if (['パート', 'アルバイト'].includes(employee.employmentInfo.employmentType)) {
      // 通常社員の4分の3以上の労働時間を満たす場合
      return weeklyHours >= 30 && monthlyWorkDays >= 15; // 一般的な基準として設定
    }

    return false;
  }

  isStudent(employee: EmployeeFullInfo): boolean {
    const type = employee.employmentInfo.studentType;
    // 「学生区分」が空でなく「一般（学生でない）」以外なら学生とみなす
    return !!type && type !== '一般（学生でない）';
  }

  isStudentEligibleForInsurance(employee: EmployeeFullInfo): boolean {
    const weeklyHours = employee.employmentInfo.weeklyHours;
    const monthlyWorkDays = employee.employmentInfo.monthlyWorkDays;
    const monthlyWage =
      (Number(employee.employmentInfo.baseSalary) || 0) +
      (Number(employee.employmentInfo.allowances) || 0) +
      (Number(employee.employmentInfo.commutingAllowance) || 0);
    const studentType = employee.employmentInfo.studentType;
    const age = this.calculateAge(employee.employeeBasicInfo.birthDate);

    // 学生でない場合は対象外
    if (!this.isStudent(employee)) {
      return false;
    }

    // ①正社員の4分の3以上の労働時間の場合
    if (weeklyHours >= 30 && monthlyWorkDays >= 15) {
      return true;
    }

    // ②休学中・夜間学生等の場合
    if (['休学中', '夜間学生', '通信制'].includes(studentType || '')) {
      return weeklyHours >= 20 && monthlyWage >= 88000;
    }

    return false;
  }

  isShortTimeWorker(employee: EmployeeFullInfo): boolean {
    const weeklyHours = Number(employee.employmentInfo.weeklyHours);
    const monthlyWage =
      (Number(employee.employmentInfo.baseSalary) || 0) +
      (Number(employee.employmentInfo.allowances) || 0) +
      (Number(employee.employmentInfo.commutingAllowance) || 0);
    const expectedEmploymentMonths = Number(employee.employmentInfo.expectedEmploymentMonths);
    const isStudent = this.isStudent(employee);

    // 学生の場合は短時間労働者としての判定対象外
    if (isStudent) {
      return false;
    }

    const hasEnoughHours = weeklyHours >= 20;
    const hasEnoughWage = monthlyWage >= 88000;
    // 雇用見込み期間が0（未設定）、null、undefinedの場合は短時間労働者として扱わない
    const hasLongTermEmployment = expectedEmploymentMonths > 2;

    return hasEnoughHours && hasEnoughWage && hasLongTermEmployment;
  }

  isOnLeave(employee: EmployeeFullInfo): boolean {
    const leaveType = employee.specialAttributes.leaveType;
    const leaveStartDate = employee.specialAttributes.leaveStartDate;
    const leaveEndDate = employee.specialAttributes.leaveEndDate;

    if (!leaveType || !leaveStartDate) return false;

    const today = new Date();
    const start = new Date(leaveStartDate);
    const end = leaveEndDate ? new Date(leaveEndDate) : null;

    // 休業期間内かどうかをチェック
    return today >= start && (!end || today <= end);
  }

 

  /**
   * 指定された年齢に達する月を計算する
   * @param birthDate 生年月日
   * @param targetAge 対象年齢
   * @returns YYYY-MM形式の文字列
   */
  private calculateAgeReachMonth(birthDate: Date | null | string, targetAge: number): string | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    let targetYear = birth.getFullYear() + targetAge;
    const targetMonth = birth.getMonth() + 1; // 1-based month
    // 1日生まれの場合は前月から開始
    if (birth.getDate() === 1) {
      if (targetMonth === 1) {
        return `${targetYear - 1}-12`;
      } else {
        return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
      }
    } else {
      // 1日以外は誕生日の属する月から
      return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
    }
  }

  /**
   * 介護保険の終了月計算を修正（65歳到達月の前月まで）
   * @param birthDate 生年月日
   * @returns YYYY-MM形式の文字列
   */
  private calculateNursingInsuranceEndMonth(birthDate: Date | null | string): string | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const targetYear = birth.getFullYear() + 65;
    const targetMonth = birth.getMonth() + 1; // 1-based month

    // 1日生まれの場合、前月末日が資格喪失日
    if (birth.getDate() === 1) {
      if (targetMonth === 1) {
        return `${targetYear - 1}-12`;
      } else {
        return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
      }
    } else {
      // 1日以外の場合、誕生日の前日が属する月
      if (birth.getDate() === 2) {
        if (targetMonth === 1) {
          return `${targetYear - 1}-12`;
        } else {
          return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
        }
      } else {
        return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
      }
    }
  }

  /**
   * 厚生年金の開始月計算（就職月から）
   * @param startDate 就職日
   * @returns YYYY-MM形式の文字列
   */
  private calculatePensionInsuranceStartMonth(startDate: Date | null | string): string | null {
    if (!startDate) return null;
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return null;
    
    return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * 厚生年金の終了月計算を修正（70歳になる誕生日前日が属する月の前月まで）
   * @param birthDate 生年月日
   * @returns YYYY-MM形式の文字列
   */
  private calculatePensionInsuranceEndMonth(birthDate: Date | null | string): string | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    let targetYear = birth.getFullYear() + 70;
    let targetMonth = birth.getMonth() + 1; // 1-based month

    // 70歳になる誕生日前日が属する月を計算
    const birthDay = birth.getDate();
    
    // デバッグログを追加
    console.log('厚生年金終了月計算開始:', {
      birthDate: birth,
      birthDay,
      originalTargetYear: targetYear,
      originalTargetMonth: targetMonth
    });
    
    // 70歳の終了月計算
    if (birthDay === 1) {
      // 1日生まれの場合、前日は前月の末日
      if (targetMonth === 1) {
        targetMonth = 12;
        targetYear -= 1;
      } else {
        targetMonth -= 1;
      }
      console.log('1日生まれの処理後:', { targetYear, targetMonth });
    }
    // 1日以外の場合は誕生日前日が属する月（誕生日と同じ月）

    // その月の前月が厚生年金終了月
    if (targetMonth === 1) {
      return `${targetYear - 1}-12`;
    } else {
      return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
    }
  }

  /**
   * 育児・産前産後休業中かどうかを判定
   */
  private isOnMaternityOrChildcareLeave(employee: EmployeeFullInfo): boolean {
    const leaveType = employee.specialAttributes?.leaveType;
    return ['育児休業', '産前産後休業', '産前休業', '産後休業'].includes(leaveType || '');
  }

  /**
   * 介護休業中かどうかを判定
   */
  private isOnCareLeave(employee: EmployeeFullInfo): boolean {
    const leaveType = employee.specialAttributes?.leaveType;
    return leaveType === '介護休業';
  }

  /**
   * 賞与支給月の末日を含む1か月超の連続した休業期間が存在する場合のみ、その月の賞与も社会保険料免除対象
   * @param bonusPaymentDates 賞与支給日（複数月対応）
   * @param leaveType 休業種別
   * @param leaveStart 休業開始日
   * @param leaveEnd 休業終了日
   * @returns 免除対象となる賞与支給月リスト
   */
  getBonusExemptionMonths(bonusPaymentDates: Date[], leaveType: string, leaveStart: Date, leaveEnd: Date): string[] {
    const result: string[] = [];
    // 休業種別が免除対象か
    if (!['育児休業', '産前産後休業'].includes(leaveType)) return result;
    // 休業開始日から31日以上の休業か
    const diffDays = (leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
    if (diffDays <= 30) return result;
    for (const bonusDate of bonusPaymentDates) {
      // 賞与支給月の末日
      const bonusMonthEnd = new Date(bonusDate.getFullYear(), bonusDate.getMonth() + 1, 0);
      // 末日が休業期間内か
      if (bonusMonthEnd >= leaveStart && bonusMonthEnd <= leaveEnd) {
        result.push(`${bonusDate.getFullYear()}-${String(bonusDate.getMonth() + 1).padStart(2, '0')}`);
      }
    }
    return result;
  }

  /**
   * 指定年月時点で介護保険の対象かどうかを判定
   */
  public isNursingInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    // デバッグログを追加
    console.log('isNursingInsuranceEligibleAt 呼び出し:', {
      birthDate,
      birthDateType: typeof birthDate,
      year,
      month
    });
    
    if (!birthDate) {
      console.log('生年月日がnullまたはundefinedのため、介護保険対象外');
      return false;
    }
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      console.log('生年月日の変換に失敗したため、介護保険対象外');
      return false;
    }

    // 介護保険開始月（40歳になる誕生日前日が属している月）の計算
    let startYear = birth.getFullYear() + 40;
    let startMonth = birth.getMonth() + 1; // 1-based month
    
    // 誕生日前日が属する月を計算
    const birthDay = birth.getDate();
    
    // 40歳の開始月計算
    if (birthDay === 1) {
      // 1日生まれの場合、前日は前月の末日
      if (startMonth === 1) {
        startMonth = 12;
        startYear -= 1;
      } else {
        startMonth -= 1;
      }
    }
    // 1日以外の場合は誕生日前日が属する月（誕生日と同じ月）

    // 介護保険終了月（65歳になる誕生日前日が属している月の前月）の計算
    let endYear = birth.getFullYear() + 65;
    let endMonth = birth.getMonth() + 1; // 1-based month
    
    // 65歳の終了月計算
    if (birthDay === 1) {
      // 1日生まれの場合、前日は前月の末日
      if (endMonth === 1) {
        endMonth = 12;
        endYear -= 1;
      } else {
        endMonth -= 1;
      }
    }
    // 1日以外の場合は誕生日前日が属する月（誕生日と同じ月）
    
    // その月の前月が介護保険終了月
    if (endMonth === 1) {
      endMonth = 12;
      endYear -= 1;
    } else {
      endMonth -= 1;
    }

    const currentYm = year * 100 + month;
    const startYm = startYear * 100 + startMonth;
    const endYm = endYear * 100 + endMonth;
    
    const result = currentYm >= startYm && currentYm <= endYm;
    
    // 判定結果のデバッグログ
    console.log('介護保険判定詳細:', {
      birthDate: birth,
      startYear,
      startMonth,
      endYear,
      endMonth,
      currentYm,
      startYm,
      endYm,
      result
    });
    
    return result;
  }

  /**
   * 指定年月時点で厚生年金の対象かどうかを判定
   */
  public isPensionInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    if (!birthDate) {
      // 生年月日が未設定の場合は、年齢による除外が判断できないため、加入対象とみなす
      return true;
    }
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) {
      // 日付が無効な場合も同様に加入対象とみなす（エラーなどで不正な日付が入る可能性を考慮）
      return true;
    }

    // 厚生年金開始月（就職時から）の計算
    // 厚生年金は就職時から加入対象なので、開始月は就職月とする
    // ここでは簡易的に現在の年月を開始月として扱う
    
    // 厚生年金終了月（70歳になる誕生日前日が属している月の前月）の計算
    let endYear = birth.getFullYear() + 70;
    let endMonth = birth.getMonth() + 1; // 1-based month
    
    // 70歳になる誕生日前日が属する月を計算
    const birthDay = birth.getDate();
    
    // デバッグログを追加
    console.log('厚生年金判定開始:', {
      birthDate: birth,
      birthDay,
      originalEndYear: endYear,
      originalEndMonth: endMonth
    });
    
    // 70歳の終了月計算
    if (birthDay === 1) {
      // 1日生まれの場合、前日は前月の末日
      if (endMonth === 1) {
        endMonth = 12;
        endYear -= 1;
      } else {
        endMonth -= 1;
      }
      console.log('1日生まれの処理後:', { endYear, endMonth });
    }
    // 1日以外の場合は誕生日前日が属する月（誕生日と同じ月）
    
    // その月の前月が厚生年金終了月
    if (endMonth === 1) {
      endMonth = 12;
      endYear -= 1;
    } else {
      endMonth -= 1;
    }

    const currentYm = year * 100 + month;
    const endYm = endYear * 100 + endMonth;
    
    // 対象年月が厚生年金終了月以前の場合は加入対象
    const result = currentYm <= endYm;
    
    // デバッグログを追加
    console.log('厚生年金判定詳細:', {
      birthDate: birth,
      birthDay,
      endYear,
      endMonth,
      currentYm,
      endYm,
      result
    });
    
    return result;
  }

  // 年齢による保険適用判定を厳密化
  private checkInsuranceEligibilityByAge(employee: EmployeeFullInfo, age: number): { healthInsurance: boolean, nursingInsurance: boolean, pensionInsurance: boolean, reason: string } | null {
    const birthDate = employee.employeeBasicInfo.birthDate;
    if (!birthDate) return null;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const birth = new Date(birthDate);
    const birthDay = birth.getDate();

    // 75歳到達判定（誕生日当日で喪失）
    const is75YearsOld = age >= 75;
    const is75thBirthday = age === 74 && 
      currentYear === birth.getFullYear() + 75 && 
      currentMonth === birth.getMonth() + 1 && 
      today.getDate() >= birthDay;

    if (is75YearsOld || is75thBirthday) {
      return {
        healthInsurance: false,
        nursingInsurance: false,
        pensionInsurance: false,
        reason: '75歳到達により健康保険の資格を喪失します（後期高齢者医療制度へ移行）'
      };
    }

    // 70歳以上75歳未満の判定
    if (age >= 70) {
      // 厚生年金は70歳になる誕生日前日が属する月から免除
      const pensionEligible = this.isPensionInsuranceEligibleAt(birthDate, currentYear, currentMonth);
      return {
        healthInsurance: true,
        nursingInsurance: false,
        pensionInsurance: pensionEligible,
        reason: pensionEligible ?
          '70歳以上75歳未満は健康保険・厚生年金加入対象（介護保険は65歳で終了、厚生年金は70歳になる誕生日前日が属する月から免除）' :
          '70歳になる誕生日前日が属する月から厚生年金免除。健康保険のみ加入対象（介護保険は65歳で終了済み）'
      };
    }

    // 65歳以上70歳未満の判定
    if (age >= 65) {
      return {
        healthInsurance: true,
        nursingInsurance: false, // 65歳で介護保険は終了
        pensionInsurance: true,
        reason: '65歳以上70歳未満は健康保険・厚生年金加入対象（介護保険は65歳で終了）'
      };
    }
    return null; // 65歳未満は通常の判定を継続
  }

  private isHealthInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    if (!birthDate) return false;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return false;

    const targetYear = birth.getFullYear() + 75;
    const targetMonth = birth.getMonth() + 1; // 1-based month

    // 75歳到達判定（誕生日月から健康保険料は発生しない）
    if (year > targetYear) {
      return false;
    }
    if (year === targetYear) {
      if (month >= targetMonth) {
        return false; // 75歳の誕生日月から健康保険料は発生しない
      }
    }

    return true;
  }

  /**
   * 退職日から資格喪失日を計算する
   * @param endDate 退職日
   * @returns 資格喪失日（Date型）
   */
  private calculateQualificationLossDate(endDate: Date | null): Date | null {
    if (!endDate) return null;
    
    const end = new Date(endDate);
    const year = end.getFullYear();
    const month = end.getMonth();
    const date = end.getDate();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

    // 月の末日に退職した場合は翌月1日が資格喪失日
    if (date === lastDayOfMonth) {
      return new Date(year, month + 1, 1);
    }
    
    // それ以外は退職日の翌日が資格喪失日
    return new Date(year, month, date + 1);
  }

  /**
   * 指定された年月が資格喪失月かどうかを判定
   * @param endDate 退職日
   * @param targetYear 対象年
   * @param targetMonth 対象月
   * @returns 資格喪失月の場合はtrue
   */
  private isQualificationLossMonth(endDate: Date | null, targetYear: number, targetMonth: number): boolean {
    if (!endDate) return false;
    
    const lossDate = this.calculateQualificationLossDate(endDate);
    if (!lossDate) return false;

    // 資格喪失日が属する月の前月までが保険料納付対象
    const lossYear = lossDate.getFullYear();
    const lossMonth = lossDate.getMonth() + 1; // 1-based month

    // 対象年月が資格喪失月より前の場合は加入対象
    if (targetYear < lossYear || (targetYear === lossYear && targetMonth < lossMonth)) {
      return false;
    }

    return true;
  }

  getInsuranceEligibility(employee: EmployeeFullInfo, targetYear: number, targetMonth: number, officeEmployeeCount: number): Observable<InsuranceEligibilityResult> {
    return new Observable<InsuranceEligibilityResult>(observer => {
      try {
        const result: InsuranceEligibilityResult = {
          healthInsurance: false,
          nursingInsurance: false,
          pensionInsurance: false,
          reason: '',
          nursingInsuranceStartMonth: this.calculateAgeReachMonth(employee.employeeBasicInfo.birthDate, 40),
          nursingInsuranceEndMonth: this.calculateNursingInsuranceEndMonth(employee.employeeBasicInfo.birthDate),
          pensionInsuranceStartMonth: this.calculatePensionInsuranceStartMonth(employee.employmentInfo.startDate),
          pensionInsuranceEndMonth: this.calculatePensionInsuranceEndMonth(employee.employeeBasicInfo.birthDate),
          insuranceExemptionBonusMonths: [] // 空配列で初期化
        };

        // 1. 年齢による判定（最優先）
        const age = this.calculateAgeAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth);
        const birthDate = employee.employeeBasicInfo.birthDate;
        
        // 年齢計算のデバッグログ
        console.log('年齢計算:', {
          employeeId: employee.id,
          birthDate: birthDate,
          birthDateType: typeof birthDate,
          targetYear,
          targetMonth,
          calculatedAge: age,
          isOver65: age >= 65,
          isOver70: age >= 70
        });
        
        if (birthDate) {
          const isHealthInsuranceEligible = this.isHealthInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          if (!isHealthInsuranceEligible) {
            result.reason = '75歳の誕生日から健康保険の資格を喪失します。健康保険料の支払いは前の月までです（後期高齢者医療制度へ移行）';
            observer.next(result);
            observer.complete();
            return;
          }
        }

        // 70歳以上75歳未満の場合は健康保険のみ、厚生年金は後で判定
        const isOver70 = age >= 70;
        const isOver65 = age >= 65;

        // 2. 適用除外（従業員数）
        if (officeEmployeeCount < 5) {
          result.reason = '従業員が5人未満のため、社会保険（健康保険・厚生年金・介護保険）の加入義務はありません（任意適用事業所を除く）';
          (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
          observer.next(result);
          observer.complete();
          return;
        }

        // --- ここから資格喪失日ロジックを厳密化 ---
        // 退職日
        const endDateRaw = employee.employmentInfo.endDate;
        let qualificationLossDate: Date | null = null;
        if (endDateRaw) {
          qualificationLossDate = this.calculateQualificationLossDate(new Date(endDateRaw));
        }
        // 雇用見込み終了日
        let expectedEndDate: Date | null = null;
        if (employee.employmentInfo.expectedEmploymentMonths && employee.employmentInfo.startDate) {
          const startDate = new Date(employee.employmentInfo.startDate);
          const expectedMonths = Number(employee.employmentInfo.expectedEmploymentMonths);
          if (!isNaN(expectedMonths) && expectedMonths > 0) {
            expectedEndDate = new Date(startDate);
            expectedEndDate.setMonth(expectedEndDate.getMonth() + expectedMonths);
            // 見込み終了日の翌日が資格喪失日
            expectedEndDate.setDate(expectedEndDate.getDate() + 1);
          }
        }
        // 退職日・見込み終了日どちらもある場合は早い方を採用
        if (qualificationLossDate && expectedEndDate) {
          qualificationLossDate = qualificationLossDate < expectedEndDate ? qualificationLossDate : expectedEndDate;
        } else if (!qualificationLossDate && expectedEndDate) {
          qualificationLossDate = expectedEndDate;
        }
        // 資格喪失日が決まっていれば、その月以降は喪失
        if (qualificationLossDate) {
          const lossYear = qualificationLossDate.getFullYear();
          const lossMonth = qualificationLossDate.getMonth() + 1;
          if (targetYear > lossYear || (targetYear === lossYear && targetMonth > lossMonth)) {
            result.reason = '退職または雇用見込み期間満了により資格を喪失しています';
            (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
            observer.next(result);
            observer.complete();
            return;
          }
          // 今月が喪失月
          if (targetYear === lossYear && targetMonth === lossMonth) {
            result.reason = '退職または雇用見込み期間満了により今月資格喪失';
            (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
            observer.next(result);
            observer.complete();
            return;
          }
        }
        // --- ここまで資格喪失日ロジック ---

        // 3. 休業中の判定
        const isOnMaternityOrChildcareLeave = this.isOnMaternityOrChildcareLeave(employee);
        const isOnCareLeave = this.isOnCareLeave(employee);

        if (isOnMaternityOrChildcareLeave) {
          // 育児・産前産後休業中の判定ロジック
          const leaveStart = employee.specialAttributes?.leaveStartDate ? new Date(employee.specialAttributes.leaveStartDate) : null;
          const leaveEnd = employee.specialAttributes?.leaveEndDate ? new Date(employee.specialAttributes.leaveEndDate) : null;
          let exemptionStartMonth = null;
          let exemptionEndMonth = null;
          let fourteenDayRuleMonths: string[] = [];
          if (leaveStart) {
            exemptionStartMonth = `${leaveStart.getFullYear()}-${String(leaveStart.getMonth() + 1).padStart(2, '0')}`;
          }
          if (leaveEnd) {
            exemptionEndMonth = `${leaveEnd.getFullYear()}-${String(leaveEnd.getMonth() + 1).padStart(2, '0')}`;
          }
          // 月をまたぐ14日ルール自動判定
          if (leaveStart && leaveEnd) {
            let current = new Date(leaveStart);
            current.setHours(0,0,0,0);
            const end = new Date(leaveEnd);
            end.setHours(0,0,0,0);
            while (current <= end) {
              const year = current.getFullYear();
              const month = current.getMonth();
              const monthStart = new Date(year, month, 1);
              const monthEnd = new Date(year, month + 1, 0);
              const overlapStart = current > monthStart ? current : monthStart;
              const overlapEnd = end < monthEnd ? end : monthEnd;
              const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              if (days >= 14) {
                fourteenDayRuleMonths.push(`${year}-${String(month + 1).padStart(2, '0')}`);
              }
              current = new Date(year, month + 1, 1);
            }
          }

          result.healthInsurance = true;
          result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
          result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          
          // 年齢による調整
          if (isOver65) {
            result.nursingInsurance = false; // 65歳以上は介護保険除外
          }
          
          result.reason = '育児・産前産後休業中は被保険者資格継続（事業主申請により本人・会社負担分とも全額免除）。\n' +
            '休業開始月から終了日の翌月前月まで社会保険料（健康・年金・介護）が免除されます。\n' +
            '育休は各月ごとに14日以上取得すればその月全体が免除対象です（令和4年10月〜）。\n' +
            (fourteenDayRuleMonths.length > 0 ? `【14日ルール自動判定】${fourteenDayRuleMonths.join(', ')}は14日以上取得のため月全体が免除対象です。\n` : '');
          if (isOver65) {
            result.reason += '（介護保険は65歳で終了）';
          }
          if (!result.pensionInsurance) {
            result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
          }
          (result as any).insuranceExemptionStartMonth = exemptionStartMonth;
          (result as any).insuranceExemptionEndMonth = exemptionEndMonth;
          if (fourteenDayRuleMonths.length > 0) {
            (result as any).insuranceExemptionFourteenDayRuleMonths = fourteenDayRuleMonths;
          }

          const bonusPaymentDates: Date[] = (employee.specialAttributes?.bonusPaymentDates || []).map((d: string) => new Date(d));
          let bonusExemptionMonths: string[] = [];
          if (bonusPaymentDates.length > 0 && leaveStart && leaveEnd) {
            bonusExemptionMonths = this.getBonusExemptionMonths(bonusPaymentDates, employee.specialAttributes?.leaveType || '', leaveStart, leaveEnd);
          }
          result.reason += (bonusExemptionMonths.length > 0
            ? `賞与支給月（${bonusExemptionMonths.join(', ')}）の末日が1か月を超える連続した休業期間に含まれているため、当月の賞与も社会保険料免除対象です。\n`
            : '');
          // 賞与免除対象外の場合でも空配列を設定
          (result as any).insuranceExemptionBonusMonths = bonusExemptionMonths;
          observer.next(result);
          observer.complete();
          return;
        }

        if (isOnCareLeave) {
          result.healthInsurance = true;
          result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
          result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          
          // 年齢による調整
          if (isOver65) {
            result.nursingInsurance = false; // 65歳以上は介護保険除外
          }
          
          result.reason = '介護休業中は被保険者資格継続（保険料免除なし）。休業中も通常どおり保険料が発生します（給与が無くても支払義務あり）';
          if (isOver65) {
            result.reason += '（介護保険は65歳で終了）';
          }
          if (!result.pensionInsurance) {
            result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
          }
          (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
          observer.next(result);
          observer.complete();
          return;
        }

        // 4. 2ヶ月以内契約の判定（最優先）
        const expectedEmploymentMonths = Number(employee.employmentInfo.expectedEmploymentMonths);
        
        // デバッグログを追加
        console.log('2ヶ月以内契約判定:', {
          employeeId: employee.id,
          expectedEmploymentMonths,
          employmentType: employee.employmentInfo.employmentType,
          weeklyHours: employee.employmentInfo.weeklyHours,
          monthlyWage: (Number(employee.employmentInfo.baseSalary) || 0) + (Number(employee.employmentInfo.allowances) || 0) + (Number(employee.employmentInfo.commutingAllowance) || 0),
          officeEmployeeCount
        });
        
        // 雇用見込み期間が1、2ヶ月の場合は社会保険適用除外
        // 雇用見込み期間が0（未設定）、null、undefinedの場合は判定しない
        if (expectedEmploymentMonths === 1 || expectedEmploymentMonths === 2) {
          console.log('2ヶ月以内契約として判定: 社会保険適用除外');
          result.reason = '2ヶ月以内契約（雇用見込み期間が1または2ヶ月）のため社会保険適用除外です（更新予定・実績があれば要再判定）';
          (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
          observer.next(result);
          observer.complete();
          return;
        }

        // 5. 学生の判定
        const isStudent = this.isStudent(employee);
        const studentType = employee.employmentInfo.studentType || '';
        if (isStudent) {
          if (['大学', '高校', '専門学校', 'その他学校'].includes(studentType)) {
            if (this.isFullTimeEmployee(employee)) {
              result.healthInsurance = true;
              result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
              result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
              
              // 年齢による調整
              if (isOver65) {
                result.nursingInsurance = false; // 65歳以上は介護保険除外
              }
              
              result.reason = '昼間学生ですが、週所定労働時間・月労働日数が正社員の4分の3以上のため社会保険加入義務があります（健康保険法第3条第9項ハ但書）';
              if (isOver65) {
                result.reason += '（介護保険は65歳で終了）';
              }
              if (!result.pensionInsurance) {
                result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
              }
              (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
              observer.next(result);
              observer.complete();
              return;
            } else {
              result.reason = '昼間学生（大学・高校・専門学校・その他学校）は原則社会保険適用除外です（健康保険法第3条第9項ハ）。給与からの控除も不要です。';
              (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
              observer.next(result);
              observer.complete();
              return;
            }
          }

          if (['夜間学生', '休学中', '通信制'].includes(studentType)) {
            const weeklyHours = Number(employee.employmentInfo.weeklyHours) || 0;
            const monthlyWage = (Number(employee.employmentInfo.baseSalary) || 0) +
              (Number(employee.employmentInfo.allowances) || 0) +
              (Number(employee.employmentInfo.commutingAllowance) || 0);
            if (weeklyHours >= 20 && monthlyWage >= 88000) {
              result.healthInsurance = true;
              result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
              result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
              
              // 年齢による調整
              if (isOver65) {
                result.nursingInsurance = false; // 65歳以上は介護保険除外
              }
              
              result.reason = '夜間学生・休学中・通信制で、週20時間以上かつ月給8.8万円以上のため社会保険加入対象です';
              if (isOver65) {
                result.reason += '（介護保険は65歳で終了）';
              }
              if (!result.pensionInsurance) {
                result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
              }
              (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
              observer.next(result);
              observer.complete();
              return;
            } else {
              result.reason = '夜間学生・休学中・通信制ですが、週20時間未満または月給8.8万円未満のため社会保険適用除外です';
              (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
              observer.next(result);
              observer.complete();
              return;
            }
          }
        }

        // 6. フルタイム従業員の判定
        if (this.isFullTimeEmployee(employee)) {
          result.healthInsurance = true;
          result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
          result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          
          // 年齢による調整
          if (isOver65) {
            result.nursingInsurance = false; // 65歳以上は介護保険除外
          }
          
          result.reason = 'フルタイム従業員（または4分の3要件を満たすパート）として社会保険加入対象です';
          if (isOver65) {
            result.reason += '（介護保険は65歳で終了）';
          }
          if (!result.pensionInsurance) {
            result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
          }
          (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
          observer.next(result);
          observer.complete();
          return;
        }

        // 7. パート・短時間労働者の判定
        const weeklyHours = Number(employee.employmentInfo.weeklyHours) || 0;
        const monthlyWage = (Number(employee.employmentInfo.baseSalary) || 0) +
          (Number(employee.employmentInfo.allowances) || 0) +
          (Number(employee.employmentInfo.commutingAllowance) || 0);
        const isPartOrArubaito = ['パート', 'アルバイト'].includes(employee.employmentInfo.employmentType);
        const hasEnoughWeeklyHours = weeklyHours >= 20;
        const hasEnoughWage = monthlyWage >= 88000;
        // 雇用見込み期間が0（未設定）、null、undefinedの場合は長期間雇用と仮定
        const hasLongTermEmployment = expectedEmploymentMonths > 2 || expectedEmploymentMonths === 0 || isNaN(expectedEmploymentMonths);
        const hasEnoughEmployeeCount = officeEmployeeCount >= 51;

        if (isPartOrArubaito && hasEnoughWeeklyHours && hasEnoughWage && hasLongTermEmployment && hasEnoughEmployeeCount) {
          result.healthInsurance = true;
          result.nursingInsurance = this.isNursingInsuranceEligibleAt(employee.employeeBasicInfo.birthDate, targetYear, targetMonth) && result.healthInsurance;
          result.pensionInsurance = this.isPensionInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          
          // 年齢による調整
          if (isOver65) {
            result.nursingInsurance = false; // 65歳以上は介護保険除外
          }
          
          // 見込み期間が未設定の場合はメッセージを調整
          const employmentMessage = (expectedEmploymentMonths === 0 || isNaN(expectedEmploymentMonths)) 
            ? 'パート・短時間労働者で5要件（週20時間以上・月給8.8万円以上・雇用見込み期間未設定のため長期間雇用と仮定・従業員51人以上）をすべて満たすため社会保険加入対象です'
            : 'パート・短時間労働者で5要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）をすべて満たすため社会保険加入対象です';
          
          result.reason = employmentMessage;
          if (isOver65) {
            result.reason += '（介護保険は65歳で終了）';
          }
          if (!result.pensionInsurance) {
            result.reason += '（厚生年金は70歳になる誕生日前日が属する月から免除）';
          }
          (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
          observer.next(result);
          observer.complete();
          return;
        }

        // 8. その他
        result.reason = '社会保険の適用要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）を満たさないため対象外です';
        (result as any).insuranceExemptionBonusMonths = []; // 空配列を設定
        observer.next(result);
        observer.complete();
      } catch (error) {
        console.error('社会保険加入判定エラー:', error);
        observer.next({
            healthInsurance: false,
            nursingInsurance: false,
            pensionInsurance: false,
          reason: '判定中にエラーが発生しました',
          nursingInsuranceStartMonth: this.calculateAgeReachMonth(employee.employeeBasicInfo.birthDate, 40),
          nursingInsuranceEndMonth: this.calculateNursingInsuranceEndMonth(employee.employeeBasicInfo.birthDate),
          pensionInsuranceStartMonth: this.calculatePensionInsuranceStartMonth(employee.employmentInfo.startDate),
          pensionInsuranceEndMonth: this.calculatePensionInsuranceEndMonth(employee.employeeBasicInfo.birthDate),
          insuranceExemptionBonusMonths: [] // 空配列を設定
        });
        observer.complete();
      }
    });
  }

  /**
   * 健康保険・介護保険の両方がtrueの場合のみ「実際に介護保険加入」と判定する共通メソッド
   */
  public isActuallyNursingInsuranceEligible(eligibility: InsuranceEligibilityResult | null | undefined): boolean {
    return !!eligibility?.healthInsurance && !!eligibility?.nursingInsurance;
  }
} 