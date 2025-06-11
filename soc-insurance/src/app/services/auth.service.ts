import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, getDocs, query, where, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Auth, signInWithEmailAndPassword, UserCredential, createUserWithEmailAndPassword } from '@angular/fire/auth';
import { Employee, EmployeeBasicInfo, EmploymentInfo, InsuranceStatus, SpecialAttributes } from '../models/employee.model';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { EmployeeService } from './employee.service';
import * as CryptoJS from 'crypto-js';

function convertUndefinedToNull(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertUndefinedToNull);
  } else if (obj && typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      newObj[key] = value === undefined ? null : convertUndefinedToNull(value);
    }
    return newObj;
  }
  return obj;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<Employee | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private auth = inject(Auth);
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private employeeService = inject(EmployeeService);
  private adminVerificationToken: string | null = null;

  constructor(
    private router: Router
  ) {}

  async register(email: string, password: string, lastName: string, firstName: string): Promise<boolean> {
    return runInInjectionContext(this.injector, async () => {
      try {
        const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
        const uid = userCredential.user.uid;

        // 既存の従業員basicInfoサブコレクションに同じメールアドレスがあるか検索
        const employeesRef = collection(this.firestore, 'employees');
        const snapshot = await getDocs(employeesRef);
        let matchedEmployeeId: string | null = null;
        for (const docSnap of snapshot.docs) {
          const empId = docSnap.id;
          const basicInfoRef = doc(this.firestore, `employees/${empId}/basicInfo/info`);
          const basicInfoSnap = await getDoc(basicInfoRef);
          if (basicInfoSnap.exists() && basicInfoSnap.data()['email'] === email) {
            matchedEmployeeId = empId;
            break;
          }
        }

        if (matchedEmployeeId) {
          // 既存従業員IDのドキュメントIDを新しいuidに変更（データ移行）
          // 1. 既存従業員データを取得
          const oldDocRef = doc(this.firestore, 'employees', matchedEmployeeId);
          const oldDocSnap = await getDoc(oldDocRef);
          if (oldDocSnap.exists()) {
            const oldData = oldDocSnap.data();
            // 2. 新しいuidでドキュメント作成
            await setDoc(doc(this.firestore, 'employees', uid), { ...oldData, id: uid });
            // 3. サブコレクションもコピー（basicInfo, employmentInfo, insuranceStatus, dependents, specialAttributes）
            const subCollections = ['basicInfo', 'employmentInfo', 'insuranceStatus', 'dependents', 'specialAttributes'];
            for (const sub of subCollections) {
              const subRef = doc(this.firestore, `employees/${matchedEmployeeId}/${sub}/info`);
              const subSnap = await getDoc(subRef);
              if (subSnap.exists()) {
                await setDoc(doc(this.firestore, `employees/${uid}/${sub}/info`), subSnap.data());
              }
            }
            // insuranceDetailsサブコレクションも全件コピー
            const insuranceDetailsRef = collection(this.firestore, `employees/${matchedEmployeeId}/insuranceDetails`);
            const insuranceDetailsSnap = await getDocs(insuranceDetailsRef);
            for (const docSnap of insuranceDetailsSnap.docs) {
              await setDoc(doc(this.firestore, `employees/${uid}/insuranceDetails/${docSnap.id}`), docSnap.data());
            }
            // 4. 旧従業員ドキュメントは削除しない（安全のため）
          }
        } else {
          // 新規従業員として作成
          const employee: Employee = {
            id: uid,
            companyId: '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await setDoc(doc(this.firestore, 'employees', uid), convertUndefinedToNull(employee));
          // basicInfoサブコレクション
          const basicInfo: EmployeeBasicInfo = {
            employeeId: '',
            lastNameKanji: lastName,
            firstNameKanji: firstName,
            lastNameKana: '',
            firstNameKana: '',
            lastNameRoman: '',
            firstNameRoman: '',
            birthDate: null,
            hireDate: new Date(),
            gender: '',
            address: '',
            myNumber: '',
            phoneNumber: '',
            role: 'user',
          };
          await this.employeeService.setBasicInfo(uid, convertUndefinedToNull(basicInfo) as EmployeeBasicInfo);
        }
        return true;
      } catch (error) {
        console.error('登録エラー:', error);
        return false;
      }
    });
  }

  async login(email: string, password: string): Promise<boolean> {
    return runInInjectionContext(this.injector, async () => {
      try {
        const userCredential: UserCredential = await signInWithEmailAndPassword(this.auth, email, password);
        const uid = userCredential.user.uid;
        // Firestoreから最小限のEmployee情報を取得
        const userDocRef = doc(this.firestore, 'employees', uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data() as Employee;
          userData.id = uid;
          this.currentUserSubject.next(userData);
          return true;
        }
        return false;
      } catch (error) {
        console.error('ログインエラー:', error);
        return false;
      }
    });
  }

  logout(): void {
    this.currentUserSubject.next(null);
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return this.currentUserSubject.value !== null;
  }

  getCurrentUser(): Employee | null {
    return this.currentUserSubject.value;
  }

  async verifyAdminAccess(verificationCode: string): Promise<boolean> {
    const user = this.currentUserSubject.value;
    if (!user || !user.id) return false;

    const basicInfo = await this.employeeService.getBasicInfo(user.id);
    if (basicInfo?.role !== 'admin') return false;

    // 管理者専用の検証コードを確認
    const adminDocRef = doc(this.firestore, 'admin_security', user.id);
    const adminDoc = await getDoc(adminDocRef);
    
    if (!adminDoc.exists()) return false;
    
    const adminData = adminDoc.data();
    const hashedCode = CryptoJS.SHA256(verificationCode).toString();
    
    return adminData['verificationCode'] === hashedCode;
  }

  async generateAdminVerificationCode(): Promise<string> {
    const user = this.currentUserSubject.value;
    if (!user || !user.id) throw new Error('ユーザーが認証されていません');

    // 管理者権限の確認を削除し、認証コードを生成
    const verificationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hashedCode = CryptoJS.SHA256(verificationCode).toString();

    await setDoc(doc(this.firestore, 'admin_security', user.id), {
      verificationCode: hashedCode,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5分間有効
    });

    return verificationCode;
  }

  async isAdmin(): Promise<boolean> {
    const user = this.currentUserSubject.value;
    if (user && user.id) {
      const basicInfo = await this.employeeService.getBasicInfo(user.id);
      return !!basicInfo && basicInfo.role === 'admin';
    }
    return false;
  }

  async updateUserInfo(uid: string, data: Partial<Employee>): Promise<void> {
    const userDocRef = doc(this.firestore, 'employees', uid);
    await setDoc(userDocRef, { ...data, updatedAt: new Date() }, { merge: true });
    // ローカルのcurrentUserも更新
    const updatedUser = { ...this.currentUserSubject.value, ...data, updatedAt: new Date() };
    this.currentUserSubject.next(updatedUser as Employee);
  }

  async verifyAdminLogin(adminCode: string, secretKey: string): Promise<boolean> {
    return runInInjectionContext(this.injector, async () => {
      try {
        if (adminCode === 'kanrisha' && secretKey === 'kanrisha') {
          let user = this.currentUserSubject.value;
          console.log('admin login: currentUser =', user);
          if (!user || !user.id || user.id === '') {
            console.log('admin login: currentUser is null or id is empty');
            return false;
          }
          console.log('admin login: currentUser.id =', user.id);
          const targetId = user.id;
          console.log('admin login: setBasicInfo targetId =', targetId);
          let basicInfo = await this.employeeService.getBasicInfo(targetId);
          if (!basicInfo) {
            basicInfo = {
              employeeId: targetId,
              lastNameKanji: '',
              firstNameKanji: '',
              lastNameKana: '',
              firstNameKana: '',
              lastNameRoman: '',
              firstNameRoman: '',
              birthDate: null,
              hireDate: new Date(),
              gender: '',
              address: '',
              myNumber: '',
              phoneNumber: '',
              role: 'admin',
            };
          } else {
            basicInfo.role = 'admin';
          }
          console.log('admin login: set basicInfo', basicInfo);
          await this.employeeService.setBasicInfo(targetId, convertUndefinedToNull(basicInfo) as EmployeeBasicInfo);
          const updated = await this.employeeService.getBasicInfo(targetId);
          console.log('admin login: updated basicInfo', updated);
          return true;
        }
        return false;
      } catch (error) {
        console.error('admin login error:', error);
        return false;
      }
    });
  }

  async getEmployeeBasicInfo(employeeId: string): Promise<EmployeeBasicInfo | null> {
    return this.employeeService.getBasicInfo(employeeId);
  }

  async getEmploymentInfo(employeeId: string): Promise<EmploymentInfo | null> {
    return this.employeeService.getEmploymentInfo(employeeId);
  }

  async getInsuranceStatus(employeeId: string): Promise<InsuranceStatus | null> {
    return this.employeeService.getInsuranceStatus(employeeId);
  }

  async getSpecialAttributes(employeeId: string): Promise<SpecialAttributes | null> {
    return this.employeeService.getSpecialAttributes(employeeId);
  }
} 