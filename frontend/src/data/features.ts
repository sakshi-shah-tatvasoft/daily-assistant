/**
 * Everything the app can do — shown on the public /guide page.
 * ➜ When a new feature ships, add ONE entry here (with `added`), so the guide stays complete.
 *   where = how to get there · check = what a tester should see if it works.
 */
export interface Feature { title: string; what: string; where?: string; check?: string; added?: string }
export interface FeatureSection { emoji: string; title: string; items: Feature[] }

export const FEATURES: FeatureSection[] = [
  {
    emoji: '🚀', title: 'Getting started',
    items: [
      { title: 'Install on your phone', what: 'Add the app to your Home Screen — no App Store needed. On iPhone, notifications only work from the Home Screen app.', where: 'Safari → Share → Add to Home Screen (Android: Chrome → ⋮ → Install app)', check: 'A Daily Assistant icon appears and opens full-screen' },
      { title: 'Log in with a 6-digit code', what: 'No password. Type your email, get a code by email, type it in. Invite-only.', where: 'Opening the app', check: 'Code arrives within a minute (check Spam); wrong code is refused; uninvited email is refused' },
      { title: 'Setup guide', what: 'Three steps right after you join: Home Screen → turn on notifications → send a test.', where: 'After Welcome, or Settings → Install & notification help', check: 'The test notification pops up' },
    ],
  },
  {
    emoji: '☀️', title: 'Today',
    items: [
      { title: 'Your day at a glance', what: 'Progress ring, what is due next, and your reminders grouped by Morning, Afternoon, After Dinner and Night.', where: 'Today tab', check: 'The current time slot is highlighted "Due now / Up next"' },
      { title: 'Tick, skip or undo', what: 'Tap the circle when done, ⏭ to skip on purpose, and tap again (or Undo) if it was a mistake.', where: 'Today tab', check: 'Ring updates; Undo puts it back' },
      { title: 'Check in from a notification', what: 'Tapping a reminder opens a check-in: tick what you did, submit. Anything left unticked is saved as missed.', where: 'Tap a notification, or "Check in" on Today', check: 'Unticked items show as "Missed" in Progress' },
      { title: 'Snooze', what: 'Not now? Get reminded again in 10, 30 or 60 minutes.', where: 'Check-in screen', check: 'A "Snoozed" notification arrives at that time' },
      { title: 'App icon badge', what: 'The app icon shows how many reminders are due and not done yet.', where: 'Home Screen icon', check: 'The number goes away when everything due is ticked' },
    ],
  },
  {
    emoji: '💊', title: 'Medicines & reminders',
    items: [
      { title: 'Quick start', what: 'One tap fills the pattern (once/twice daily, weekly, 5-day course, SOS) or a habit (walk, sleep, read…). You add the medicine name and dose as prescribed.', where: 'Reminders → Add', check: 'Medicine buttons never fill in a medicine name or dose' },
      { title: 'Times & repeat', what: 'Pick one or more daily times (or an exact time) and repeat every day, some days, monthly or once.', where: 'Reminders → Add → Time / Repeat' },
      { title: 'Course length', what: '"For 5 days" or "until a date" — reminders stop by themselves.', where: 'Add → More options → Course', check: 'List shows "Day 2 of 5", then "Course finished"' },
      { title: 'Remind me again', what: 'Like an alarm: repeat every 5–30 minutes, up to 3 times, until you tick it.', where: 'Add → More options (default in Settings)', check: 'Repeats stop as soon as you tick, check in or snooze' },
      { title: 'Only when needed (SOS)', what: 'For medicines taken only when needed — no reminders, just a "Took one" button that logs the time.', where: 'Add → "Only when needed (SOS)"', check: 'Today shows "Taken 2× today · last 3:10 PM"; it never lowers your score', added: '2026-11-11' },
      { title: 'Edit, pause or delete', what: 'Change anything later, pause a reminder without losing it, or delete it (history stays).', where: 'Reminders tab' },
    ],
  },
  {
    emoji: '🧴', title: 'Stock & refills',
    items: [
      { title: 'Refill alerts', what: 'Tell the app how much you have; it counts down every dose you tick and warns you before it runs out.', where: 'Add → More options → Refill alert', check: 'A "Running low" notification every morning until you refill' },
      { title: 'Add a refill', what: '"I bought 15 more" — 3 left + 15 = 18, and counting continues.', where: 'Tap the refill notification, the Today banner, or Edit → + Add a refill', added: '2026-11-10' },
    ],
  },
  {
    emoji: '💧', title: 'Water',
    items: [
      { title: 'Water reminders', what: 'Every 30 min to 3 hours between your chosen times, with a daily goal. They stop once you reach it.', where: 'Reminders → Add → 💧 Drink water, or Settings', check: '"Time for water" notifications; tapping one adds a glass', added: '2026-11-10' },
      { title: 'Glass counter', what: '+ Glass / Undo on Today. Not part of your medicine score.', where: 'Today tab' },
    ],
  },
  {
    emoji: '✅', title: 'Daily tasks',
    items: [
      { title: 'Daily checklist', what: 'Your own list of things to do each day. Tick them, then Submit Day. It resets every morning.', where: 'Tasks tab (Manage to add / reorder / delete)', check: 'After Submit you see "X of Y done" and can\'t change it' },
      { title: 'Week view', what: 'A grid of the week: done, missed or not submitted for every task.', where: 'Tasks → calendar icon' },
    ],
  },
  {
    emoji: '📊', title: 'Progress',
    items: [
      { title: 'Overview & streak', what: 'Completion for the last 7/14/30 days, a daily chart and your streak.', where: 'Progress tab' },
      { title: 'This week & Sunday summary', what: '"71% done — most often missed: Monday mornings". Also sent as a notification every Sunday night.', where: 'Progress tab; Sunday at your Night time', added: '2026-11-11' },
      { title: 'Fix past days', what: 'Forgot to tick something? Mark any of the last 60 days as Taken, Missed or Skipped.', where: 'Progress → Calendar → tap a day', check: 'Future days can\'t be changed', added: '2026-11-11' },
      { title: 'Report for your doctor', what: 'Taken / missed / % per medicine, SOS doses and a day-by-day list. Print or save as PDF.', where: 'Progress → Report for your doctor', check: 'On iPhone: Print → Share → Save to Files', added: '2026-11-11' },
    ],
  },
  {
    emoji: '👪', title: 'Family',
    items: [
      { title: 'Follow a family member', what: 'See if Mummy or Papa took their medicines today, their week, and low stock. Only medicines are shared — habits, water and tasks stay private.', where: 'Settings → Family → Add → Follow someone’s medicines', check: 'Nothing is shared until they tap Accept on your invite link', added: '2026-11-14' },
      { title: 'Let family follow you', what: 'Send an invite so your son or daughter knows you’re okay. Stop it anytime.', where: 'Settings → Family → Add → Let someone follow my medicines', added: '2026-11-14' },
      { title: '"Not taken yet" alerts', what: 'If they haven’t ticked a medicine 30 min / 1 hour / 2 hours after its time, you get a notification. Plus a morning warning when their medicine runs low.', where: 'Family → tap the person → Alert me…', check: 'Alert arrives once per dose, never if they ticked it or are on holiday', added: '2026-11-14' },
      { title: 'Manage for them', what: 'If they allow it, add or change their medicines and tick doses for them — handy for parents who don’t use phones much.', where: 'Family → person → Add medicine / ✓', check: 'Without their permission these buttons don’t appear and changes are refused', added: '2026-11-14' },
      { title: 'Family on Today', what: 'One line per person you follow: "Mummy · 2 of 3 taken · 1 not taken yet".', where: 'Today tab', added: '2026-11-14' },
    ],
  },
  {
    emoji: '⚙️', title: 'Settings',
    items: [
      { title: 'Your notification times', what: 'Choose when Morning, Afternoon, After Dinner and Night happen.', where: 'Settings' },
      { title: 'Holiday mode', what: 'Pause every reminder while travelling or unwell. Nothing counts as missed; it switches back on by itself.', where: 'Settings → 🌴 Holiday mode', check: 'Today shows the banner and "Resume now"', added: '2026-11-11' },
      { title: 'Theme', what: 'Light, dark, or follow the phone.', where: 'Settings → Theme' },
      { title: 'Send feedback', what: 'Tell us what to improve — it goes straight to the app owner by email.', where: 'Settings → Send feedback' },
      { title: 'Your data', what: 'Download everything as a file, or delete your account and all data for good.', where: 'Settings → Your data' },
    ],
  },
  {
    emoji: '🔒', title: 'Privacy & safety',
    items: [
      { title: 'Private by design', what: 'Only you can see your medicines and history. No ads, no trackers, nothing sold.' },
      { title: 'Never medical advice', what: 'The app only reminds you of what you enter. It never suggests medicines, doses or changes.' },
      { title: 'Problems reported automatically', what: 'If something breaks, the app tells the owner (the error only — never your medicines) so it can be fixed.', added: '2026-11-12' },
    ],
  },
  {
    emoji: '✉️', title: 'For the app owner',
    items: [
      { title: 'Invite people', what: 'Add someone\'s email, send the invite on WhatsApp, see who has joined, remove invites.', where: 'Settings → Invite people (owner only)', added: '2026-11-12' },
    ],
  },
];
