# Notification Integration Guide — Sector 7

> Reference document for setting up WhatsApp Business API and Firebase Cloud Messaging (FCM) integrations.
> Last updated: 2026-03-20

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [WhatsApp Business API Setup](#whatsapp-business-api-setup)
3. [Firebase Cloud Messaging Setup](#firebase-cloud-messaging-setup)
4. [Code Changes Required](#code-changes-required)
5. [Environment Variables](#environment-variables)
6. [Testing the Integrations](#testing-the-integrations)
7. [Notification Triggers Reference](#notification-triggers-reference)

---

## Current Architecture

### How notifications flow

```
Service (session/leave/reassignment)
  → notification.service.ts (fire-and-forget trigger)
    → notifications.ts::sendNotification()
      → Provider (whatsAppProvider / fcmProvider / inAppProvider)
      → NotificationLog DB record (status: SENT/FAILED, failReason)
```

### Fallback logic

| Channel    | Behavior                                                     |
| ---------- | ------------------------------------------------------------ |
| `IN_APP`   | Creates NotificationLog with channel=IN_APP, always succeeds |
| `WHATSAPP` | Attempts WhatsApp → if fails, falls back to IN_APP           |
| `BOTH`     | Sends WhatsApp AND IN_APP (both logged separately)           |

### Key files

| File                                           | Purpose                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/notifications.ts`                     | Core service: providers, sendNotification, getNotifications, markAsRead          |
| `src/services/notification.service.ts`         | Trigger functions: notifySessionStarted, notifyNoShow, notifyLeaveApproved, etc. |
| `src/app/api/notifications/route.ts`           | GET /api/notifications (paginated list + unread count)                           |
| `src/app/api/notifications/[id]/read/route.ts` | PUT mark single as read                                                          |
| `src/app/api/notifications/read-all/route.ts`  | PUT mark all as read                                                             |
| `src/components/layout/NotificationBell.tsx`   | UI: bell icon with unread badge, dropdown list, mark read                        |
| `prisma/schema.prisma`                         | NotificationLog model (channel, status, readAt, failReason, metadata)            |

### Database schema

```prisma
model NotificationLog {
  id          String             @id @default(cuid())
  branchId    String
  recipientId String
  channel     NotificationChannel  // WHATSAPP | IN_APP | BOTH
  status      NotificationStatus   // SENT | FAILED | PENDING
  title       String
  body        String
  metadata    Json?
  sentAt      DateTime?
  readAt      DateTime?
  failReason  String?
  createdAt   DateTime           @default(now())
}
```

---

## WhatsApp Business API Setup

### Step 1: Create a Meta Business Account

1. Go to https://business.facebook.com and create or use an existing Meta Business account
2. Navigate to https://developers.facebook.com and create a new app (type: "Business")
3. Add the "WhatsApp" product to your app

### Step 2: Get API Credentials

1. In the WhatsApp product page, go to **API Setup**
2. Note down:
   - **Phone Number ID** — the ID of your WhatsApp business phone number
   - **Permanent Access Token** — generate from System Users in Business Settings
   - **WhatsApp Business Account ID** — found in API Setup

### Step 3: Create Message Templates

WhatsApp requires pre-approved templates for business-initiated messages. Create these templates in the WhatsApp Manager:

| Template Name        | Category | Variables                                                                           | Used For              |
| -------------------- | -------- | ----------------------------------------------------------------------------------- | --------------------- |
| `session_reminder`   | UTILITY  | `{{1}}` = client name, `{{2}}` = date, `{{3}}` = time, `{{4}}` = trainer name       | Session reminders     |
| `session_noshow`     | UTILITY  | `{{1}}` = client name, `{{2}}` = date, `{{3}}` = time                               | No-show notifications |
| `leave_approved`     | UTILITY  | `{{1}}` = trainer name, `{{2}}` = start date, `{{3}}` = end date                    | Leave approval        |
| `leave_rejected`     | UTILITY  | `{{1}}` = trainer name, `{{2}}` = start date, `{{3}}` = end date, `{{4}}` = reason  | Leave rejection       |
| `trainer_reassigned` | UTILITY  | `{{1}}` = client name, `{{2}}` = date, `{{3}}` = old trainer, `{{4}}` = new trainer | Reassignment          |

Template approval takes 24-48 hours.

### Step 4: Set Up Webhooks (Optional — for delivery receipts)

1. In your Meta app, go to WhatsApp > Configuration
2. Set the webhook URL to: `https://your-domain.com/api/webhooks/whatsapp`
3. Use `WHATSAPP_VERIFY_TOKEN` from your env for verification
4. Subscribe to: `messages`, `message_delivery_status`

### Step 5: Environment Variables

```env
WHATSAPP_API_KEY=your-permanent-access-token
WHATSAPP_API_URL=https://graph.facebook.com/v21.0/YOUR_PHONE_NUMBER_ID
WHATSAPP_VERIFY_TOKEN=a-random-string-for-webhook-verification
```

### Step 6: Code Changes — `whatsAppProvider`

Replace the stubbed `whatsAppProvider.send()` in `src/lib/notifications.ts`:

```typescript
export const whatsAppProvider: NotificationProvider = {
  async send({ recipientId, title, body, metadata }) {
    if (!process.env.WHATSAPP_API_KEY) {
      return { success: false, error: 'WhatsApp API key not configured' };
    }

    try {
      // 1. Look up recipient's phone number from User table
      const user = await prisma.user.findUnique({
        where: { id: recipientId },
        select: { phone: true },
      });

      if (!user?.phone) {
        return { success: false, error: 'Recipient has no phone number' };
      }

      // 2. Format phone to E.164 (India: remove leading 0, add +91)
      const phone = formatPhoneE164(user.phone);

      // 3. Determine which template to use based on metadata.type
      const templateName = getTemplateName(metadata);
      const templateVars = getTemplateVars(metadata, title, body);

      // 4. Send via WhatsApp Cloud API
      const response = await fetch(`${process.env.WHATSAPP_API_URL}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: [
              {
                type: 'body',
                parameters: templateVars.map((v) => ({
                  type: 'text',
                  text: v,
                })),
              },
            ],
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        return {
          success: false,
          error: `WhatsApp API error: ${err.error?.message ?? response.statusText}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `WhatsApp send failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

// Helper: map metadata.type to template name
function getTemplateName(metadata?: Prisma.InputJsonValue): string {
  const type = (metadata as Record<string, string>)?.type;
  const map: Record<string, string> = {
    SESSION_STARTED: 'session_reminder',
    NO_SHOW: 'session_noshow',
    LEAVE_APPROVED: 'leave_approved',
    LEAVE_REJECTED: 'leave_rejected',
    TRAINER_REASSIGNED: 'trainer_reassigned',
  };
  return map[type ?? ''] ?? 'general_notification';
}

// Helper: format phone to E.164 (adjust for your region)
function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.startsWith('0')) return `91${digits.slice(1)}`;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}
```

### WhatsApp Rate Limits

- **Tier 1 (new):** 1,000 business-initiated conversations / 24 hours
- **Tier 2:** 10,000 / 24 hours
- **Tier 3:** 100,000 / 24 hours
- Tier upgrades happen automatically based on message quality and volume

---

## Firebase Cloud Messaging Setup

### Step 1: Create Firebase Project

1. Go to https://console.firebase.google.com
2. Create a new project or use existing
3. Enable Cloud Messaging in Project Settings > Cloud Messaging

### Step 2: Generate Service Account Key

1. Go to Project Settings > Service Accounts
2. Click "Generate new private key"
3. Download the JSON file — you'll extract values for env vars

### Step 3: Install Firebase Admin SDK

```bash
npm install firebase-admin
```

### Step 4: Environment Variables

```env
FCM_SERVER_KEY=true
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
```

### Step 5: Initialize Firebase Admin — Create `src/lib/firebase.ts`

```typescript
import admin from 'firebase-admin';

let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdmin(): admin.app.App {
  if (firebaseApp) return firebaseApp;

  if (
    !process.env.FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_PRIVATE_KEY ||
    !process.env.FIREBASE_CLIENT_EMAIL
  ) {
    throw new Error('Firebase credentials not configured');
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });

  return firebaseApp;
}
```

### Step 6: Store FCM Tokens — Schema Addition

Users need to register their device FCM tokens. Add to your schema:

```prisma
model FcmToken {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  device    String?  // "web", "android", "ios"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@map("fcm_tokens")
}
```

Create an API route to register tokens:

```
POST /api/notifications/register-token → { token, device } → { success }
DELETE /api/notifications/register-token → { token } → { success }
```

### Step 7: Code Changes — `fcmProvider`

Replace the stubbed `fcmProvider.send()` in `src/lib/notifications.ts`:

```typescript
import { getFirebaseAdmin } from '@/lib/firebase';

export const fcmProvider: NotificationProvider = {
  async send({ recipientId, title, body, metadata }) {
    if (!process.env.FCM_SERVER_KEY) {
      return { success: false, error: 'FCM server key not configured' };
    }

    try {
      const admin = getFirebaseAdmin();

      // 1. Look up user's FCM tokens
      const tokens = await prisma.fcmToken.findMany({
        where: { userId: recipientId },
        select: { token: true },
      });

      if (tokens.length === 0) {
        return { success: false, error: 'No FCM tokens registered for user' };
      }

      // 2. Send to all registered devices
      const message = {
        notification: { title, body },
        data: {
          type: String((metadata as Record<string, string>)?.type ?? 'GENERAL'),
          click_action: '/notifications',
        },
        tokens: tokens.map((t) => t.token),
      };

      const response = await admin.messaging().sendEachForMulticast(message);

      // 3. Clean up invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[idx].token);
          }
        });
        if (invalidTokens.length > 0) {
          await prisma.fcmToken.deleteMany({
            where: { token: { in: invalidTokens } },
          });
        }
      }

      return {
        success: response.successCount > 0,
        error:
          response.failureCount > 0
            ? `${response.failureCount}/${tokens.length} devices failed`
            : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: `FCM send failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};
```

### Step 8: Client-Side FCM Setup (PWA)

In your service worker (`public/sw.js`), handle background messages:

```javascript
importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.x.x/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'your-web-api-key',
  projectId: 'your-project-id',
  messagingSenderId: 'your-sender-id',
  appId: 'your-app-id',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
  });
});
```

In a client component (e.g., dashboard layout), request permission and register the token:

```typescript
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { initializeApp } from 'firebase/app';

const firebaseConfig = {
  /* your web config from Firebase Console */
};
const app = initializeApp(firebaseConfig);

export async function registerFcmToken() {
  try {
    const messaging = getMessaging(app);
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const token = await getToken(messaging, {
      vapidKey: 'your-vapid-key-from-firebase-console',
    });

    await fetch('/api/notifications/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device: 'web' }),
    });

    // Handle foreground messages
    onMessage(messaging, (payload) => {
      // Update notification bell count, show toast, etc.
      console.log('Foreground message:', payload);
    });
  } catch (error) {
    console.error('FCM registration failed:', error);
  }
}
```

---

## Environment Variables

Add these to your `.env` file when ready:

```env
# ─── WhatsApp Business API ────────────────────────
WHATSAPP_API_KEY=EAAxxxxxxx...               # Permanent access token from Meta Business
WHATSAPP_API_URL=https://graph.facebook.com/v21.0/123456789  # v21.0/<Phone-Number-ID>
WHATSAPP_VERIFY_TOKEN=my-random-verify-string  # For webhook verification

# ─── Firebase Cloud Messaging ────────────────────
FCM_SERVER_KEY=true                            # Set to "true" to enable FCM provider
FIREBASE_PROJECT_ID=sector7-gym-app
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@sector7-gym-app.iam.gserviceaccount.com

# ─── Firebase Web SDK (client-side, NEXT_PUBLIC_) ─
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaXXX...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sector7-gym-app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BPxxx...       # From Firebase Console > Cloud Messaging > Web Push
```

---

## Testing the Integrations

### WhatsApp Testing

1. Use the **Test Phone Number** provided by Meta in API Setup (no template approval needed for test numbers)
2. Add your personal phone as a test recipient in WhatsApp > API Setup > "To" field
3. Send test messages via the Graph API Explorer first to verify credentials
4. Check `notification_logs` table for status/failReason entries

### FCM Testing

1. Deploy to HTTPS (FCM requires HTTPS for web push) — use `ngrok` for local testing
2. Open browser dev tools > Application > Service Workers to verify SW registration
3. Use Firebase Console > Cloud Messaging > "Send test message" with your FCM token
4. Check browser notification permissions are granted

### Quick Verification Queries

```sql
-- Check WhatsApp delivery status
SELECT id, title, status, fail_reason, sent_at
FROM notification_logs
WHERE channel = 'WHATSAPP'
ORDER BY created_at DESC
LIMIT 20;

-- Check in-app notifications
SELECT id, title, status, read_at
FROM notification_logs
WHERE channel = 'IN_APP' AND recipient_id = '<user-id>'
ORDER BY created_at DESC;

-- Verify fallback (WhatsApp failed → IN_APP created)
SELECT channel, status, fail_reason
FROM notification_logs
WHERE title = '<some-title>'
ORDER BY created_at;
```

---

## Notification Triggers Reference

| Event              | Trigger Function       | Channel | Recipient | Wired In                                   |
| ------------------ | ---------------------- | ------- | --------- | ------------------------------------------ |
| Session started    | `notifySessionStarted` | IN_APP  | Client    | `session.service.ts::startSession`         |
| No-show marked     | `notifyNoShow`         | BOTH    | Client    | `session.service.ts::markNoShow`           |
| Leave approved     | `notifyLeaveApproved`  | BOTH    | Trainer   | `leave.service.ts::reviewLeave`            |
| Leave rejected     | `notifyLeaveRejected`  | BOTH    | Trainer   | `leave.service.ts::reviewLeave`            |
| Trainer reassigned | `notifyReassignment`   | BOTH    | Client    | `reassignment.service.ts::reassignSession` |

### Adding New Notification Triggers

1. Add a new function in `src/services/notification.service.ts`:

```typescript
export async function notifyNewEvent({ branchId, recipientId, ... }) {
  try {
    await sendNotification({
      branchId,
      recipientId,
      title: 'Your Title',
      body: 'Your message',
      channel: 'BOTH',                      // or 'IN_APP'
      metadata: { type: 'NEW_EVENT_TYPE' },
    });
  } catch (error) {
    console.error('[Notification] Failed:', error);
  }
}
```

2. Call it from the relevant service (fire-and-forget — no `await`):

```typescript
notifyNewEvent({ branchId, recipientId: user.id, ... });
```

3. If using WhatsApp, create a matching template in Meta WhatsApp Manager and add the mapping in `getTemplateName()`.

---

## Checklist Before Going Live

- [ ] WhatsApp: Meta Business account verified
- [ ] WhatsApp: Phone number registered and verified
- [ ] WhatsApp: All message templates approved (24-48 hour wait)
- [ ] WhatsApp: Permanent access token generated (not temporary)
- [ ] WhatsApp: Webhook URL configured for delivery receipts (optional)
- [ ] FCM: Firebase project created
- [ ] FCM: Service account key downloaded and env vars set
- [ ] FCM: VAPID key generated for web push
- [ ] FCM: Service worker registered and handling background messages
- [ ] FCM: Token registration API route created
- [ ] FCM: FcmToken model added to schema + migration run
- [ ] FCM: Client-side permission request flow implemented
- [ ] All env vars added to production deployment (Vercel/Docker)
- [ ] Test with real phone number (WhatsApp) and real browser (FCM)
- [ ] Monitor `notification_logs` for FAILED entries after launch
