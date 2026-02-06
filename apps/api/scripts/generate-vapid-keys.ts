#!/usr/bin/env tsx
// Generate VAPID keys for web push notifications
import webPush from 'web-push';

console.log('Generating VAPID keys for web push notifications...\n');

const vapidKeys = webPush.generateVAPIDKeys();

console.log('=== VAPID Keys Generated ===\n');
console.log('Public Key:');
console.log(vapidKeys.publicKey);
console.log('\nPrivate Key:');
console.log(vapidKeys.privateKey);
console.log('\n=== Environment Variables ===\n');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@tl-voice-inbox.local`);
console.log('\n=== Instructions ===');
console.log('1. Add these to your .env file');
console.log('2. The public key must also be shared with the frontend');
console.log('3. Keep the private key secret - never expose it in client code');
