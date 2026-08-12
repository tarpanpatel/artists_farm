export type HoldState = 'tentative' | 'confirmed' | 'cancelled';

export interface CalendarChange {
  propertyId: number;
  roomId: number;
  source: string;
  externalEventId: string;
  revision: number;
  state: HoldState;
  startAt: string;
  endAt: string;
}

export interface AvailabilityChangedEvent {
  id: string;
  type: 'availability.changed';
  propertyId: number;
  roomId: number;
  sequence: number;
  changedBookingIds: string[];
  occurredAt: string;
}
