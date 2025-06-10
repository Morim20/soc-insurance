import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, serverTimestamp } from '@angular/fire/firestore';
import { Employee, EmployeeBasicInfo, EmploymentInfo, InsuranceStatus, Dependent, SpecialAttributes, EmployeeFullInfo } from '../models/employee.model';
import { Observable, from, map } from 'rxjs';
import { Timestamp } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private readonly COLLECTION_NAME = 'employees';
  private firestore = inject(Firestore);

  constructor() {}

  // TimestampをDateに変換するヘルパー関数
  private convertTimestampToDate(timestamp: any): Date | null {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    if (typeof timestamp === 'object' && 'seconds' in timestamp) return new Date(timestamp.seconds * 1000);
    return null;
  }

  // 従業員ドキュメントの作成（最小限）
  async createEmployee(employeeData: EmployeeFullInfo): Promise<void> {
    const employeeRef = doc(collection(this.firestore, this.COLLECTION_NAME));
    const employeeId = employeeRef.id;

    // 基本情報を保存
    await setDoc(doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/basicInfo/info`), {
      ...employeeData.employeeBasicInfo
    });

    // 雇用情報を保存
    await setDoc(doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/employmentInfo/info`), {
      ...employeeData.employmentInfo
    });

    // 社会保険情報を保存
    await setDoc(doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/insuranceStatus/info`), {
      ...employeeData.insuranceStatus
    });

    // 扶養者情報を保存
    if (employeeData.dependents.length > 0) {
      await setDoc(doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/dependents/info`), {
        dependents: employeeData.dependents
      });
    }

    // 特別属性を保存
    await setDoc(doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/specialAttributes/info`), {
      ...employeeData.specialAttributes
    });

    // 従業員の基本情報を保存
    await setDoc(employeeRef, {
      id: employeeId,
      companyId: employeeData.companyId,
      createdAt: employeeData.createdAt,
      updatedAt: employeeData.updatedAt
    });
  }

  // サブコレクションの作成
  async setBasicInfo(employeeId: string, basicInfo: EmployeeBasicInfo): Promise<void> {
    const subRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/basicInfo/info`);
    await setDoc(subRef, basicInfo);
  }
  async setEmploymentInfo(employeeId: string, employmentInfo: EmploymentInfo): Promise<void> {
    const subRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/employmentInfo/info`);
    await setDoc(subRef, employmentInfo);
  }
  async setInsuranceStatus(employeeId: string, insuranceStatus: InsuranceStatus): Promise<void> {
    const subRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/insuranceStatus/info`);
    await setDoc(subRef, insuranceStatus, { merge: true });
  }
  async setSpecialAttributes(employeeId: string, specialAttributes: SpecialAttributes): Promise<void> {
    const subRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/specialAttributes/info`);
    await setDoc(subRef, specialAttributes);
  }
  async setDependents(employeeId: string, dependents: Dependent[]): Promise<void> {
    const subRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/dependents/info`);
    await setDoc(subRef, { dependents });
  }

  // サブコレクションの取得
  async getBasicInfo(employeeId: string): Promise<EmployeeBasicInfo | null> {
    const docRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/basicInfo/info`);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as EmployeeBasicInfo;
    const birthDate = this.convertTimestampToDate(data.birthDate);
    return { ...data, birthDate };
  }

  async getEmploymentInfo(employeeId: string): Promise<EmploymentInfo | null> {
    const docRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/employmentInfo/info`);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as EmploymentInfo;
    const startDate = this.convertTimestampToDate(data.startDate);
    const endDate = this.convertTimestampToDate(data.endDate);
    return { ...data, startDate, endDate };
  }

  async getInsuranceStatus(employeeId: string): Promise<InsuranceStatus | null> {
    const docRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/insuranceStatus/info`);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as InsuranceStatus;
    const qualificationAcquisitionDate = this.convertTimestampToDate(data.qualificationAcquisitionDate);
    const qualificationLossDate = this.convertTimestampToDate(data.qualificationLossDate);
    const standardMonthlyRevisionDate = this.convertTimestampToDate(data.standardMonthlyRevisionDate);
    const insuranceQualificationDate = this.convertTimestampToDate(data.insuranceQualificationDate);
    return {
      ...data,
      qualificationAcquisitionDate,
      qualificationLossDate,
      standardMonthlyRevisionDate,
      insuranceQualificationDate
    };
  }

  async getSpecialAttributes(employeeId: string): Promise<SpecialAttributes | null> {
    const docRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/specialAttributes/info`);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as SpecialAttributes;
    const leaveStartDate = this.convertTimestampToDate(data.leaveStartDate);
    const leaveEndDate = this.convertTimestampToDate(data.leaveEndDate);
    const reached70Date = this.convertTimestampToDate(data.reached70Date);
    return { ...data, leaveStartDate, leaveEndDate, reached70Date };
  }

  async getDependents(employeeId: string): Promise<Dependent[]> {
    const docRef = doc(this.firestore, `${this.COLLECTION_NAME}/${employeeId}/dependents/info`);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return [];
    const data = docSnap.data() as { dependents: Dependent[] };
    return data.dependents.map(dep => ({
      ...dep,
      birthDate: this.convertTimestampToDate(dep.birthDate)
    }));
  }

  // 従業員ドキュメントの取得（最小限）
  async getEmployee(id: string): Promise<EmployeeFullInfo | null> {
    const docRef = doc(this.firestore, this.COLLECTION_NAME, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const docData = docSnap.data();
      const basicInfo = await this.getBasicInfo(id);
      if (!basicInfo) return null;
      const employmentInfo = await this.getEmploymentInfo(id);
      const insuranceStatus = await this.getInsuranceStatus(id);
      const dependents = await this.getDependents(id);
      const specialAttributes = await this.getSpecialAttributes(id);

      return {
        id,
        companyId: docData['companyId'],
        createdAt: this.convertTimestampToDate(docData['createdAt']),
        updatedAt: this.convertTimestampToDate(docData['updatedAt']),
        employeeBasicInfo: basicInfo,
        employmentInfo: employmentInfo ?? {} as any,
        insuranceStatus: insuranceStatus ?? {} as any,
        dependents: dependents ?? [],
        specialAttributes: specialAttributes ?? {} as any
      };
    }
    return null;
  }

  // 全従業員データの取得
  async getAllEmployees(): Promise<EmployeeFullInfo[]> {
    const employees: EmployeeFullInfo[] = [];
    const employeesRef = collection(this.firestore, this.COLLECTION_NAME);
    const querySnapshot = await getDocs(employeesRef);

    for (const doc of querySnapshot.docs) {
      const employeeId = doc.id;
      const basicInfo = await this.getBasicInfo(employeeId);
      if (!basicInfo) continue;
      const employmentInfo = await this.getEmploymentInfo(employeeId);
      const insuranceStatus = await this.getInsuranceStatus(employeeId);
      const dependents = await this.getDependents(employeeId);
      const specialAttributes = await this.getSpecialAttributes(employeeId);

      const docData = doc.data();
      employees.push({
        id: employeeId,
        companyId: docData['companyId'],
        createdAt: this.convertTimestampToDate(docData['createdAt']),
        updatedAt: this.convertTimestampToDate(docData['updatedAt']),
        employeeBasicInfo: basicInfo,
        employmentInfo: employmentInfo ?? {} as any,
        insuranceStatus: insuranceStatus ?? {} as any,
        dependents: dependents ?? [],
        specialAttributes: specialAttributes ?? {} as any
      });
    }

    return employees;
  }

  // 従業員データの更新
  updateEmployee(employeeId: string, formData: any): Observable<any> {
    const employeeRef = doc(this.firestore, this.COLLECTION_NAME, employeeId);
    const updateData = {
      ...formData,
      updatedAt: serverTimestamp()
    };

    return from(updateDoc(employeeRef, updateData));
  }

  // 従業員データの削除
  async deleteEmployee(id: string): Promise<void> {
    try {
      // サブコレクションの削除
      const subCollections = [
        'basicInfo',
        'employmentInfo',
        'insuranceStatus',
        'dependents',
        'specialAttributes'
      ];

      for (const subCollection of subCollections) {
        const subDocRef = doc(this.firestore, `${this.COLLECTION_NAME}/${id}/${subCollection}/info`);
        await deleteDoc(subDocRef);
      }

      // メインドキュメントの削除
      const docRef = doc(this.firestore, this.COLLECTION_NAME, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('従業員情報の削除に失敗しました:', error);
      throw error;
    }
  }

  // 会社名による従業員の検索
  async getEmployeesByCompany(companyName: string): Promise<Employee[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION_NAME),
      where('company.companyName', '==', companyName)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Employee);
  }

  // 雇用形態による従業員の検索
  async getEmployeesByEmploymentType(employmentType: string): Promise<Employee[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION_NAME),
      where('employmentInfo.employmentType', '==', employmentType)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Employee);
  }

  // ユーザー種別による従業員の検索
  async getEmployeesByRole(role: 'admin' | 'user'): Promise<Employee[]> {
    const q = query(
      collection(this.firestore, this.COLLECTION_NAME),
      where('basicInfo.role', '==', role)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Employee);
  }

  // 管理者ユーザーのみを取得
  async getAdminUsers(): Promise<Employee[]> {
    return this.getEmployeesByRole('admin');
  }

  // 一般ユーザーのみを取得
  async getRegularUsers(): Promise<Employee[]> {
    return this.getEmployeesByRole('user');
  }

  // 部署名の一覧を取得
  async getDepartments(): Promise<string[]> {
    const settingsRef = doc(this.firestore, 'settings', 'office');
    const settingsDoc = await getDoc(settingsRef);
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      return data['departments'] || [];
    }
    return [];
  }

  async getInsuranceDetail(employeeId: string, period: { year: number, month: number }): Promise<any | null> {
    const periodId = `${period.year}_${('0' + period.month).slice(-2)}`;
    const ref = doc(this.firestore, 'insuranceDetails', periodId, 'employee', employeeId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  }

  async saveInsuranceDetail(employeeId: string, period: { year: number, month: number }, detail: any): Promise<void> {
    const periodId = `${period.year}_${('0' + period.month).slice(-2)}`;
    const ref = doc(this.firestore, 'insuranceDetails', periodId, 'employee', employeeId);
    const saveData = {
      employeeId,
      ...detail,
      nursingInsuranceEmployee: detail.nursingInsuranceEmployee || 0,
      nursingInsuranceEmployer: detail.nursingInsuranceEmployer || 0
    };
    await setDoc(ref, saveData);
  }
} 