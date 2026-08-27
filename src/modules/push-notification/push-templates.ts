export type NotificationEventType =
  | 'MATCH_REMINDER_MORNING'
  | 'MATCH_REMINDER_KICKOFF'
  | 'MATCH_REMINDER_CANCELLED'
  | 'NEW_PROMO'
  | 'USER_SUSPENDED'
  | 'USER_ON_HOLD'
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

export const PUSH_TEMPLATES: Record<
  NotificationEventType,
  { ar: LocalizedTemplate; en: LocalizedTemplate }
> = {
  MATCH_REMINDER_MORNING: {
    ar: {
      title: 'تذكير بموعد مباراتك اليوم ⚽',
      body: 'لديك مباراة اليوم في {venueName} تبدأ الساعة {time}. لا تنس تجهيز معداتك والحضور في الموعد!',
    },
    en: {
      title: 'Match Day Reminder ⚽',
      body: 'You have a match today at {venueName} starting at {time}. Don’t forget your gear!',
    },
  },
  MATCH_REMINDER_KICKOFF: {
    ar: {
      title: 'المباراة بعد ساعتين! ⏳',
      body: 'مباراتك في {venueName} ستبدأ في تمام الساعة {time}. استعد للنزول إلى أرض الملعب!',
    },
    en: {
      title: 'Kickoff in 2 Hours! ⏳',
      body: 'Your match at {venueName} kicks off at {time}. Get ready to hit the pitch!',
    },
  },
  MATCH_REMINDER_CANCELLED: {
    ar: {
      title: 'إلغاء تذكير المباراة ⚠️',
      body: 'تم إلغاء مباراتك المجدولة في {venueName} بتاريخ {date}. لن يتم إرسال أي تذكيرات إضافية.',
    },
    en: {
      title: 'Match Reminder Cancelled ⚠️',
      body: 'Your scheduled match at {venueName} for {date} has been cancelled.',
    },
  },
  NEW_PROMO: {
    ar: {
      title: 'عرض خاص جديد! 🎉',
      body: '{promoTitle} - {promoDescription}',
    },
    en: {
      title: 'Special Offer Available! 🎉',
      body: '{promoTitle} - {promoDescription}',
    },
  },
  USER_SUSPENDED: {
    ar: {
      title: 'تم إيقاف حسابك ⛔',
      body: 'تم تعليق حسابك في أرينا هب. يرجى التواصل مع فريق الدعم الفني للمساعدة.',
    },
    en: {
      title: 'Account Suspended ⛔',
      body: 'Your account has been suspended. Please contact customer support for assistance.',
    },
  },
  USER_ON_HOLD: {
    ar: {
      title: 'حسابك قيد المراجعة ⏸️',
      body: 'تم تعليق حسابك مؤقتاً. يرجى مراجعة الدعم الفني.',
    },
    en: {
      title: 'Account On Hold ⏸️',
      body: 'Your account has been placed on hold. Please contact support.',
    },
  },
  PITCH_REOPENED: {
    ar: {
      title: 'الملعب متاح للحجز الآن! 🏟️',
      body: 'تمت إعادة فتح {venueName} وجاهز لاستقبال الحجوزات بعد انتهاء أعمال الصيانة.',
    },
    en: {
      title: 'Pitch Reopened! 🏟️',
      body: '{venueName} is back open and ready for bookings after maintenance.',
    },
  },
  BOOKING_CONFIRMED: {
    ar: {
      title: 'تم تأكيد الحجز بنجاح! ✅',
      body: 'تم تأكيد حجزك في {venueName} بتاريخ {date} الساعة {time}. كود الحجز: {bookingCode}',
    },
    en: {
      title: 'Booking Confirmed! ✅',
      body: 'Your booking at {venueName} for {date} at {time} is confirmed. Booking Code: {bookingCode}',
    },
  },
  BOOKING_CANCELLED: {
    ar: {
      title: 'تم إلغاء الحجز ❌',
      body: 'تم إلغاء الحجز رقم {bookingCode} في {venueName}.',
    },
    en: {
      title: 'Booking Cancelled ❌',
      body: 'Booking #{bookingCode} at {venueName} has been cancelled.',
    },
  },
  PAYMENT_APPROVED: {
    ar: {
      title: 'تم قبول الدفع بنجاح! 💳',
      body: 'تم التحقق من إيصال الدفع لحجزك رقم {bookingCode} بنجاح وتأكيد الحجز.',
    },
    en: {
      title: 'Payment Approved! 💳',
      body: 'Your payment for booking #{bookingCode} has been verified and approved.',
    },
  },
  PAYMENT_REJECTED: {
    ar: {
      title: 'تعذر قبول إيصال الدفع ⚠️',
      body: 'تم رفض إيصال الدفع لحجزك رقم {bookingCode}. {reason}',
    },
    en: {
      title: 'Payment Rejected ⚠️',
      body: 'Your payment screenshot for booking #{bookingCode} was rejected. {reason}',
    },
  },
  NEW_BOOKING_REQUEST: {
    ar: {
      title: 'طلب حجز جديد! 📋',
      body: 'حجز جديد في {venueName} بتاريخ {date} الساعة {time} بواسطة {customerName}. كود: {bookingCode}',
    },
    en: {
      title: 'New Booking Received! 📋',
      body: 'New booking received for {venueName} on {date} at {time} by {customerName}. Code: {bookingCode}',
    },
  },
};

/**
 * Replace placeholders like {venueName}, {time}, {date} with actual values.
 */
export function renderTemplate(
  eventType: NotificationEventType,
  locale: string = 'ar',
  params: Record<string, string | number> = {},
): { title: string; body: string } {
  const langKey = locale?.toLowerCase().startsWith('en') ? 'en' : 'ar';
  const templateGroup = PUSH_TEMPLATES[eventType] || PUSH_TEMPLATES.BOOKING_CONFIRMED;
  const template = templateGroup[langKey] || templateGroup.ar;

  let title = template.title;
  let body = template.body;

  for (const [key, value] of Object.entries(params)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    const strVal = String(value ?? '');
    title = title.replace(regex, strVal);
    body = body.replace(regex, strVal);
  }

  return { title, body };
}
