import crypto from "crypto";

export function generateOTP(): string {
  // Generate a 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  // In a real application, this would integrate with an SMS gateway like Twilio, Nexmo, etc.
  // For now, we'll just log the message.
  console.log(`Sending SMS to ${phoneNumber}: ${message}`);
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
}
