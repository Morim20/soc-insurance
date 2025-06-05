import { Injectable } from '@angular/core';
import { EmployeeFullInfo } from '../models/employee.model';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';

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
    const monthlyWage = Number(employee.employmentInfo.baseSalary);

    // 正社員の場合
    if (employee.employmentInfo.employmentType === '正社員') {
      return true;
    }

    // パートの場合、通常社員の4分の3以上の労働時間
    if (employee.employmentInfo.employmentType === 'パート') {
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
    const monthlyWage = Number(employee.employmentInfo.baseSalary);
    const studentType = employee.employmentInfo.studentType;

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
    const monthlyWage = Number(employee.employmentInfo.baseSalary);
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

    // 事業所の従業員数が51人未満の場合は対象外
    const officeEmployeeCount = this.getOfficeEmployeeCount();
    if (officeEmployeeCount < 51) {
      return false;
    }

    // 休業中の場合は資格を維持
    if (this.isOnLeave(employee) && 
        ['育児休業', '産前産後休業', '介護休業'].includes(employee.specialAttributes.leaveType || '')) {
      return true;
    }

    // 学生の場合
    if (this.isStudent(employee)) {
      return this.isStudentEligibleForInsurance(employee);
    }

    // フルタイム従業員または短時間労働者の場合
    return this.isFullTimeEmployee(employee) || this.isShortTimeWorker(employee);
  }

  getInsuranceEligibility(employee: EmployeeFullInfo): Observable<any> {
    const age = this.calculateAge(employee.employeeBasicInfo.birthDate);
    const isFullTime = this.isFullTimeEmployee(employee);
    const isShortTime = this.isShortTimeWorker(employee);
    const isStudent = this.isStudent(employee);
    const isOnLeave = this.isOnLeave(employee);
    const leaveType = employee.specialAttributes.leaveType;
    const expectedEmploymentMonths = employee.employmentInfo.expectedEmploymentMonths;
    const weeklyHours = employee.employmentInfo.weeklyHours;
    const monthlyWorkDays = employee.employmentInfo.monthlyWorkDays;
    const monthlyWage = Number(employee.employmentInfo.baseSalary);

    return this.fetchOfficeEmployeeCount().pipe(
      map(officeEmployeeCount => {
        // 75歳以上は対象外（後期高齢者医療制度へ移行）
        if (age >= 75) {
          return {
            healthInsurance: false,
            nursingInsurance: false,
            pensionInsurance: false,
            reason: '75歳到達時に健康保険の資格を喪失します（後期高齢者医療制度へ移行）'
          };
        }

        // 70歳以上75歳未満
        if (age >= 70 && age < 75) {
          return {
            healthInsurance: true,
            nursingInsurance: false,
            pensionInsurance: false,
            reason: '70歳以上75歳未満の従業員は健康保険のみ加入対象です（厚生年金は70歳で資格喪失、介護保険は65歳で第2号被保険者から外れます）'
          };
        }

        // 65歳以上70歳未満
        if (age >= 65 && age < 70) {
          return {
            healthInsurance: true,
            nursingInsurance: false,
            pensionInsurance: true,
            reason: '65歳以上70歳未満の従業員は健康保険と厚生年金の加入対象です（介護保険は65歳で第2号被保険者から外れます）'
          };
        }

        // 育児・産前産後・介護休業中
        if (isOnLeave && ['育児休業', '産前産後休業', '介護休業'].includes(leaveType || '')) {
          return {
            healthInsurance: true,
            nursingInsurance: this.isEligibleForNursingInsurance(employee, age),
            pensionInsurance: true,
            reason: `${leaveType}中の従業員は社会保険の被保険者資格を維持します`
          };
        }

        // 学生の場合
        if (isStudent) {
          if (this.isStudentEligibleForInsurance(employee)) {
            return {
              healthInsurance: true,
              nursingInsurance: this.isEligibleForNursingInsurance(employee, age),
              pensionInsurance: true,
              reason: '正社員の4分の3以上の労働時間、または休学中・夜間学生等で週20時間以上・月収8.8万円以上の学生は社会保険の加入対象です（介護保険料は40歳以上で通常通り徴収）'
            };
          } else {
            return {
              healthInsurance: false,
              nursingInsurance: false,
              pensionInsurance: false,
              reason: '学生は原則として社会保険の適用除外となります（健康保険法第3条第9項ハ）'
            };
          }
        }

        // 4分の3基準を満たす場合（正社員・4分の3以上のパート等）
        if (isFullTime) {
          return {
            healthInsurance: true,
            nursingInsurance: this.isEligibleForNursingInsurance(employee, age),
            pensionInsurance: true,
            reason: '正社員または4分の3以上の労働時間・日数の従業員は従業員数に関係なく社会保険の加入対象です'
          };
        }

        // 4分の3未満の場合は5要件すべてを満たすか判定
        const meets5Requirements =
          weeklyHours >= 20 &&
          monthlyWage >= 88000 &&
          (
            expectedEmploymentMonths === undefined ||
            expectedEmploymentMonths === null ||
            (typeof expectedEmploymentMonths === 'string'
              ? Number(expectedEmploymentMonths) > 2
              : expectedEmploymentMonths > 2)
          ) &&
          !isStudent &&
          officeEmployeeCount >= 51;

        if (isShortTime && meets5Requirements) {
          return {
            healthInsurance: true,
            nursingInsurance: this.isEligibleForNursingInsurance(employee, age),
            pensionInsurance: true,
            reason: '短時間労働者（4分の3未満）で5要件すべてを満たす場合は社会保険の加入対象です'
          };
        }

        // 2ヶ月以内の短期雇用者の判定
        if (
          expectedEmploymentMonths !== undefined &&
          expectedEmploymentMonths !== null &&
          !(typeof expectedEmploymentMonths === 'string' && expectedEmploymentMonths === '')
        ) {
          const months = Number(expectedEmploymentMonths);
          if (!isNaN(months) && months <= 2) {
            return {
              healthInsurance: false,
              nursingInsurance: false,
              pensionInsurance: false,
              reason: '2ヶ月以内の短期雇用者は社会保険の適用除外となります'
            };
          }
        }

        // その他のケースは適用除外
        return {
          healthInsurance: false,
          nursingInsurance: false,
          pensionInsurance: false,
          reason: '社会保険の加入要件を満たしていません（4分の3未満かつ5要件をすべて満たさない場合は適用除外）'
        };
      })
    );
  }
} 