import { Injectable } from '@angular/core';
import { Firestore, doc, setDoc, getDoc } from '@angular/fire/firestore';
import { InsuranceData } from '../models/insurance.model';

@Injectable({ providedIn: 'root' })
export class InsuranceSummaryService {
  constructor(private firestore: Firestore) {}

  async saveCompanySummary(year: number, month: number, companySummaryTable: any, companyBonusSummaryTable: any, hasBonus: boolean) {
    const yearMonth = `${year}_${('0' + month).slice(-2)}`;
    const companyDocRef = doc(this.firestore, 'insuranceDetails', yearMonth, 'company', 'summary');
    const saveData = {
      main: companySummaryTable.rows,
      bonus: hasBonus ? companyBonusSummaryTable.rows : []
    };
    await setDoc(companyDocRef, saveData);
  }
} 