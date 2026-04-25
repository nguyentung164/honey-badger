/// <reference types="vite/client" />

declare module 'lunar-javascript' {
  export class Solar {
    static fromDate(date: Date): Solar
    static fromYmd(year: number, month: number, day: number): Solar
    getLunar(): Lunar
  }

  export class Lunar {
    getDay(): number
    /** Âm: tháng nhuận (tháng 2 nhuận → -2). */
    getMonth(): number
    getMonthInChinese(): string
    toString(): string
  }
}
