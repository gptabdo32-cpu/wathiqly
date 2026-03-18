/**
 * Liveness Verification Page
 * Complete flow for identity verification with liveness detection
 */

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import LivenessDetectionEnhanced from "@/components/LivenessDetectionEnhanced";
import LivenessResultsDisplay from "@/components/LivenessResultsDisplay";

interface VerificationStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  error?: string;
}

export default function LivenessVerificationPage() {
  const [currentStep, setCurrentStep] = useState<string>("start");
  const [sessionId, setSessionId] = useState<string>("");
  const [challenges, setChallenges] = useState<string[]>([]);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const [steps, setSteps] = useState<VerificationStep[]>([
    {
      id: "start",
      title: "البدء",
      description: "ابدأ عملية التحقق من الهوية",
      completed: false,
    },
    {
      id: "liveness",
      title: "كشف الحيوية",
      description: "قم بإجراء اختبارات الحيوية التفاعلية",
      completed: false,
    },
    {
      id: "analysis",
      title: "التحليل",
      description: "جاري تحليل النتائج",
      completed: false,
    },
    {
      id: "complete",
      title: "مكتمل",
      description: "تم التحقق من الهوية بنجاح",
      completed: false,
    },
  ]);

  const startSessionMutation = trpc.liveness.startSession.useMutation();
  const getStatusQuery = trpc.liveness.getStatus.useQuery();

  // Start verification session
  const handleStartVerification = async () => {
    try {
      const result = await startSessionMutation.mutateAsync({
        challengeCount: 3,
      });

      setSessionId(result.sessionId);
      setChallenges(result.challenges);
      setCurrentStep("liveness");

      // Update steps
      setSteps((prev) =>
        prev.map((step) =>
          step.id === "start" ? { ...step, completed: true } : step
        )
      );

      toast.success("تم بدء جلسة التحقق");
    } catch (error) {
      toast.error("فشل في بدء جلسة التحقق");
      console.error(error);
    }
  };

  // Handle liveness detection completion
  const handleLivenessComplete = (result: any) => {
    setVerificationResult(result);
    setCurrentStep("analysis");

    // Update steps
    setSteps((prev) =>
      prev.map((step) =>
        step.id === "liveness" ? { ...step, completed: true } : step
      )
    );

    // Simulate analysis
    setTimeout(() => {
      if (result.success) {
        setCurrentStep("complete");
        setSteps((prev) =>
          prev.map((step) =>
            step.id === "complete"
              ? { ...step, completed: true }
              : step.id === "analysis"
              ? { ...step, completed: true }
              : step
          )
        );
        toast.success("تم التحقق من الهوية بنجاح!");
      } else {
        setSteps((prev) =>
          prev.map((step) =>
            step.id === "analysis"
              ? {
                  ...step,
                  error: result.warnings?.[0] || "فشل التحقق من الحيوية",
                }
              : step
          )
        );
        toast.error("فشل التحقق من الحيوية");
        setCurrentStep("complete");
      }
    }, 2000);
  };

  // Handle error
  const handleError = (error: string) => {
    toast.error(error);
    setSteps((prev) =>
      prev.map((step) =>
        step.id === currentStep
          ? { ...step, error }
          : step
      )
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            التحقق من الهوية
          </h1>
          <p className="text-gray-600">
            نظام آمن للتحقق من الهوية باستخدام كشف الحيوية التفاعلي
          </p>
        </div>

        {/* Steps Progress */}
        <div className="mb-8">
          <div className="grid grid-cols-4 gap-4">
            {steps.map((step, index) => (
              <div key={step.id} className="relative">
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-2 ${
                    step.completed
                      ? "bg-green-500 text-white"
                      : step.error
                      ? "bg-red-500 text-white"
                      : currentStep === step.id
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {step.completed ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : step.error ? (
                    <AlertTriangle className="w-6 h-6" />
                  ) : (
                    <span className="font-bold">{index + 1}</span>
                  )}
                </div>
                <p className="text-center text-sm font-medium text-gray-900">
                  {step.title}
                </p>
                {step.error && (
                  <p className="text-center text-xs text-red-600 mt-1">
                    {step.error}
                  </p>
                )}

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div
                    className={`absolute top-6 left-[60%] w-[40%] h-1 ${
                      step.completed ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {currentStep === "start" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  مرحباً بك
                </h2>
                <p className="text-gray-600 mb-4">
                  سيتم التحقق من هويتك من خلال نظام كشف الحيوية التفاعلي الآمن.
                  هذا النظام يستخدم تقنيات متقدمة للتأكد من أنك شخص حي وليس صورة أو فيديو مسجل.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left space-y-2">
                <h3 className="font-semibold text-blue-900 mb-2">
                  ما الذي سيحدث:
                </h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>✓ سيتم طلب إجراء حركات عشوائية (رمش، ابتسامة، تحريك الرأس)</li>
                  <li>✓ سيتم تسجيل الفيديو وتحليله باستخدام الذكاء الاصطناعي</li>
                  <li>✓ سيتم حذف الفيديو بعد التحليل تلقائياً</li>
                  <li>✓ النتيجة ستكون متاحة فوراً</li>
                </ul>
              </div>

              <Button
                onClick={handleStartVerification}
                disabled={startSessionMutation.isPending}
                size="lg"
                className="w-full"
              >
                {startSessionMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    جاري البدء...
                  </>
                ) : (
                  "ابدأ التحقق الآن"
                )}
              </Button>
            </div>
          )}

          {currentStep === "liveness" && sessionId && (
            <LivenessDetectionEnhanced
              sessionId={sessionId}
              challenges={challenges}
              onComplete={handleLivenessComplete}
              onError={handleError}
            />
          )}

          {currentStep === "analysis" && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-yellow-600 animate-spin" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  جاري التحليل
                </h2>
                <p className="text-gray-600">
                  يتم تحليل الفيديو والتحقق من الحيوية...
                </p>
              </div>
            </div>
          )}

          {currentStep === "complete" && verificationResult && (
            <>
              <LivenessResultsDisplay
                livenessScore={verificationResult.livenessScore}
                riskScore={verificationResult.riskScore}
                challenges={verificationResult.challenges}
                presentationAttackDetected={verificationResult.presentationAttackDetected}
                presentationAttackType={verificationResult.presentationAttackType}
                warnings={verificationResult.warnings}
                success={verificationResult.success}
              />

              <div className="mt-6 flex gap-4">
                <Button
                  onClick={() => (window.location.href = "/")}
                  size="lg"
                  className="flex-1"
                >
                  العودة إلى الرئيسية
                </Button>
                {!verificationResult.success && (
                  <Button
                    onClick={() => {
                      setCurrentStep("start");
                      setSessionId("");
                      setChallenges([]);
                      setVerificationResult(null);
                    }}
                    size="lg"
                    variant="outline"
                    className="flex-1"
                  >
                    حاول مرة أخرى
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Security Info */}
        <Card className="mt-8 p-6 bg-gray-50 border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">🔒 معلومات الأمان</h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li>
              ✓ جميع البيانات مشفرة باستخدام معايير التشفير الدولية
            </li>
            <li>
              ✓ الفيديو يتم حذفه تلقائياً بعد التحليل
            </li>
            <li>
              ✓ النظام متوافق مع معايير ISO 30107-3 الدولية
            </li>
            <li>
              ✓ تم اختبار النظام ضد أنواع مختلفة من الهجمات
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
