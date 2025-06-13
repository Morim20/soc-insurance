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
    if (isNaN(birth.getTime())) return false;

    // 介護保険開始月の計算
    let startYear = birth.getFullYear() + 40;
    let startMonth = birth.getMonth() + 1;
    const day = birth.getDate();
    if (day === 1) {
      // 1日生まれは前月
      startMonth -= 1;
      if (startMonth === 0) {
        startMonth = 12;
        startYear -= 1;
      }
    }
    // 終了月（65歳到達月の前月）
    let endYear = birth.getFullYear() + 65;
    let endMonth = birth.getMonth() + 1;
    if (day === 1) {
      endMonth -= 2;
      if (endMonth <= 0) {
        endMonth += 12;
        endYear -= 1;
      }
    } else {
      endMonth -= 1;
      if (endMonth === 0) {
        endMonth = 12;
        endYear -= 1;
      }
    }
    const currentYm = year * 100 + month;
    const startYm = startYear * 100 + startMonth;
    const endYm = endYear * 100 + endMonth;
    return currentYm >= startYm && currentYm <= endYm;
  }

  /**
   * 指定年月時点で厚生年金の対象かどうかを判定
   */
  private isPensionInsuranceEligibleAt(birthDate: Date | string | null, year: number, month: number): boolean {
    if (!birthDate) return false;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return false;

    const targetYear = birth.getFullYear() + 70;
    const targetMonth = birth.getMonth() + 1; // 1-based month

    // 1日生まれの場合、前月末日が資格喪失日
    if (birth.getDate() === 1) {
      if (targetMonth === 1) {
        return year < targetYear - 1 || (year === targetYear - 1 && month <= 12);
      } else {
        return year < targetYear || (year === targetYear && month < targetMonth);
      }
    } else {
      // 1日以外の場合、誕生日の前日が属する月
      if (birth.getDate() === 2) {
        if (targetMonth === 1) {
          return year < targetYear - 1 || (year === targetYear - 1 && month <= 12);
        } else {
          return year < targetYear || (year === targetYear && month < targetMonth);
        }
      } else {
        return year < targetYear || (year === targetYear && month <= targetMonth);
      }
    }
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
      // 厚生年金は70歳到達月の前月末日で喪失
      const pensionEligible = this.isPensionInsuranceEligibleAt(birthDate, currentYear, currentMonth);
      return {
        healthInsurance: true,
        nursingInsurance: false, // 65歳で介護保険は終了
        pensionInsurance: pensionEligible,
        reason: pensionEligible ?
          '70歳以上75歳未満は健康保険・厚生年金加入対象（介護保険は65歳で終了、厚生年金は70歳到達月の前月末日まで）' :
          '70歳到達により厚生年金資格喪失。健康保険のみ加入対象（介護保険は65歳で終了済み）'
      };
    }

    // 65歳以上70歳未満の判定
    if (age >= 65) {
      return {
        healthInsurance: true,
        nursingInsurance: false, // 65歳で介護保険は終了
        pensionInsurance: true,
        reason: '65歳以上70歳未満は健康保険・厚生年金加入対象（介護保険は65歳到達月の前月末日で終了）'
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
    const birthDay = birth.getDate();

    // 75歳到達判定（誕生日当日で喪失）
    if (year > targetYear) {
      return false;
    }
    if (year === targetYear) {
      if (month > targetMonth) {
        return false;
      }
      if (month === targetMonth) {
        // 誕生日当日で喪失
        const currentDate = new Date(year, month - 1, birthDay);
        const targetDate = new Date(targetYear, targetMonth - 1, birthDay);
        return currentDate < targetDate;
      }
    }

    return true;
  }

  getInsuranceEligibility(employee: EmployeeFullInfo, targetYear: number, targetMonth: number): Observable<InsuranceEligibilityResult> {
    const age = this.calculateAge(employee.employeeBasicInfo.birthDate);
    const isFullTime = this.isFullTimeEmployee(employee);
    const isShortTime = this.isShortTimeWorker(employee);
    const isStudent = this.isStudent(employee);
    const isStudentEligible = this.isStudentEligibleForInsurance(employee);
    const isOnLeave = this.isOnLeave(employee);
    const isOnMaternityOrChildcareLeave = this.isOnMaternityOrChildcareLeave(employee);
    const isOnCareLeave = this.isOnCareLeave(employee);

    const weeklyHours = Number(employee.employmentInfo.weeklyHours) || 0;
    const monthlyWorkDays = Number(employee.employmentInfo.monthlyWorkDays) || 0;
    const monthlyWage =
      (Number(employee.employmentInfo.baseSalary) || 0) +
      (Number(employee.employmentInfo.allowances) || 0) +
      (Number(employee.employmentInfo.commutingAllowance) || 0);
    const expectedEmploymentMonths = Number(employee.employmentInfo.expectedEmploymentMonths);
    const studentType = employee.employmentInfo.studentType || '';

    // 介護保険の開始・終了月を計算
    const nursingInsuranceStartMonth = this.calculateAgeReachMonth(employee.employeeBasicInfo.birthDate, 40);
    const nursingInsuranceEndMonth = this.calculateAgeReachMonth(employee.employeeBasicInfo.birthDate, 65);

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

        // 退職日の判定
        if (employee.employmentInfo.endDate) {
          const endDate = new Date(employee.employmentInfo.endDate);
          const targetDate = new Date(targetYear, targetMonth - 1, 1);
          const endOfMonth = new Date(targetYear, targetMonth, 0);

          // 1日退職の特殊ケース
          if (endDate.getDate() === 1) {
            // 退職日の前月が対象月の場合、その月は資格喪失
            const previousMonth = new Date(endDate);
            previousMonth.setMonth(previousMonth.getMonth() - 1);
            if (previousMonth.getFullYear() === targetYear && previousMonth.getMonth() + 1 === targetMonth) {
              result.reason = '1日退職のため前月で資格喪失';
              return result;
            }
          }

          // 退職月の判定
          if (endDate.getFullYear() === targetYear && endDate.getMonth() + 1 === targetMonth) {
            // 退職月は在籍月として扱う（1日退職を除く）
            result.healthInsurance = true;
            result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
            result.pensionInsurance = true;
            result.reason = `${targetYear}年${targetMonth}月は在籍月のため保険料発生（退職日: ${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()}）`;
            return result;
          }

          // 退職日の翌月以降は資格喪失
          const nextMonth = new Date(endDate);
          nextMonth.setMonth(nextMonth.getMonth() + 1);
          if (nextMonth.getFullYear() === targetYear && nextMonth.getMonth() + 1 === targetMonth) {
            result.reason = `${targetYear}年${targetMonth}月は退職翌月のため資格喪失（退職日: ${endDate.getFullYear()}/${endDate.getMonth() + 1}/${endDate.getDate()}）`;
            return result;
          }
        }

        // 見込み雇用期間の判定
        if (employee.employmentInfo.expectedEmploymentMonths && employee.employmentInfo.startDate) {
          const startDate = new Date(employee.employmentInfo.startDate);
          const expectedEndDate = new Date(startDate);
          expectedEndDate.setMonth(expectedEndDate.getMonth() + employee.employmentInfo.expectedEmploymentMonths);
          
          // 見込み雇用期間が対象月の末日以前の場合、資格喪失
          if (expectedEndDate <= new Date(targetYear, targetMonth, 0)) {
            result.reason = `${targetYear}年${targetMonth}月は見込み雇用期間終了により資格喪失`;
            return result;
          }

          // 見込み雇用期間が2か月以下の場合、加入対象外
          if (employee.employmentInfo.expectedEmploymentMonths <= 2) {
            result.reason = '見込み雇用期間が2か月以下のため加入対象外';
            return result;
          }
        }

        // 1. 年齢による除外
        const birthDate = employee.employeeBasicInfo.birthDate;
        if (birthDate) {
          const isHealthInsuranceEligible = this.isHealthInsuranceEligibleAt(birthDate, targetYear, targetMonth);
          if (!isHealthInsuranceEligible) {
            result.reason = '75歳到達時に健康保険の資格を喪失します（後期高齢者医療制度へ移行）';
            return result;
          }
        }

        if (age >= 70) {
          result.healthInsurance = true;
          result.pensionInsurance = false;
          result.nursingInsurance = false;
          result.reason = '70歳以上75歳未満は健康保険のみ加入対象（厚生年金は70歳で資格喪失）';
          return result;
        }
        if (age >= 65) {
          result.healthInsurance = true;
          result.pensionInsurance = true;
          result.nursingInsurance = false;
          result.reason = '65歳以上70歳未満は健康保険・厚生年金加入対象（介護保険は65歳で終了）';
          return result;
        }

        // 2. 適用除外（優先判定）
        if (officeEmployeeCount < 5) {
          result.reason = '従業員が5人未満のため、社会保険（健康保険・厚生年金・介護保険）の加入義務はありません（任意適用事業所を除く）';
          return result;
        }

        // ★育休・産休の判定を最優先に
        if (isOnMaternityOrChildcareLeave) {
          // 免除期間の自動判定
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
              // その月の1日と末日
              const monthStart = new Date(year, month, 1);
              const monthEnd = new Date(year, month + 1, 0);
              // 休業期間とその月の重なり部分
              const overlapStart = current > monthStart ? current : monthStart;
              const overlapEnd = end < monthEnd ? end : monthEnd;
              const days = Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              if (days >= 14) {
                fourteenDayRuleMonths.push(`${year}-${String(month + 1).padStart(2, '0')}`);
              }
              // 次の月へ
              current = new Date(year, month + 1, 1);
            }
          }

          result.healthInsurance = true;
          result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
          result.pensionInsurance = true;
          result.reason = '育児・産前産後休業中は被保険者資格継続（事業主申請により本人・会社負担分とも全額免除）。\n' +
            '休業開始月から終了日の翌月前月まで社会保険料（健康・年金・介護）が免除されます。\n' +
            '育休は各月ごとに14日以上取得すればその月全体が免除対象です（令和4年10月〜）。\n' +
            (fourteenDayRuleMonths.length > 0 ? `【14日ルール自動判定】${fourteenDayRuleMonths.join(', ')}は14日以上取得のため月全体が免除対象です。\n` : '') +
            '賞与支払月が休業期間に該当すれば賞与も免除されます。\n' +
            '給与天引きの免除反映は制度上1か月遅れます。';
          // 必要に応じて免除期間情報も返却
          (result as any).insuranceExemptionStartMonth = exemptionStartMonth;
          (result as any).insuranceExemptionEndMonth = exemptionEndMonth;
          if (fourteenDayRuleMonths.length > 0) {
            (result as any).insuranceExemptionFourteenDayRuleMonths = fourteenDayRuleMonths;
          }

          // 賞与免除月の判定例（画面やAPIから賞与支給日配列を受け取る想定）
          const bonusPaymentDates: Date[] = (employee.specialAttributes?.bonusPaymentDates || []).map((d: string) => new Date(d));
          let bonusExemptionMonths: string[] = [];
          if (bonusPaymentDates.length > 0 && leaveStart && leaveEnd) {
            bonusExemptionMonths = this.getBonusExemptionMonths(bonusPaymentDates, leaveStart, leaveEnd);
          }
          result.reason += (bonusExemptionMonths.length > 0
            ? `賞与支給月（${bonusExemptionMonths.join(', ')}）の末日が1か月を超える連続した休業期間に含まれているため、当月の賞与も社会保険料免除対象です。\n`
            : '賞与支給月の末日が休業期間外、または休業期間が1か月以内のため、当月の賞与は社会保険料免除対象外です。\n');
          if (bonusExemptionMonths.length > 0) {
            (result as any).insuranceExemptionBonusMonths = bonusExemptionMonths;
          }
          return result;
        }

        // 3. 学生の判定（優先度を上げる）
        if (isStudent) {
          // 昼間学生の場合
          if (['大学', '高校', '専門学校', 'その他学校'].includes(studentType)) {
            if (isFullTime) {
              result.healthInsurance = true;
              result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
              result.pensionInsurance = true;
              result.reason = '昼間学生ですが、週所定労働時間・月労働日数が正社員の4分の3以上のため社会保険加入義務があります（健康保険法第3条第9項ハ但書）';
              return result;
            } else {
              result.reason = '昼間学生（大学・高校・専門学校・その他学校）は原則社会保険適用除外です（健康保険法第3条第9項ハ）。給与からの控除も不要です。';
              return result;
            }
          }

          // 夜間学生・休学中・通信制の場合
          if (['夜間学生', '休学中', '通信制'].includes(studentType)) {
            if (weeklyHours >= 20 && monthlyWage >= 88000) {
              result.healthInsurance = true;
              result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
              result.pensionInsurance = true;
              result.reason = '夜間学生・休学中・通信制で、週20時間以上かつ月給8.8万円以上のため社会保険加入対象です';
              return result;
            } else {
              result.reason = '夜間学生・休学中・通信制ですが、週20時間未満または月給8.8万円未満のため社会保険適用除外です';
              return result;
            }
          }
        }

        // 4. 休業中の判定
        if (isOnCareLeave) {
          result.healthInsurance = true;
          result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
          result.pensionInsurance = true;
          result.reason = '介護休業中は被保険者資格継続（保険料免除なし）。休業中も通常どおり保険料が発生します（給与が無くても支払義務あり）';
          return result;
        }

        // 5. フルタイム（正社員・4分の3要件パート）
        if (isFullTime) {
          result.healthInsurance = true;
          result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
          result.pensionInsurance = true;
          result.reason = 'フルタイム従業員（または4分の3要件を満たすパート）として社会保険加入対象です';
          return result;
        }

        // 6. パート・短時間労働者の5要件判定
        const isPartOrArubaito = ['パート', 'アルバイト'].includes(employee.employmentInfo.employmentType);
        const hasEnoughWeeklyHours = weeklyHours >= 20;
        const hasEnoughWage = monthlyWage >= 88000;
        const hasLongTermEmployment = isNaN(expectedEmploymentMonths) || expectedEmploymentMonths > 2;
        const hasEnoughEmployeeCount = officeEmployeeCount >= 51;

        if (
          isPartOrArubaito &&
          hasEnoughWeeklyHours &&
          hasEnoughWage &&
          hasLongTermEmployment &&
          hasEnoughEmployeeCount
        ) {
            result.healthInsurance = true;
          result.nursingInsurance = this.isEligibleForNursingInsurance(employee, age);
            result.pensionInsurance = true;
          result.reason = 'パート・短時間労働者で5要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）をすべて満たすため社会保険加入対象です';
            return result;
          }

        // 7. 2ヶ月以内契約の適用除外判定
        if (expectedEmploymentMonths === 1 || expectedEmploymentMonths === 2) {
          result.reason = '2ヶ月以内契約（雇用見込み期間が1または2ヶ月）のため社会保険適用除外です（更新予定・実績があれば要再判定）';
          return result;
        }

        // 8. その他
        result.reason = '社会保険の適用要件（週20時間以上・月給8.8万円以上・雇用見込み2ヶ月超・従業員51人以上）を満たさないため対象外です';
        return result;
      }),
      catchError(error => {
        console.error('社会保険加入判定エラー:', error);
        return of({
          healthInsurance: false,
          nursingInsurance: false,
          pensionInsurance: false,
          reason: '判定処理中にエラーが発生しました',
          nursingInsuranceStartMonth: nursingInsuranceStartMonth ?? undefined,
          nursingInsuranceEndMonth: nursingInsuranceEndMonth ?? undefined
        });
      })
    );
  }
}