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
    setOptions(options: { datesDisabled?: Date[]; maxDate?: Date | string | number }): void;
    // Re-mirroring the end side to the checkin internally after a re-pick
    // (31 Aug/1 Sep 2026) - see DateRangePicker.tsx's processSettledRange.
    setDate(date: Date | number | { clear: true }, options?: { render?: boolean }): void;
    // picker.viewDate/changeFocus: restoring the displayed month after Clear
    // (31 Aug 2026) - see DateRangePicker.tsx's clear-btn interceptor.
    readonly picker: {
      readonly viewDate: number;
      changeFocus(newViewDate: number | Date): unknown;
    };
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
