import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface TimedLinkViewerProps {
  token: string;
}

export function TimedLinkViewer({ token }: TimedLinkViewerProps) {
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>("");

  // Fetch timed link details
  const { data: link, isLoading, error } = trpc.timedLinks.getByToken.useQuery(
    { token },
    { enabled: !!token }
  );

  // Use timed link mutation
  const useLink = trpc.timedLinks.use.useMutation({
    onSuccess: (data) => {
      // Redirect to escrow creation page
      navigate(`/create-transaction?escrowId=${data.escrowId}`);
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  // Calculate time remaining
  useEffect(() => {
    if (!link) return;

    const updateTimer = () => {
      const now = new Date();
      const expiresAt = new Date(link.expiresAt);
      const diff = expiresAt.getTime() - now.getTime();

      if (diff <= 0) {
        setTimeRemaining("منتهية الصلاحية");
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeRemaining(`${hours}س ${minutes}د ${seconds}ث`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [link]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (error || !link) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md p-6 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">خطأ</h2>
          <p className="text-gray-600 mb-4">
            {error?.message || "لم يتم العثور على الرابط"}
          </p>
          <Button onClick={() => navigate("/")} className="w-full">
            العودة للرئيسية
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              صفقة جاهزة للشراء
            </h1>
            <p className="text-gray-600">
              تم إرسال هذا الرابط من قبل البائع. اضغط على "تأكيد وحجز الأموال" لقبول الصفقة.
            </p>
          </div>

          {/* Seller Info */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">معلومات البائع</h3>
            <div className="flex items-center gap-4">
              {link.seller.profileImage && (
                <img
                  src={link.seller.profileImage}
                  alt={link.seller.name}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{link.seller.name}</p>
                {link.seller.isTrustedSeller && (
                  <Badge className="mt-1 bg-green-100 text-green-800">
                    ✓ بائع موثوق
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Deal Details */}
          <div className="mb-8 space-y-4">
            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                اسم الصفقة
              </h3>
              <p className="text-lg font-semibold text-gray-900">
                {link.title}
              </p>
            </div>

            {link.description && (
              <div className="border-b pb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  الوصف
                </h3>
                <p className="text-gray-700">{link.description}</p>
              </div>
            )}

            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                نوع الصفقة
              </h3>
              <p className="text-gray-700">
                {link.dealType === "physical" && "سلعة مادية"}
                {link.dealType === "digital_account" && "حساب رقمي"}
                {link.dealType === "service" && "خدمة"}
              </p>
            </div>

            <div className="border-b pb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                المبلغ
              </h3>
              <p className="text-3xl font-bold text-blue-600">
                {link.amount} د.ل
              </p>
            </div>

            <div className="pb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                رسوم المنصة
              </h3>
              <p className="text-gray-700">
                {link.commissionPercentage}% ({link.commissionPaidBy === "buyer" ? "يدفعها المشتري" : "يدفعها البائع"})
              </p>
            </div>
          </div>

          {/* Expiration Timer */}
          <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <span className="font-semibold">⏳ صلاحية الرابط:</span> {timeRemaining}
            </p>
          </div>

          {/* Specifications */}
          {link.specifications && Object.keys(link.specifications).length > 0 && (
            <div className="mb-8 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                تفاصيل إضافية
              </h3>
              <div className="space-y-2">
                {Object.entries(link.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-600">{key}:</span>
                    <span className="text-gray-900 font-medium">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={() => setShowConfirm(true)}
              className="flex-1 bg-green-600 hover:bg-green-700"
              disabled={useLink.isPending}
            >
              {useLink.isPending ? "جاري المعالجة..." : "✓ تأكيد وحجز الأموال"}
            </Button>
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              className="flex-1"
            >
              إلغاء
            </Button>
          </div>

          {/* Confirmation Dialog */}
          <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
            <AlertDialogContent>
              <AlertDialogTitle>تأكيد الصفقة</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من قبول هذه الصفقة؟ سيتم حجز المبلغ {link.amount} د.ل من محفظتك.
              </AlertDialogDescription>
              <div className="flex gap-4">
                <AlertDialogAction
                  onClick={() => {
                    useLink.mutate({ token });
                    setShowConfirm(false);
                  }}
                  className="bg-green-600 hover:bg-green-700"
                >
                  نعم، أوافق
                </AlertDialogAction>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </Card>

        {/* Info Section */}
        <Card className="mt-8 p-6 bg-blue-50">
          <h3 className="font-semibold text-blue-900 mb-3">ℹ️ معلومات مهمة</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• هذا الرابط صالح فقط للمشتري الذي تم إرساله له</li>
            <li>• بعد انتهاء الصلاحية، لن تتمكن من استخدام هذا الرابط</li>
            <li>• عند تأكيد الصفقة، ستنتقل إلى صفحة الدفع</li>
            <li>• يمكنك إلغاء الصفقة قبل إتمام الدفع</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
