import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, AlertCircle, Star, MapPin, User } from "lucide-react";
import { Loader } from "lucide-react";

interface InspectionReportViewerProps {
  escrowId: number;
  onApprove?: () => void;
  onReject?: () => void;
}

export function InspectionReportViewer({
  escrowId,
  onApprove,
  onReject,
}: InspectionReportViewerProps) {
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  // Fetch inspection report
  const { data: report, isLoading } = trpc.inspectionService.getReport.useQuery(
    { escrowId },
    { enabled: !!escrowId }
  );

  // Approve report mutation
  const approveReport = trpc.inspectionService.approveReport.useMutation({
    onSuccess: () => {
      onApprove?.();
    },
    onError: (error) => {
      alert(`خطأ: ${error.message}`);
    },
  });

  // Reject report mutation
  const rejectReport = trpc.inspectionService.rejectReport.useMutation({
    onSuccess: () => {
      setShowRejectDialog(false);
      setRejectReason("");
      onReject?.();
    },
    onError: (error) => {
      alert(`خطأ: ${error.message}`);
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  if (!report) {
    return null;
  }

  // Helper function to get status badge
  const getStatusBadge = () => {
    switch (report.status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            ⏳ في الانتظار
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-blue-100 text-blue-800">
            ✓ مكتمل
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800">
            ✓ موافق عليه
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800">
            ✗ مرفوض
          </Badge>
        );
      default:
        return null;
    }
  };

  // Helper function to get condition color
  const getConditionColor = (score: number) => {
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-yellow-600";
    if (score >= 4) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              تقرير المعاينة الميدانية
            </h3>
            <p className="text-sm text-gray-600">
              تم إعداد هذا التقرير بواسطة فاحص معتمد
            </p>
          </div>
          {getStatusBadge()}
        </div>
      </Card>

      {/* Inspector Info */}
      {report.inspector && (
        <Card className="p-6">
          <h4 className="font-semibold text-gray-900 mb-4">معلومات الفاحص</h4>
          <div className="flex items-start gap-4">
            {report.inspector.profileImage && (
              <img
                src={report.inspector.profileImage}
                alt={report.inspector.name}
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div className="flex-1">
              <p className="font-semibold text-gray-900">
                {report.inspector.name}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500" />
                  معتمد
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Report Content */}
      {report.status !== "pending" && (
        <>
          {/* Summary */}
          <Card className="p-6">
            <h4 className="font-semibold text-gray-900 mb-4">ملخص التقرير</h4>
            <p className="text-gray-700 leading-relaxed">{report.summary}</p>
          </Card>

          {/* Condition Score */}
          <Card className="p-6">
            <h4 className="font-semibold text-gray-900 mb-4">درجة الحالة</h4>
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold ${getConditionColor(report.conditionScore)}`}>
                {report.conditionScore}
              </div>
              <div className="flex-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      report.conditionScore >= 8
                        ? "bg-green-600"
                        : report.conditionScore >= 6
                        ? "bg-yellow-600"
                        : report.conditionScore >= 4
                        ? "bg-orange-600"
                        : "bg-red-600"
                    }`}
                    style={{
                      width: `${(report.conditionScore / 10) * 100}%`,
                    }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {report.conditionScore >= 8 && "حالة ممتازة"}
                  {report.conditionScore >= 6 && report.conditionScore < 8 && "حالة جيدة"}
                  {report.conditionScore >= 4 && report.conditionScore < 6 && "حالة مقبولة"}
                  {report.conditionScore < 4 && "حالة سيئة"}
                </p>
              </div>
            </div>
          </Card>

          {/* Findings */}
          {report.findings && (
            <Card className="p-6">
              <h4 className="font-semibold text-gray-900 mb-4">الملاحظات التفصيلية</h4>
              <div className="space-y-4">
                {report.findings.exterior && (
                  <div>
                    <p className="font-medium text-gray-900 mb-1">الحالة الخارجية</p>
                    <p className="text-gray-700">{report.findings.exterior}</p>
                  </div>
                )}
                {report.findings.interior && (
                  <div>
                    <p className="font-medium text-gray-900 mb-1">الحالة الداخلية</p>
                    <p className="text-gray-700">{report.findings.interior}</p>
                  </div>
                )}
                {report.findings.functional && (
                  <div>
                    <p className="font-medium text-gray-900 mb-1">الحالة الوظيفية</p>
                    <p className="text-gray-700">{report.findings.functional}</p>
                  </div>
                )}
                {report.findings.defects && report.findings.defects.length > 0 && (
                  <div>
                    <p className="font-medium text-gray-900 mb-2">العيوب المكتشفة</p>
                    <ul className="space-y-1">
                      {report.findings.defects.map((defect, index) => (
                        <li key={index} className="flex items-start gap-2 text-red-700">
                          <span className="text-red-500 mt-1">•</span>
                          <span>{defect}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Media Gallery */}
          {report.mediaUrls && report.mediaUrls.length > 0 && (
            <Card className="p-6">
              <h4 className="font-semibold text-gray-900 mb-4">الصور الموثقة</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {report.mediaUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <img
                      src={url}
                      alt={`صورة ${index + 1}`}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Pending State */}
      {report.status === "pending" && (
        <Card className="p-6 bg-yellow-50">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-yellow-900 mb-2">
                جاري إعداد التقرير
              </h4>
              <p className="text-yellow-800 text-sm">
                الفاحص المعتمد قيد الفحص الآن. سيتم رفع التقرير قريباً.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Action Buttons */}
      {report.status === "completed" && (
        <div className="flex gap-3">
          <Button
            onClick={() => approveReport.mutate({ reportId: report.id })}
            className="flex-1 bg-green-600 hover:bg-green-700"
            disabled={approveReport.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {approveReport.isPending ? "جاري الموافقة..." : "الموافقة على التقرير"}
          </Button>
          <Button
            onClick={() => setShowRejectDialog(true)}
            variant="outline"
            className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
            disabled={rejectReport.isPending}
          >
            <XCircle className="w-4 h-4 mr-2" />
            رفض التقرير
          </Button>
        </div>
      )}

      {/* Approved State */}
      {report.status === "approved" && (
        <Card className="p-6 bg-green-50">
          <div className="flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-green-900 mb-2">
                تم الموافقة على التقرير
              </h4>
              <p className="text-green-800 text-sm">
                يمكنك الآن المتابعة مع عملية الشراء.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogTitle>رفض التقرير</AlertDialogTitle>
          <AlertDialogDescription>
            يرجى توضيح سبب رفضك للتقرير
          </AlertDialogDescription>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">السبب *</Label>
              <Textarea
                id="reject-reason"
                placeholder="اشرح سبب رفضك للتقرير..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex gap-4">
              <Button
                onClick={() => {
                  if (!rejectReason.trim()) {
                    alert("يرجى إدخال سبب الرفض");
                    return;
                  }
                  rejectReport.mutate({
                    reportId: report.id,
                    reason: rejectReason,
                  });
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
                disabled={rejectReport.isPending}
              >
                {rejectReport.isPending ? "جاري الرفض..." : "رفض"}
              </Button>
              <Button
                onClick={() => setShowRejectDialog(false)}
                variant="outline"
                className="flex-1"
              >
                إلغاء
              </Button>
            </div>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
