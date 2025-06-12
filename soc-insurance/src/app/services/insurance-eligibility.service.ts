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

  private getOfficeEmployeeCount(): number {
    return 0;
  }

  calculateAge(birthDate: Date | null): number {
    if (!birthDate) return 0;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
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

    console.log('[isShortTimeWorker] weeklyHours:', weeklyHours, 'monthlyWage:', monthlyWage, 'expectedEmploymentMonths:', expectedEmploymentMonths, 'isStudent:', isStudent);

    // 学生の場合は短時間労働者としての判定対象外
    if (isStudent) {
      console.log('[isShortTimeWorker] 学生のため対象外');
      return false;
    }

    const hasEnoughHours = weeklyHours >= 20;
    const hasEnoughWage = monthlyWage >= 88000;
    const hasLongTermEmployment = isNaN(expectedEmploymentMonths) || expectedEmploymentMonths > 2;

    console.log('[isShortTimeWorker] hasEnoughHours:', hasEnoughHours, 'hasEnoughWage:', hasEnoughWage, 'hasLongTermEmployment:', hasLongTermEmployment);

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

  private isEligibleForNursingInsurance(employee: EmployeeFullInfo, age: number): boolean {
    // 65歳以上は介護保険の対象外（第2号被保険者から外れる）
    if (age >= 65) {
      return false;
    }

    // 40歳未満は対象外
    if (age < 40) {
      return false;
    }

    // 年齢のみで判定（従業員数や他の条件は考慮しない）
    return true;
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
    const targetYear = birth.getFullYear() + targetAge;
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
    // 65歳到達月の前月まで
    if (birth.getDate() === 1) {
      // 1日生まれの場合、65歳到達は前月なので、その前月（つまり2ヶ月前）まで
      if (targetMonth <= 2) {
        return `${targetYear - 1}-${String(targetMonth + 10).padStart(2, '0')}`;
      } else {
        return `${targetYear}-${String(targetMonth - 2).padStart(2, '0')}`;
      }
    } else {
      // 1日以外の場合、65歳到達月の前月まで
      if (targetMonth === 1) {
        return `${targetYear - 1}-12`;
      } else {
        return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
      }
    }
  }

  /**
   * 厚生年金の終了月計算を追加（70歳到達月の前月まで）
   * @param birthDate 生年月日
   * @returns YYYY-MM形式の文字列
   */
  private calculatePensionInsuranceEndMonth(birthDate: Date | null | string): string | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const targetYear = birth.getFullYear() + 70;
    const targetMonth = birth.getMonth() + 1; // 1-based month
    // 70歳到達月の前月まで
    if (birth.getDate() === 1) {
      // 1日生まれの場合、70歳到達は前月なので、その前月（つまり2ヶ月前）まで
      if (targetMonth <= 2) {
        return `${targetYear - 1}-${String(targetMonth + 10).padStart(2, '0')}`;
      } else {
        return `${targetYear}-${String(targetMonth - 2).padStart(2, '0')}`;
      }
    } else {
      // 1日以外の場合、70歳到達月の前月まで
      if (targetMonth === 1) {
        return `${targetYear - 1}-12`;
      } else {
        return `${targetYear}-${String(targetMonth - 1).padStart(2, '0')}`;
      }
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
   * @param leaveStart 休業開始日
   * @param leaveEnd 休業終了日
   * @returns 免除対象となる賞与支給月リスト
   */
  getBonusExemptionMonths(bonusPaymentDates: Date[], leaveStart: Date, leaveEnd: Date): string[] {
    const result: string[] = [];
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
    if (!birthDate) return false;
    const birth = new Date(birthDate);
    // 介護保険の開始月
    let startYear = birth.getFullYear() + 40;
    let startMonth = birth.getMonth() + 1;
    if (birth.getDate() === 1) {
      startMonth -= 1;
      if (startMonth === 0) {
        startYear -= 1;
        startMonth = 12;
      }
    }
    // 終了月（65歳到達月の前月まで）
    let endYear = birth.getFullYear() + 65;
    let endMonth = birth.getMonth();
    if (birth.getDate() === 1) {
      endMonth -= 1;
      if (endMonth === 0) {
        endYear -= 1;
        endMonth = 12;
      }
    }
    // 対象年月
    const ym = year * 100 + month;
    const startYm = startYear * 100 + startMonth;
    const endYm = endYear * 100 + endMonth;
    return ym >= startYm && ym <= endYm;
  }

  /**
   * 指定年月時点で厚生年金の対象かどうかを判定
   */
  private isPensionInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    if (!birthDate) return false;
    const birth = new Date(birthDate);
    // 終了月（70歳到達月の前月分まで）
    let endYear = birth.getFullYear() + 70;
    let endMonth = birth.getMonth();
    if (birth.getDate() === 1) {
      endMonth -= 1;
      if (endMonth === 0) {
        endYear -= 1;
        endMonth = 12;
      }
    }
    const ym = year * 100 + month;
    const endYm = endYear * 100 + endMonth;
    return ym <= endYm;
  }

  // 年齢による保険適用判定を厳密化
  private checkInsuranceEligibilityByAge(employee: EmployeeFullInfo, age: number): { healthInsurance: boolean, nursingInsurance: boolean, pensionInsurance: boolean, reason: string } | null {
    const birthDate = employee.employeeBasicInfo.birthDate;
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    // 75歳以上は健康保険も対象外
    if (age >= 75) {
      return {
        healthInsurance: false,
        nursingInsurance: false,
        pensionInsurance: false,
        reason: '75歳到達時に健康保険の資格を喪失します（後期高齢者医療制度へ移行）'
      };
    }
    // 70歳以上75歳未満の判定
    if (age >= 70) {
      // 厚生年金は70歳到達月から対象外
      const pensionEligible = this.isPensionInsuranceEligibleAt(birthDate, currentYear, currentMonth);
      return {
        healthInsurance: true,
        nursingInsurance: false, // 65歳で介護保険は終了
        pensionInsurance: pensionEligible,
        reason: pensionEligible ?
          '70歳以上75歳未満は健康保険・厚生年金加入対象（介護保険は65歳で終了、厚生年金は70歳到達月まで）' :
          '70歳到達により厚生年金資格喪失。健康保険のみ加入対象（介護保険は65歳で終了済み）'
      };
    }
    // 65歳以上70歳未満の判定
    if (age >= 65) {
      return {
        healthInsurance: true,
        nursingInsurance: false, // 65歳で介護保険は終了
        pensionInsurance: true,
        reason: '65歳以上70歳未満は健康保険・厚生年金加入対象（介護保険は65歳到達月で終了）'
      };
    }
    return null; // 65歳未満は通常の判定を継続
  }

  getInsuranceEligibility(employee: EmployeeFullInfo, year: number, month: number): Observable<InsuranceEligibilityResult> {
    const age = this.calculateAge(employee.employeeBasicInfo.birthDate);
    // 介護保険の開始・終了月を正しく計算
    const nursingInsuranceStartMonth = this.calculateAgeReachMonth(employee.employeeBasicInfo.birthDate, 40);
    const nursingInsuranceEndMonth = this.calculateNursingInsuranceEndMonth(employee.employeeBasicInfo.birthDate);
    return this.fetchOfficeEmployeeCount().pipe(
      map(officeEmployeeCount => {
        const result: InsuranceEligibilityResult = {
          healthInsurance: false,
          nursingInsurance: false,
          pensionInsurance: false,
          reason: '',
          nursingInsuranceStartMonth,
          nursingInsuranceEndMonth
        };
        // 年齢による判定を最初に実行
        const ageBasedEligibility = this.checkInsuranceEligibilityByAge(employee, age);
        if (ageBasedEligibility) {
          return { ...result, ...ageBasedEligibility };
        }
        // 65歳未満の場合は従来のロジックを復元
        const isFullTime = this.isFullTimeEmployee(employee);
        const isShortTime = this.isShortTimeWorker(employee);
        const isStudent = this.isStudent(employee);
        const isStudentEligible = this.isStudentEligibleForInsurance(employee);
        const weeklyHours = Number(employee.employmentInfo.weeklyHours) || 0;
        const monthlyWorkDays = Number(employee.employmentInfo.monthlyWorkDays) || 0;
        const monthlyWage =
          (Number(employee.employmentInfo.baseSalary) || 0) +
          (Number(employee.employmentInfo.allowances) || 0) +
          (Number(employee.employmentInfo.commutingAllowance) || 0);
        const expectedEmploymentMonths = Number(employee.employmentInfo.expectedEmploymentMonths);
        const isPartOrArubaito = ['パート', 'アルバイト'].includes(employee.employmentInfo.employmentType);
        const studentType = employee.employmentInfo.studentType || '';
        const isDaytimeStudent = ['大学', '高校', '専門学校', 'その他学校'].includes(studentType);
        const hasEnoughWeeklyHours = weeklyHours >= 20;
        const hasEnoughWage = monthlyWage >= 88000;
        const hasLongTermEmployment = isNaN(expectedEmploymentMonths) || expectedEmploymentMonths > 2;
        const hasEnoughEmployeeCount = officeEmployeeCount >= 51;
        // 介護保険の判定は引数の年月で
        const nursingInsuranceEligible = this.isNursingInsuranceEligibleAt(
          employee.employeeBasicInfo.birthDate,
          year,
          month
        );
        // フルタイム（正社員・4分の3要件パート）
        if (isFullTime) {
          result.healthInsurance = true;
          result.pensionInsurance = true;
          result.nursingInsurance = nursingInsuranceEligible;
          result.reason = 'フルタイム従業員（または4分の3要件を満たすパート）として社会保険加入対象です';
          return result;
        }
        // パート・短時間労働者の5要件判定
        if (
          isPartOrArubaito &&
          hasEnoughWeeklyHours &&
          hasEnoughWage &&
          hasLongTermEmployment &&
          hasEnoughEmployeeCount
        ) {
          if (isDaytimeStudent) {
            result.reason = '昼間学生（大学・高校・専門学校・その他学校）は短時間労働者の社会保険適用拡大の対象外です';
            return result;
          } else {
            result.healthInsurance = true;
            result.pensionInsurance = true;
            result.nursingInsurance = nursingInsuranceEligible;
            result.reason = 'パート・短時間労働者（夜間学校・休学中・卒業見込含む）で5要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）をすべて満たすため社会保険加入対象です';
            return result;
          }
        }
        // 学生（昼間学生）で適用除外（ただし4分の3要件を満たす場合は加入対象）
        if (isDaytimeStudent) {
          if (isFullTime) {
            result.healthInsurance = true;
            result.pensionInsurance = true;
            result.nursingInsurance = nursingInsuranceEligible;
            result.reason = '昼間学生ですが、週所定労働時間・月労働日数が正社員の4分の3以上のため社会保険加入義務があります（健康保険法第3条第9項ハ但書）';
            return result;
          } else {
            result.reason = '昼間学生（大学・高校・専門学校・その他学校）は原則社会保険適用除外です（健康保険法第3条第9項ハ）。給与からの控除も不要です。';
            return result;
          }
        }
        // 2ヶ月以内契約の適用除外判定
        if (expectedEmploymentMonths === 1 || expectedEmploymentMonths === 2) {
          return {
            healthInsurance: false,
            nursingInsurance: false,
            pensionInsurance: false,
            reason: '2ヶ月以内契約（雇用見込み期間が1または2ヶ月）のため社会保険適用除外です（更新予定・実績があれば要再判定）',
            nursingInsuranceStartMonth,
            nursingInsuranceEndMonth
          };
        }
        // その他
        result.reason = '社会保険の適用要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）を満たさないため対象外です';
        return result;
      })
    );
  }
} 