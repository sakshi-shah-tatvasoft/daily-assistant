// Server-side translations for push notifications (English is the key; missing → English).
// Variables use {name}. Medicine names / things users typed are never translated.
const D = {
  hi: {
    '☀️ Morning': '☀️ सुबह', '🌤️ Afternoon': '🌤️ दोपहर', '🌙 After Dinner': '🌙 रात के खाने के बाद', '🔔 Overall': '🔔 रात',
    'after meal': 'खाने के बाद', 'before meal': 'खाने से पहले', 'with meal': 'खाने के साथ',
    'Still pending · {slot}': 'अभी बाकी · {slot}', '+{n} more': '+{n} और',
    '⏰ Reminder · {time}': '⏰ रिमाइंडर · {time}', 'Still pending · Reminder': 'अभी बाकी · रिमाइंडर', 'Reminder': 'रिमाइंडर',
    '🧴 Out of stock': '🧴 ख़त्म हो गई', '🧴 Running low': '🧴 कम बची है',
    "{title} — time to refill. Tap when you've bought more.": '{title} — रीफ़िल का समय। और ख़रीदने पर टैप करें।',
    "{title} — only {n} {unit} left. Tap when you've bought more.": '{title} — सिर्फ़ {n} {unit} बची। और ख़रीदने पर टैप करें।',
    "{title} — {n} {unit} left (about {days} days). Tap when you've bought more.": '{title} — {n} {unit} बची (लगभग {days} दिन)। और ख़रीदने पर टैप करें।',
    "{title} — {n} {unit} left (about 1 day). Tap when you've bought more.": '{title} — {n} {unit} बची (लगभग 1 दिन)। और ख़रीदने पर टैप करें।',
    '⏰ Snoozed · {label}': '⏰ स्नूज़ · {label}',
    '💧 Time for water': '💧 पानी का समय', '{n} of {goal} glasses so far. Tap to add a glass.': 'अब तक {goal} में से {n} गिलास। गिलास जोड़ने के लिए टैप करें।',
    '{n} of {goal} glass so far. Tap to add a glass.': 'अब तक {goal} में से {n} गिलास। गिलास जोड़ने के लिए टैप करें।',
    '📊 Your week: {pct}% done': '📊 आपका हफ़्ता: {pct}% पूरा',
    'Every one of your {n} doses & habits this week — wonderful! 🎉': 'इस हफ़्ते आपकी सभी {n} डोज़ और आदतें पूरी — शानदार! 🎉',
    '{done} of {total} done this week.': 'इस हफ़्ते {total} में से {done} पूरे।', ' Most often missed: {pattern}.': ' सबसे ज़्यादा छूटा: {pattern}।',
    '{day} {slot}': '{day} {slot}',
    'Monday': 'सोमवार', 'Tuesday': 'मंगलवार', 'Wednesday': 'बुधवार', 'Thursday': 'गुरुवार', 'Friday': 'शुक्रवार', 'Saturday': 'शनिवार', 'Sunday': 'रविवार',
    'mornings': 'सुबह', 'afternoons': 'दोपहर', 'after-dinner doses': 'रात के खाने के बाद की डोज़', 'night check-ins': 'रात के चेक-इन', 'exact-time reminders': 'सही-समय वाले रिमाइंडर', 'reminders': 'रिमाइंडर',
    "👀 {name} hasn't marked a medicine": '👀 {name} ने दवा मार्क नहीं की', '{list} ({time}) — not ticked yet.': '{list} ({time}) — अभी टिक नहीं हुई।',
    '{a} & {b}': '{a} और {b}', '{a}, {b} +{n} more': '{a}, {b} +{n} और',
    "🧴 {name}'s medicine is out of stock": '🧴 {name} की दवा ख़त्म हो गई', "🧴 {name}'s medicine is running low": '🧴 {name} की दवा कम बची है',
    '{title} — time to refill.': '{title} — रीफ़िल का समय।', '{title} — {n} {unit} left.': '{title} — {n} {unit} बची।',
    '{title} — {n} {unit} left (about {days} days).': '{title} — {n} {unit} बची (लगभग {days} दिन)।', '{title} — {n} {unit} left (about 1 day).': '{title} — {n} {unit} बची (लगभग 1 दिन)।',
    '🔔 Daily Assistant Test': '🔔 Daily Assistant टेस्ट', 'Your push notifications are working perfectly!': 'आपके पुश नोटिफिकेशन बिल्कुल ठीक चल रहे हैं!',
    'tablets': 'गोलियाँ', 'capsules': 'कैप्सूल', 'ml': 'ml', 'doses': 'डोज़', 'sachets': 'पाउच', 'drops': 'बूँदें',
  },
  gu: {
    '☀️ Morning': '☀️ સવાર', '🌤️ Afternoon': '🌤️ બપોર', '🌙 After Dinner': '🌙 રાત્રે જમ્યા પછી', '🔔 Overall': '🔔 રાત',
    'after meal': 'જમ્યા પછી', 'before meal': 'જમતા પહેલા', 'with meal': 'જમતી વખતે',
    'Still pending · {slot}': 'હજુ બાકી · {slot}', '+{n} more': '+{n} વધુ',
    '⏰ Reminder · {time}': '⏰ રિમાઇન્ડર · {time}', 'Still pending · Reminder': 'હજુ બાકી · રિમાઇન્ડર', 'Reminder': 'રિમાઇન્ડર',
    '🧴 Out of stock': '🧴 ખલાસ થઈ ગઈ', '🧴 Running low': '🧴 ઓછી બચી છે',
    "{title} — time to refill. Tap when you've bought more.": '{title} — રિફિલનો સમય. વધુ લાવો ત્યારે ટેપ કરો.',
    "{title} — only {n} {unit} left. Tap when you've bought more.": '{title} — ફક્ત {n} {unit} બાકી. વધુ લાવો ત્યારે ટેપ કરો.',
    "{title} — {n} {unit} left (about {days} days). Tap when you've bought more.": '{title} — {n} {unit} બાકી (લગભગ {days} દિવસ). વધુ લાવો ત્યારે ટેપ કરો.',
    "{title} — {n} {unit} left (about 1 day). Tap when you've bought more.": '{title} — {n} {unit} બાકી (લગભગ 1 દિવસ). વધુ લાવો ત્યારે ટેપ કરો.',
    '⏰ Snoozed · {label}': '⏰ સ્નૂઝ · {label}',
    '💧 Time for water': '💧 પાણીનો સમય', '{n} of {goal} glasses so far. Tap to add a glass.': 'અત્યાર સુધી {goal}માંથી {n} ગ્લાસ. ગ્લાસ ઉમેરવા ટેપ કરો.',
    '{n} of {goal} glass so far. Tap to add a glass.': 'અત્યાર સુધી {goal}માંથી {n} ગ્લાસ. ગ્લાસ ઉમેરવા ટેપ કરો.',
    '📊 Your week: {pct}% done': '📊 તમારું અઠવાડિયું: {pct}% પૂરું',
    'Every one of your {n} doses & habits this week — wonderful! 🎉': 'આ અઠવાડિયે તમારા બધા {n} ડોઝ અને આદતો પૂરાં — અદ્ભુત! 🎉',
    '{done} of {total} done this week.': 'આ અઠવાડિયે {total}માંથી {done} પૂરાં.', ' Most often missed: {pattern}.': ' સૌથી વધુ ચૂક્યું: {pattern}.',
    '{day} {slot}': '{day} {slot}',
    'Monday': 'સોમવાર', 'Tuesday': 'મંગળવાર', 'Wednesday': 'બુધવાર', 'Thursday': 'ગુરુવાર', 'Friday': 'શુક્રવાર', 'Saturday': 'શનિવાર', 'Sunday': 'રવિવાર',
    'mornings': 'સવાર', 'afternoons': 'બપોર', 'after-dinner doses': 'રાત્રે જમ્યા પછીના ડોઝ', 'night check-ins': 'રાતના ચેક-ઇન', 'exact-time reminders': 'ચોક્કસ સમયવાળા રિમાઇન્ડર', 'reminders': 'રિમાઇન્ડર',
    "👀 {name} hasn't marked a medicine": '👀 {name}એ દવા માર્ક કરી નથી', '{list} ({time}) — not ticked yet.': '{list} ({time}) — હજુ ટિક થઈ નથી.',
    '{a} & {b}': '{a} અને {b}', '{a}, {b} +{n} more': '{a}, {b} +{n} વધુ',
    "🧴 {name}'s medicine is out of stock": '🧴 {name}ની દવા ખલાસ થઈ ગઈ', "🧴 {name}'s medicine is running low": '🧴 {name}ની દવા ઓછી બચી છે',
    '{title} — time to refill.': '{title} — રિફિલનો સમય.', '{title} — {n} {unit} left.': '{title} — {n} {unit} બાકી.',
    '{title} — {n} {unit} left (about {days} days).': '{title} — {n} {unit} બાકી (લગભગ {days} દિવસ).', '{title} — {n} {unit} left (about 1 day).': '{title} — {n} {unit} બાકી (લગભગ 1 દિવસ).',
    '🔔 Daily Assistant Test': '🔔 Daily Assistant ટેસ્ટ', 'Your push notifications are working perfectly!': 'તમારા પુશ નોટિફિકેશન બરાબર ચાલે છે!',
    'tablets': 'ગોળીઓ', 'capsules': 'કેપ્સ્યુલ', 'ml': 'ml', 'doses': 'ડોઝ', 'sachets': 'પાઉચ', 'drops': 'ટીપાં',
  },
};
export const LANGS = ['en', 'hi', 'gu'];
export const normLang = l => (LANGS.includes(l) ? l : 'en');
/** tr(lang, 'English {x}', { x: 1 }) */
export function tr(lang, text, vars) {
  let s = (D[lang] && D[lang][text]) || text;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
