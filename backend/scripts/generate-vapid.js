const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();

console.log('\n✅ VAPID keys generated!\n');
console.log('Copy these into your backend .env file:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nCopy this into your frontend .env.local file:\n');
console.log(`VITE_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log('\n⚠️  Keep VAPID_PRIVATE_KEY secret — never put it in frontend code.\n');
