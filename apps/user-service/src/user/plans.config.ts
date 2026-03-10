import { SubscriptionPlan } from './schemas/subscription.schema';

export interface PlanConfig {
  name: string;
  /** Monthly price in LKR; 0 = free */
  price: number;
  /** Trial days (starter only) */
  trialDays?: number;
  /** -1 = unlimited */
  maxLocations: number;
  /** -1 = unlimited */
  maxStaff: number;
  features: string[];
}

export const PLANS: Record<SubscriptionPlan, PlanConfig> = {
  starter: {
    name: 'Starter',
    price: 0,
    trialDays: 30,
    maxLocations: 1,
    maxStaff: 3,
    features: ['basic_booking', 'email_notifications'],
  },
  basic: {
    name: 'Basic',
    price: 2500,
    maxLocations: 1,
    maxStaff: 5,
    features: ['basic_booking', 'email_notifications', 'sms_notifications', 'google_calendar'],
  },
  pro: {
    name: 'Pro',
    price: 5500,
    maxLocations: 1,
    maxStaff: -1,
    features: [
      'basic_booking',
      'email_notifications',
      'sms_notifications',
      'whatsapp',
      'google_calendar',
      'analytics',
      'priority_support',
    ],
  },
  franchise: {
    name: 'Franchise',
    price: 12000,
    maxLocations: 10,
    maxStaff: -1,
    features: ['all'],
  },
};
