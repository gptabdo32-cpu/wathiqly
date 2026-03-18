import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import {
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Zap,
  TrendingUp,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface AiArbitratorAnalysisProps {
  escrowId: number;
}

export const AiArbitratorAnalysis: React.FC<AiArbitratorAnalysisProps> = ({ escrowId }) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    loopholes: true,
    recommendations: true,
    clauses: false,
  });

  const { data: analysis, isLoading, refetch } = trpc.smartEscrow.getEscrowAnalysis.useQuery(
    { escrowId },
    { enabled: !!escrowId }
  );

  const analyzeContractMutation = trpc.smartEscrow.analyzeEscrowContract.useMutation({
    onSuccess: () => {
      toast.success('تم تحليل العقد بنجاح');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message || 'فشل تحليل العقد');
    },
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'medium':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'high':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'critical':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getRiskLevelIcon = (level: string) => {
    switch (level) {
      case 'low':
        return <CheckCircle2 size={20} />;
      case 'medium':
        return <AlertTriangle size={20} />;
      case 'high':
        return <AlertOctagon size={20} />;
      case 'critical':
        return <AlertCircle size={20} />;
      default:
        return <AlertCircle size={20} />;
    }
  };

  const getRiskLevelLabel = (level: string) => {
    switch (level) {
      case 'low':
        return 'منخفض';
      case 'medium':
        return 'متوسط';
      case 'high':
        return 'مرتفع';
      case 'critical':
        return 'حرج';
      default:
        return 'غير محدد';
    }
  };

  if (isLoading) {
    return (
      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Zap size={20} />
            </div>
            <div>
              <CardTitle className="text-lg">المساعد القانوني الذكي</CardTitle>
              <CardDescription>تحليل ذكي لشروط العقد</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-blue-600" size={24} />
            <span className="ml-2 text-slate-600">جاري التحميل...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!analysis) {
    return (
      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Zap size={20} />
              </div>
              <div>
                <CardTitle className="text-lg">المساعد القانوني الذكي</CardTitle>
                <CardDescription>تحليل ذكي لشروط العقد</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-slate-600 mb-4">لم يتم تحليل هذا العقد بعد. اضغط على الزر أدناه لتحليل شروط العقد باستخدام الذكاء الاصطناعي.</p>
            <Button
              onClick={() => analyzeContractMutation.mutate({ escrowId })}
              disabled={analyzeContractMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {analyzeContractMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin ml-2" size={16} />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <Zap className="ml-2" size={16} />
                  تحليل العقد الآن
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const analysisData = analysis.analysisResults as any;

  return (
    <div className="space-y-6 font-arabic" dir="rtl">
      {/* Tracking Path Section */}
      {analysisData?.trackingPath && (
        <Card className="border-blue-100 shadow-sm overflow-hidden">
          <div className="bg-blue-600 px-4 py-2 text-white text-xs font-bold flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            تتبع المسار الفعلي للمنصة (Manus Forge API)
          </div>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 justify-between">
              {analysisData.trackingPath.map((step: any, index: number) => (
                <div key={index} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step.status === 'completed' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700">{step.step}</span>
                    <span className="text-[10px] text-slate-400">{new Date(step.timestamp).toLocaleTimeString('ar-SA')}</span>
                  </div>
                  {index < analysisData.trackingPath.length - 1 && (
                    <div className="hidden md:block w-8 h-[1px] bg-slate-200 mx-2" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legal Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
        <AlertTriangle className="text-amber-600 flex-shrink-0" size={18} />
        <p className="text-[10px] text-amber-800 leading-relaxed">
          <strong>إخلاء مسؤولية:</strong> هذا التحليل يتم بواسطة الذكاء الاصطناعي (Legal LLM) عبر Manus Forge وهو مخصص للأغراض الاسترشادية فقط. لا يعتبر هذا التحليل نصيحة قانونية رسمية. منصة وثّقلي تخلي مسؤوليتها عن أي قرارات تُتخذ بناءً على هذا التحليل.
        </p>
      </div>

      {/* Main Analysis Card */}
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Zap size={20} />
              </div>
              <div>
                <CardTitle className="text-lg">المساعد القانوني الذكي</CardTitle>
                <CardDescription>تحليل ذكي لشروط العقد</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => analyzeContractMutation.mutate({ escrowId })}
              disabled={analyzeContractMutation.isPending}
            >
              {analyzeContractMutation.isPending ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCw size={16} />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Fairness Score */}
            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-slate-600">درجة العدالة</span>
                <TrendingUp className="text-blue-600" size={18} />
              </div>
              <div className="flex items-end gap-3">
                <div className="text-4xl font-bold text-blue-600">{analysis.fairnessScore}</div>
                <div className="text-sm text-slate-500 mb-1">/100</div>
              </div>
              <div className="mt-3 w-full bg-slate-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${analysis.fairnessScore}%` }}
                />
              </div>
            </div>

            {/* Legal Risk Level */}
            <div className={`p-4 rounded-xl border ${getRiskLevelColor(analysis.legalRiskLevel)}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">مستوى المخاطر القانونية</span>
                {getRiskLevelIcon(analysis.legalRiskLevel)}
              </div>
              <div className="text-2xl font-bold">{getRiskLevelLabel(analysis.legalRiskLevel)}</div>
              <p className="text-xs mt-2 opacity-75">
                {analysis.legalRiskLevel === 'low' && 'العقد آمن قانوناً مع مخاطر منخفضة'}
                {analysis.legalRiskLevel === 'medium' && 'هناك بعض المخاطر التي يجب معالجتها'}
                {analysis.legalRiskLevel === 'high' && 'يوجد مخاطر قانونية كبيرة تحتاج إلى انتباه'}
                {analysis.legalRiskLevel === 'critical' && 'هناك مخاطر حرجة يجب معالجتها فوراً'}
              </p>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
            <h4 className="font-bold text-slate-900 mb-2">الملخص</h4>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.summary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Loopholes Section */}
      {analysisData?.loopholes && analysisData.loopholes.length > 0 && (
        <Card className="border-red-100 shadow-sm">
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-slate-50"
            onClick={() => toggleSection('loopholes')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                  <AlertOctagon size={20} />
                </div>
                <div>
                  <CardTitle className="text-lg">الثغرات القانونية</CardTitle>
                  <CardDescription>{analysisData.loopholes.length} ثغرة محددة</CardDescription>
                </div>
              </div>
              {expandedSections.loopholes ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
          {expandedSections.loopholes && (
            <CardContent>
              <div className="space-y-3">
                {analysisData.loopholes.map((loophole: string, index: number) => (
                  <div key={index} className="flex gap-3 p-3 rounded-lg bg-red-50 border border-red-100">
                    <div className="flex-shrink-0 mt-1">
                      <AlertOctagon className="text-red-600" size={18} />
                    </div>
                    <p className="text-sm text-red-700">{loophole}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Recommendations Section */}
      {analysisData?.recommendations && analysisData.recommendations.length > 0 && (
        <Card className="border-green-100 shadow-sm">
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-slate-50"
            onClick={() => toggleSection('recommendations')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <CardTitle className="text-lg">التوصيات</CardTitle>
                  <CardDescription>{analysisData.recommendations.length} توصية للتحسين</CardDescription>
                </div>
              </div>
              {expandedSections.recommendations ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
          {expandedSections.recommendations && (
            <CardContent>
              <div className="space-y-3">
                {analysisData.recommendations.map((recommendation: string, index: number) => (
                  <div key={index} className="flex gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
                    <div className="flex-shrink-0 mt-1">
                      <CheckCircle2 className="text-green-600" size={18} />
                    </div>
                    <p className="text-sm text-green-700">{recommendation}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Clauses Analysis Section */}
      {analysisData?.clauses_analysis && analysisData.clauses_analysis.length > 0 && (
        <Card className="border-purple-100 shadow-sm">
          <CardHeader
            className="pb-3 cursor-pointer hover:bg-slate-50"
            onClick={() => toggleSection('clauses')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <CardTitle className="text-lg">تحليل البنود</CardTitle>
                  <CardDescription>{analysisData.clauses_analysis.length} بند تم تحليله</CardDescription>
                </div>
              </div>
              {expandedSections.clauses ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </div>
          </CardHeader>
          {expandedSections.clauses && (
            <CardContent>
              <div className="space-y-4">
                {analysisData.clauses_analysis.map((clause: any, index: number) => (
                  <div key={index} className="p-4 rounded-lg border border-slate-100 bg-slate-50">
                    <div className="flex items-start justify-between mb-2">
                      <p className="text-sm font-medium text-slate-900 flex-1">{clause.clause}</p>
                      <Badge
                        className={`ml-2 ${
                          clause.status === 'fair'
                            ? 'bg-green-100 text-green-700'
                            : clause.status === 'unfair'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {clause.status === 'fair' ? 'عادل' : clause.status === 'unfair' ? 'غير عادل' : 'غير واضح'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-600">{clause.comment}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Metadata */}
      <div className="text-xs text-slate-400 text-center">
        تم التحليل بواسطة {analysis.modelUsed} • {analysis.tokensUsed} رمز مستخدم
      </div>
    </div>
  );
};
