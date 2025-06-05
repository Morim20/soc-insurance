import { Injectable } from '@angular/core';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

export interface CompanySettings {
  bonusMonths: number[];
  bonusCount: number;
  prefecture: string;
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  constructor(private firestore: Firestore) {}

  async getCompanySettings(): Promise<CompanySettings> {
    const settingsRef = doc(this.firestore, 'settings', 'office');
    const settingsDoc = await getDoc(settingsRef);
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      return {
        bonusMonths: Array.isArray(data['bonusMonths']) ? data['bonusMonths'] : [],
        bonusCount: typeof data['bonusCount'] === 'number' ? data['bonusCount'] : 0,
        prefecture: data['prefecture'] || '東京都'
      };
    } else {
      throw new Error('会社設定が見つかりません');
    }
  }
} 