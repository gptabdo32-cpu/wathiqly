import crypto from "crypto";

/**
 * Generates a cryptographically secure 6-digit OTP.
 * Replaces Math.random() which is not suitable for security purposes.
 */
export function generateOTP(): string {
  // Generate 4 bytes of random data
  const buffer = crypto.randomBytes(4);
  // Convert to a 32-bit unsigned integer
  const randomInt = buffer.readUInt32BE(0);
  // Scale to a 6-digit number (100,000 to 999,999)
  const otp = (randomInt % 900000) + 100000;
  return otp.toString();
}

export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  // In a real application, this would integrate with an SMS gateway like Twilio, Nexmo, etc.
  // For now, we'll just log the message.
  console.log(`Sending SMS to ${phoneNumber}: ${message}`);
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
}
