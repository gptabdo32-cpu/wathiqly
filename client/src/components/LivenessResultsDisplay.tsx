/**
 * Liveness Results Display Component
 * Shows detailed analysis results and challenge completion status
 */

import React from "react";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Shield,
  AlertTriangle,
} from "lucide-react";

interface ChallengeResult {
  challenge: string;
  detected: boolean;
  confidence: number;
}

interface LivenessResultsProps {
  livenessScore: number;
  riskScore: number;
  challenges: ChallengeResult[];
  presentationAttackDetected: boolean;
  presentationAttackType?: string;
  warnings: string[];
  success: boolean;
}

export const LivenessResultsDisplay: React.FC<LivenessResultsProps> = ({
  livenessScore,
  riskScore,
  challenges,
  presentationAttackDetected,
  presentationAttackType,
  warnings,
  success,
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 75) return "bg-green-50";
    if (score >= 50) return "bg-yellow-50";
    return "bg-red-50";
  };

  const getRiskColor = (score: number) => {
    if (score <= 25) return "text-green-600";
    if (score <= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getRiskBgColor = (score: number) => {
    if (score <= 25) return "bg-green-50";
    if (score <= 50) return "bg-yellow-50";
    return "bg-red-50";
  };

  const getChallengeDescription = (challenge: string): string => {
    const descriptions: Record<string, string> = {
      eye_blink: "رمش العينين",
      smile: "الابتسامة",
      head_turn_left: "تحريك الرأس لليسار",
      head_turn_right: "تحريك الرأس لليمين",
      head_nod: "إيماءة الرأس",
      look_up: "النظر لأعلى",
    };
    return descriptions[challenge] || challenge;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Main Status */}
      <Card
        className={`p-6 border-2 ${
          success
            ? "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex items-center gap-4">
          {success ? (
            <CheckCircle2 className="w-12 h-12 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-12 h-12 text-red-600 flex-shrink-0" />
          )}
          <div>
            <h3
              className={`text-2xl font-bold ${
                success ? "text-green-900" : "text-red-900"
              }`}
            >
              {success ? "✅ تم التحقق بنجاح!" : "❌ فشل التحقق"}
            </h3>
            <p
              className={`text-sm ${
                success ? "text-green-700" : "text-red-700"
              }`}
            >
              {success
                ? "تم التحقق من حيويتك بنجاح"
                : "لم يتم التحقق من الحيوية"}
            </p>
          </div>
        </div>
      </Card>

      {/* Scores */}
      <div className="grid grid-cols-2 gap-4">
        {/* Liveness Score */}
        <Card className={`p-4 ${getScoreBgColor(livenessScore)}`}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={`w-5 h-5 ${getScoreColor(livenessScore)}`} />
            <span className="text-sm font-medium text-gray-700">
              درجة الحيوية
            </span>
          </div>
          <div className={`text-3xl font-bold ${getScoreColor(livenessScore)}`}>
            {livenessScore}
            <span className="text-lg">/100</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {livenessScore >= 75
              ? "ممتاز"
              : livenessScore >= 50
              ? "جيد"
              : "ضعيف"}
          </p>
        </Card>

        {/* Risk Score */}
        <Card className={`p-4 ${getRiskBgColor(riskScore)}`}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className={`w-5 h-5 ${getRiskColor(riskScore)}`} />
            <span className="text-sm font-medium text-gray-700">
              درجة المخاطرة
            </span>
          </div>
          <div className={`text-3xl font-bold ${getRiskColor(riskScore)}`}>
            {riskScore}
            <span className="text-lg">/100</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {riskScore <= 25
              ? "آمن"
              : riskScore <= 50
              ? "متوسط"
              : "مرتفع"}
          </p>
        </Card>
      </div>

      {/* Challenges */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          التحديات المكتملة
        </h3>
        <div className="space-y-3">
          {challenges.map((challenge, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex-1">
                <p className="font-medium text-sm">
                  {getChallengeDescription(challenge.challenge)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  الثقة: {challenge.confidence}%
                </p>
              </div>
              {challenge.detected ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Presentation Attack Detection */}
      {presentationAttackDetected && (
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900 mb-1">
                ⚠️ تحذير: اكتشاف محاولة تزييف
              </h3>
              <p className="text-sm text-red-800 mb-2">
                تم اكتشاف محاولة تزييف من نوع:{" "}
                <span className="font-medium">{presentationAttackType}</span>
              </p>
              <p className="text-xs text-red-700">
                يرجى المحاولة مرة أخرى بطريقة طبيعية وحقيقية.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Warnings */}
      {warnings && warnings.length > 0 && (
        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            ملاحظات
          </h3>
          <ul className="space-y-2">
            {warnings.map((warning, index) => (
              <li key={index} className="text-sm text-yellow-800 flex items-start gap-2">
                <span className="text-yellow-600 mt-0.5">•</span>
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Detailed Stats */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">📊 إحصائيات مفصلة</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">التحديات المكتملة</p>
            <p className="text-2xl font-bold text-gray-900">
              {challenges.filter((c) => c.detected).length}/{challenges.length}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600 mb-1">متوسط الثقة</p>
            <p className="text-2xl font-bold text-gray-900">
              {Math.round(
                challenges.reduce((sum, c) => sum + c.confidence, 0) /
                  challenges.length
              )}
              %
            </p>
          </div>
        </div>
      </Card>

      {/* Security Info */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-800">
          <span className="font-semibold">🔒 معلومات الأمان:</span> جميع البيانات
          مشفرة ومحمية. الفيديو سيتم حذفه تلقائياً بعد التحليل.
        </p>
      </Card>
    </div>
  );
};

export default LivenessResultsDisplay;
