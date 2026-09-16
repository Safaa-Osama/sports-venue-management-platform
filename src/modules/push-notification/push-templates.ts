import * as fs from 'fs';
import * as path from 'path';

export type NotificationEventType =
  | 'MATCH_REMINDER_MORNING'
  | 'MATCH_REMINDER_KICKOFF'
  | 'MATCH_REMINDER_CANCELLED'
  | 'NEW_PROMO'
  | 'NEW_COUPON'
  | 'USER_SUSPENDED'
  | 'USER_ON_HOLD'
  | 'USER_ACTIVE'
  | 'PITCH_REOPENED'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'NEW_BOOKING_REQUEST';

export interface LocalizedTemplate {
  title: string;
  body: string;
}

/**
 * Converts 24-hour hour number or time string (e.g. 18, "18:00") into 12-hour format with AM/PM or ص/م.
 */
export function formatTime12h(time: number | string, locale: string = 'ar'): string {
  if (time === undefined || time === null) return '';
  const isEn = locale?.toLowerCase().startsWith('en');

  let hour: number;
  let minute: number = 0;

  if (typeof time === 'number') {
    hour = Math.floor(time);
    minute = Math.round((time - hour) * 60);
  } else {
    const trimmed = String(time).trim();
    if (/[ap]\.?m|صباح|مساء|[صم]/i.test(trimmed)) {
      return trimmed;
    }
    const parts = trimmed.split(':');
    hour = parseInt(parts[0], 10);
    minute = parts[1] ? parseInt(parts[1], 10) : 0;
  }

  if (isNaN(hour)) return String(time);

  const normalizedHour = hour % 24;
  const period = normalizedHour >= 12 ? (isEn ? 'PM' : 'م') : (isEn ? 'AM' : 'ص');
  const hour12 = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
  const minuteStr = minute > 0 ? `:${String(minute).padStart(2, '0')}` : ':00';

  return `${hour12}${minuteStr} ${period}`;
}

const FALLBACK_TEMPLATES: Record<
  NotificationEventType,
  { ar: LocalizedTemplate; en: LocalizedTemplate }
> = {
  MATCH_REMINDER_MORNING: {
    ar: {
      title: 'ماتشك النهاردة يا كابتن! ⚽',
      body: 'حجزك في ملعب {venueName} الساعة {time}. جهّز كرتك وفرقتك! 🏆',
    },
    en: {
      title: 'Match Day Today! ⚽',
      body: 'Your match at {venueName} kicks off at {time}. Get ready with your team! 🏆',
    },
  },
  MATCH_REMINDER_KICKOFF: {
    ar: {
      title: 'فاضل ساعتين على الماتش! ⏳',
      body: 'ميعاد الحجز في ملعب {venueName} الساعة {time}. كود الدخول: {bookingCode} 🎫',
    },
    en: {
      title: '2 Hours Until Kickoff! ⏳',
      body: 'Your match at {venueName} starts at {time}. Gate Pass Code: {bookingCode} 🎫',
    },
  },
  MATCH_REMINDER_CANCELLED: {
    ar: {
      title: 'تم إلغاء التذكير بالماتش ❌',
      body: 'حجزك في ملعب {venueName} تم إلغاؤه أو تغييره.',
    },
    en: {
      title: 'Match Reminder Cancelled ❌',
      body: 'Your booking at {venueName} has been cancelled or rescheduled.',
    },
  },
  NEW_PROMO: {
    ar: {
      title: 'عرض خاص جديد! 🎁',
      body: '{promoTitle} - احجز الآن واستمتع بخصم إضافي على ملاعبك المفضلة!',
    },
    en: {
      title: 'New Special Offer! 🎁',
      body: '{promoTitle} - Book now and enjoy special discounts on your favorite pitches!',
    },
  },
  NEW_COUPON: {
    ar: {
      title: 'كود خصم جديد! 🏷️',
      body: 'استخدم الكوبون {couponCode} للحصول على خصم بقيمة {discount} على حجزك القادم!',
    },
    en: {
      title: 'New Discount Code! 🏷️',
      body: 'Use coupon code {couponCode} to get a {discount} discount on your next booking!',
    },
  },
  USER_SUSPENDED: {
    ar: {
      title: 'تنبيه بشأن حسابك ⚠️',
      body: 'يا {userName}، تم إيقاف حسابك مؤقتاً. السبب: {reason}',
    },
    en: {
      title: 'Account Status Notice ⚠️',
      body: 'Hello {userName}, your account has been suspended. Reason: {reason}',
    },
  },
  USER_ON_HOLD: {
    ar: {
      title: 'حسابك قيد المراجعة ℹ️',
      body: 'يا {userName}، تم وضع حسابك قيد المراجعة. السبب: {reason}',
    },
    en: {
      title: 'Account Under Review ℹ️',
      body: 'Hello {userName}, your account is on hold. Reason: {reason}',
    },
  },
  USER_ACTIVE: {
    ar: {
      title: 'تم تفعيل حسابك بنجاح! 🟢',
      body: 'أهلاً بك يا {userName}، تم تفعيل حسابك بالكامل ويمكنك حجز الملاعب بشكل طبيعي.',
    },
    en: {
      title: 'Account Activated! 🟢',
      body: 'Welcome back {userName}, your account has been activated. You can now book pitches.',
    },
  },
  PITCH_REOPENED: {
    ar: {
      title: 'الملعب فتح من تاني وجاهز للحجز! 🏟️',
      body: '{venueName} رجع يشتغل بعد الصيانة، تقدر تحجز حجزتك دلوقتي!',
    },
    en: {
      title: 'Pitch Reopened! 🏟️',
      body: '{venueName} is back open and ready for bookings after maintenance.',
    },
  },
  BOOKING_CONFIRMED: {
    ar: {
      title: 'حجزك اتأكد خلاص! ✅',
      body: 'حجزك في {venueName} يوم {date} الساعة {time} اتأكد بنجاح. كود حجزك: {bookingCode}',
    },
    en: {
      title: 'Booking Confirmed! ✅',
      body: 'Your booking at {venueName} for {date} at {time} is confirmed. Booking Code: {bookingCode}',
    },
  },
  BOOKING_CANCELLED: {
    ar: {
      title: 'تم إلغاء الحجز ❌',
      body: 'حجزك رقم {bookingCode} في {venueName} اتلغى. {refundInfo}',
    },
    en: {
      title: 'Booking Cancelled ❌',
      body: 'Booking #{bookingCode} at {venueName} has been cancelled. {refundInfo}',
    },
  },
  PAYMENT_APPROVED: {
    ar: {
      title: 'الدفع اتقبل وحجزك اتثبت! 💳',
      body: 'إيصال الدفع لحجزك رقم {bookingCode} اتقبل بنجاح وتأكد الحجز.',
    },
    en: {
      title: 'Payment Approved! 💳',
      body: 'Your payment for booking #{bookingCode} has been verified and approved.',
    },
  },
  PAYMENT_REJECTED: {
    ar: {
      title: 'إيصال الدفع ماتقبلش ⚠️',
      body: 'إيصال الدفع لحجزك رقم {bookingCode} اترفض: {reason}',
    },
    en: {
      title: 'Payment Rejected ⚠️',
      body: 'Your payment screenshot for booking #{bookingCode} was rejected. {reason}',
    },
  },
  NEW_BOOKING_REQUEST: {
    ar: {
      title: 'حجز جديد وصلك! 📋',
      body: 'فيه حجز جديد في {venueName} يوم {date} الساعة {time} بواسطة {customerName}. كود: {bookingCode}',
    },
    en: {
      title: 'New Booking Received! 📋',
      body: 'New booking received for {venueName} on {date} at {time} by {customerName}. Code: {bookingCode}',
    },
  },
};

/**
 * In-memory cache for loaded i18n JSON templates
 */
const templateCache: { ar?: Record<string, LocalizedTemplate>; en?: Record<string, LocalizedTemplate> } = {};

/**
 * Load template JSON from disk with multiple lookup locations and caching.
 * Can be edited in `src/modules/push-notification/i18n/{ar,en}.json` at any time.
 */
export function loadLocaleTemplates(locale: 'ar' | 'en'): Record<string, LocalizedTemplate> {
  const candidatePaths = [
    path.join(__dirname, 'i18n', `${locale}.json`),
    path.join(__dirname, '..', 'src', 'modules', 'push-notification', 'i18n', `${locale}.json`),
    path.join(process.cwd(), 'src', 'modules', 'push-notification', 'i18n', `${locale}.json`),
    path.join(process.cwd(), 'dist', 'modules', 'push-notification', 'i18n', `${locale}.json`),
  ];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        templateCache[locale] = parsed;
        return parsed;
      }
    } catch {
      // try next path
    }
  }

  if (templateCache[locale]) {
    return templateCache[locale]!;
  }

  const fallback: Record<string, LocalizedTemplate> = {};
  for (const [key, value] of Object.entries(FALLBACK_TEMPLATES)) {
    fallback[key] = value[locale];
  }
  templateCache[locale] = fallback;
  return fallback;
}

export function getTemplate(
  eventType: NotificationEventType,
  locale: string = 'ar',
): LocalizedTemplate {
  const langKey: 'ar' | 'en' = locale?.toLowerCase().startsWith('en') ? 'en' : 'ar';
  const templates = loadLocaleTemplates(langKey);
  if (templates[eventType]) {
    return templates[eventType];
  }
  const arTemplates = loadLocaleTemplates('ar');
  if (arTemplates[eventType]) {
    return arTemplates[eventType];
  }
  return FALLBACK_TEMPLATES[eventType]?.[langKey] || FALLBACK_TEMPLATES.BOOKING_CONFIRMED[langKey];
}

export const PUSH_TEMPLATES: Record<
  NotificationEventType,
  { ar: LocalizedTemplate; en: LocalizedTemplate }
> = new Proxy({} as any, {
  get: (_, prop: string) => {
    const eventType = prop as NotificationEventType;
    return {
      ar: getTemplate(eventType, 'ar'),
      en: getTemplate(eventType, 'en'),
    };
  },
});

/**
 * Replace placeholders like {venueName}, {time}, {date}, {couponCode}, {discount}, {promoTitle} with actual values.
 * Automatically converts 24h times into 12h format.
 */
export function renderTemplate(
  eventType: NotificationEventType,
  locale: string = 'ar',
  params: Record<string, string | number> = {},
): { title: string; body: string } {
  const langKey = locale?.toLowerCase().startsWith('en') ? 'en' : 'ar';
  const template = getTemplate(eventType, langKey);

  let title = template.title;
  let body = template.body;

  // Support parameter alias for promos/ads
  const normalizedParams = { ...params };
  if (normalizedParams.promoDescription && !normalizedParams.promoTitle) {
    normalizedParams.promoTitle = normalizedParams.promoDescription;
  }

  for (const [key, value] of Object.entries(normalizedParams)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    let strVal = String(value ?? '');
    if (key === 'time') {
      strVal = formatTime12h(value, langKey);
    }
    title = title.replace(regex, strVal);
    body = body.replace(regex, strVal);
  }

  return { title, body };
}
