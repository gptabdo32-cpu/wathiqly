/**
 * Simple Liveness Detection Test
 * Runs directly with tsx to verify core logic
 */

import {
  generateRandomChallenges,
  calculateComprehensiveRiskScore,
  validateLivenessResult,
  ChallengeType,
} from "./_core/livenessDetection";

async function runTests() {
  console.log("🚀 Starting Liveness Detection Tests...");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  // Test 1: Challenge Generation
  console.log("\n--- Test 1: Challenge Generation ---");
  const challenges = generateRandomChallenges(3);
  assert(challenges.length === 3, "Should generate 3 challenges");
  assert(new Set(challenges).size === 3, "Should not have duplicates");
  
  const allValid = challenges.every(c => Object.values(ChallengeType).includes(c));
  assert(allValid, "All challenges should be valid types");

  // Test 2: Risk Score Calculation
  console.log("\n--- Test 2: Risk Score Calculation ---");
  const mockResult = {
    sessionId: "test",
    livenessScore: 90,
    riskScore: 10,
    isLive: true,
    challenges: [
      { challenge: ChallengeType.EYE_BLINK, detected: true, confidence: 95, details: {} }
    ],
    presentationAttackDetected: false,
    warnings: [],
    timestamp: Date.now(),
  };

  const risk1 = calculateComprehensiveRiskScore(mockResult);
  assert(risk1 === 10, "Risk score should match base risk when no issues");

  const mockResultFail = {
    ...mockResult,
    challenges: [{ challenge: ChallengeType.EYE_BLINK, detected: false, confidence: 10, details: {} }],
    riskScore: 20
  };
  const risk2 = calculateComprehensiveRiskScore(mockResultFail);
  assert(risk2 === 30, "Risk score should increase by 10 for failed challenge (20 + 10)");

  // Test 3: Result Validation
  console.log("\n--- Test 3: Result Validation ---");
  const val1 = validateLivenessResult(mockResult);
  assert(val1.isValid === true, "Should be valid for good scores");

  const mockResultLow = { ...mockResult, livenessScore: 50 };
  const val2 = validateLivenessResult(mockResultLow);
  assert(val2.isValid === false, "Should be invalid for low liveness score");

  const mockResultAttack = { ...mockResult, presentationAttackDetected: true, presentationAttackType: "mask" };
  const val3 = validateLivenessResult(mockResultAttack);
  assert(val3.isValid === false, "Should be invalid when attack detected");

  console.log(`\n--- Summary ---`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
