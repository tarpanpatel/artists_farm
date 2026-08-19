declare module 'flowbite-datepicker/DateRangePicker' {
  export interface DateRangePickerOptions {
    format?: string;
    autohide?: boolean;
    todayBtn?: boolean;
    clearBtn?: boolean;
    todayHighlight?: boolean;
    minDate?: Date | string | number;
    maxDate?: Date | string | number;
    language?: string;
    weekStart?: number;
    allowOneSidedRange?: boolean;
    [key: string]: unknown;
  }

  export default class DateRangePicker {
    constructor(element: HTMLElement, options?: DateRangePickerOptions);
    dates: [number | undefined, number | undefined];
    getDates(format?: string): Array<Date | string | undefined>;
    setDates(rangeStart: Date | string | number | { clear: true }, rangeEnd: Date | string | number | { clear: true }): void;
    setOptions(options: DateRangePickerOptions): void;
    destroy(): void;
  }
}
