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

  // Minimal shape of the per-side Datepicker instance the range picker
  // constructs internally (js/Datepicker.js) - only the members this app's
  // DateRangePicker.tsx actually reads (pickerElement to inject a Close
  // button into each side's own popover footer, hide() for that button's
  // click handler).
  export interface DatepickerInstance {
    readonly pickerElement: HTMLElement | undefined;
    hide(): void;
  }

  export default class DateRangePicker {
    constructor(element: HTMLElement, options?: DateRangePickerOptions);
    dates: [number | undefined, number | undefined];
    readonly datepickers: [DatepickerInstance, DatepickerInstance];
    getDates(format?: string): Array<Date | string | undefined>;
    setDates(rangeStart: Date | string | number | { clear: true }, rangeEnd: Date | string | number | { clear: true }): void;
    setOptions(options: DateRangePickerOptions): void;
    destroy(): void;
  }
}
