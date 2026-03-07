import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CheckCircle, AlertCircle, Loader } from "lucide-react";

interface RequestInspectionProps {
  escrowId: number;
  onSuccess?: () => void;
}

export function RequestInspection({ escrowId, onSuccess }: RequestInspectionProps) {
  const [specialty, setSpecialty] = useState<string>("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [requestedInspection, setRequestedInspection] = useState<any>(null);

  // Fetch current inspection report
  const { data: report, isLoading: reportLoading } = trpc.inspectionService.getReport.useQuery(
    { escrowId },
    { enabled: !!escrowId }
  );

  // Request inspection mutation
  const requestInspection = trpc.inspectionService.requestInspection.useMutation({
    onSuccess: (data) => {
      setRequestedInspection(data);
      setShowConfirm(false);
      onSuccess?.();
    },
    onError: (error) => {
      alert(`خطأ: ${error.message}`);
    },
  });

  const handleRequestInspection = () => {
    requestInspection.mutate({
      escrowId,
      specialtyRequired: specialty || undefined,
    });
  };

  if (reportLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center">
          <Loader className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  // If inspection already requested
  if (report) {
    return (
      <Card className="p-6 bg-blue-50">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 mb-2">تم طلب معاينة</h3>
            <p className="text-blue-800 text-sm mb-4">
              تم تعيين فاحص معتمد لفحص السلعة. سيقوم الفاحص برفع التقرير قريباً.
            </p>
            
            {report.inspector && (
              <div className="bg-white rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-600 mb-2">الفاحص المعتمد:</p>
                <p className="font-semibold text-gray-900">{report.inspector.name}</p>
              </div>
            )}

            <Badge className={`
              ${report.status === "pending" && "bg-yellow-100 text-yellow-800"}
              ${report.status === "completed" && "bg-blue-100 text-blue-800"}
              ${report.status === "approved" && "bg-green-100 text-green-800"}
              ${report.status === "rejected" && "bg-red-100 text-red-800"}
            `}>
              {report.status === "pending" && "⏳ في الانتظار"}
              {report.status === "completed" && "✓ مكتمل"}
              {report.status === "approved" && "✓ موافق عليه"}
              {report.status === "rejected" && "✗ مرفوض"}
            </Badge>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>🔍 خدمة المعاينة الميدانية</span>
      </h3>

      <p className="text-gray-600 text-sm mb-6">
        اطلب معاينة ميدانية موثقة للسلعة. سيقوم فاحص معتمد بفحص السلعة وتصويرها وتقديم تقرير مفصل.
      </p>

      <div className="space-y-4">
        <div>
          <Label htmlFor="specialty">نوع السلعة (اختياري)</Label>
          <Select value={specialty} onValueChange={setSpecialty}>
            <SelectTrigger>
              <SelectValue placeholder="اختر نوع السلعة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="electronics">إلكترونيات</SelectItem>
              <SelectItem value="cars">سيارات</SelectItem>
              <SelectItem value="real_estate">عقارات</SelectItem>
              <SelectItem value="jewelry">مجوهرات</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <p className="text-sm text-blue-900 font-semibold mb-2">ℹ️ معلومات مهمة:</p>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• رسوم المعاينة: 20 د.ل</li>
            <li>• سيتم تعيين فاحص معتمد</li>
            <li>• التقرير يتضمن صور وتقييم مفصل</li>
            <li>• يمكنك الموافقة أو الرفض بعد الاطلاع على التقرير</li>
          </ul>
        </div>

        <Button
          onClick={() => setShowConfirm(true)}
          className="w-full bg-blue-600 hover:bg-blue-700"
          disabled={requestInspection.isPending}
        >
          {requestInspection.isPending ? "جاري المعالجة..." : "طلب معاينة"}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogTitle>تأكيد طلب المعاينة</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من طلب معاينة ميدانية؟ ستكون هناك رسوم معاينة بقيمة 20 د.ل.
          </AlertDialogDescription>
          <div className="flex gap-4">
            <AlertDialogAction
              onClick={handleRequestInspection}
              className="bg-blue-600 hover:bg-blue-700"
            >
              نعم، اطلب المعاينة
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Message */}
      {requestedInspection && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-green-900">تم طلب المعاينة بنجاح</p>
              <p className="text-sm text-green-800 mt-1">
                تم تعيين الفاحص: <span className="font-semibold">{requestedInspection.assignedAgent.name}</span>
              </p>
              <p className="text-sm text-green-800">
                الموقع: {requestedInspection.assignedAgent.location}
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
