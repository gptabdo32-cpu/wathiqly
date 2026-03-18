/**
 * Simple logic verification script
 * Tests the core functionality of livenessDetectionEnhanced without vitest
 */

import {
  analyzeVideoForLivenessEnhanced,
  clearAnalysisCache,
  getCacheStats,
} from "./_core/livenessDetectionEnhanced.ts";

async function runTests() {
  console.log("🚀 Starting logic verification...");

  try {
    // Test 1: Cache Stats
    console.log("\nTest 1: Checking initial cache stats...");
    const initialStats = getCacheStats();
    console.log("Initial stats:", initialStats);
    if (initialStats.size !== 0) throw new Error("Initial cache size should be 0");
    console.log("✅ Test 1 passed");

    // Test 2: Invalid URL
    console.log("\nTest 2: Checking invalid URL rejection...");
    try {
      await analyzeVideoForLivenessEnhanced("invalid-url", ["eye_blink"], false);
      throw new Error("Should have rejected invalid URL");
    } catch (error: any) {
      if (error.code === "BAD_REQUEST") {
        console.log("Caught expected error:", error.message);
        console.log("✅ Test 2 passed");
      } else {
        throw error;
      }
    }

    // Test 3: Cache clearing
    console.log("\nTest 3: Checking cache clearing...");
    clearAnalysisCache();
    const clearedStats = getCacheStats();
    if (clearedStats.size !== 0) throw new Error("Cache should be empty after clearing");
    console.log("✅ Test 3 passed");

    console.log("\n✨ All core logic tests passed successfully!");
  } catch (error) {
    console.error("\n❌ Logic verification failed:");
    console.error(error);
    process.exit(1);
  }
}

runTests();
