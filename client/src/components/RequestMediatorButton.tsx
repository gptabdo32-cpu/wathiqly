import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Shield, Clock, DollarSign, AlertCircle } from "lucide-react";

interface RequestMediatorButtonProps {
  conversationId: number;
  onMediatorRequested?: () => void;
}

export default function RequestMediatorButton({
  conversationId,
  onMediatorRequested,
}: RequestMediatorButtonProps) {
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const requestMediatorMutation = trpc.mediator.requestMediator.useMutation();

  const handleRequestMediator = async () => {
    if (!reason.trim()) {
      toast.error("يرجى إدخال السبب");
      return;
    }

    setIsLoading(true);
    try {
      await requestMediatorMutation.mutateAsync({
        conversationId,
        reason: reason.trim(),
      });

      toast.success("تم طلب الوسيط بنجاح!");
      setIsDialogOpen(false);
      setIsConfirmOpen(false);
      setReason("");
      onMediatorRequested?.();
    } catch (error: any) {
      toast.error(error.message || "فشل طلب الوسيط");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Request Mediator Button */}
      <Button
        onClick={() => setIsDialogOpen(true)}
        className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2"
      >
        <Shield className="w-4 h-4" />
        طلب وسيط (+10 دينار)
      </Button>

      {/* Main Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">طلب وسيط</DialogTitle>
            <DialogDescription className="text-center text-gray-600">
              احصل على مساعدة من وسيط محترف لحل النزاع
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-3">
              {/* Fee Card */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 text-center">
                <div className="flex justify-center mb-2">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-xs text-gray-600">الرسم</p>
                <p className="text-lg font-bold text-blue-600">10 دينار</p>
              </div>

              {/* Time Card */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3 text-center">
                <div className="flex justify-center mb-2">
                  <Clock className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-xs text-gray-600">الوقت</p>
                <p className="text-lg font-bold text-green-600">ساعتين</p>
              </div>
            </div>

            {/* Warning Box */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold">ملاحظة مهمة:</p>
                <p className="text-xs mt-1">
                  سيتم تعيين وسيط في غضون ساعتين. الوسيط سيكون جزءًا من هذه الدردشة ولن يتمكن أحد من حذف رسائله.
                </p>
              </div>
            </div>

            {/* Reason Input */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                اشرح سبب طلبك للوسيط
              </label>
              <Textarea
                placeholder="مثال: البائع لم يسلم المنتج في الموعد المتفق عليه..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="min-h-24 resize-none"
              />
              <p className="text-xs text-gray-500">
                الحد الأدنى: 10 أحرف | الحد الأقصى: 500 حرف
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="flex-1"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => setIsConfirmOpen(true)}
                disabled={!reason.trim() || reason.length < 10}
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                متابعة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد طلب الوسيط</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p>هل أنت متأكد من رغبتك في طلب وسيط؟</p>
              <div className="bg-gray-50 p-3 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">الرسم:</span>
                  <span className="font-semibold text-red-600">-10 دينار</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">وقت الانتظار:</span>
                  <span className="font-semibold">حتى ساعتين</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 italic">
                سيتم خصم 10 دينار من رصيدك فوراً. الوسيط سيدخل الدردشة قريباً.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRequestMediator}
              disabled={isLoading}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
            >
              {isLoading ? "جاري الطلب..." : "تأكيد الطلب"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
