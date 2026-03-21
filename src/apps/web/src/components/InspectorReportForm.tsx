import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Upload, X, CheckCircle } from "lucide-react";

interface InspectorReportFormProps {
  reportId: number;
  onSuccess?: () => void;
}

export function InspectorReportForm({ reportId, onSuccess }: InspectorReportFormProps) {
  const [formData, setFormData] = useState({
    summary: "",
    conditionScore: 7,
    exterior: "",
    interior: "",
    functional: "",
    defects: [] as string[],
    mediaUrls: [] as string[],
  });

  const [newDefect, setNewDefect] = useState("");
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Submit report mutation
  const submitReport = trpc.inspectionService.submitReport.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      onSuccess?.();
    },
    onError: (error) => {
      alert(`خطأ: ${error.message}`);
    },
  });

  const handleAddDefect = () => {
    if (newDefect.trim()) {
      setFormData({
        ...formData,
        defects: [...formData.defects, newDefect],
      });
      setNewDefect("");
    }
  };

  const handleRemoveDefect = (index: number) => {
    setFormData({
      ...formData,
      defects: formData.defects.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = () => {
    if (!formData.summary.trim()) {
      alert("يرجى إدخال ملخص التقرير");
      return;
    }

    if (formData.mediaUrls.length === 0) {
      alert("يرجى إضافة صور للتقرير");
      return;
    }

    submitReport.mutate({
      reportId,
      summary: formData.summary,
      conditionScore: formData.conditionScore,
      findings: {
        exterior: formData.exterior,
        interior: formData.interior,
        functional: formData.functional,
        defects: formData.defects,
      },
      mediaUrls: formData.mediaUrls,
    });

    setShowSubmit(false);
  };

  if (submitted) {
    return (
      <Card className="p-6 bg-green-50">
        <div className="flex items-start gap-4">
          <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-green-900 mb-2">تم إرسال التقرير</h3>
            <p className="text-green-800 text-sm">
              تم إرسال التقرير بنجاح. سيقوم المشتري بمراجعة التقرير والموافقة عليه.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">نموذج تقرير المعاينة</h3>

        <div className="space-y-6">
          {/* Summary */}
          <div>
            <Label htmlFor="summary">ملخص التقرير *</Label>
            <Textarea
              id="summary"
              placeholder="اكتب ملخص شامل لحالة السلعة..."
              value={formData.summary}
              onChange={(e) =>
                setFormData({ ...formData, summary: e.target.value })
              }
              rows={4}
            />
          </div>

          {/* Condition Score */}
          <div>
            <Label>درجة الحالة: {formData.conditionScore}/10</Label>
            <Slider
              value={[formData.conditionScore]}
              onValueChange={(value) =>
                setFormData({ ...formData, conditionScore: value[0] })
              }
              min={1}
              max={10}
              step={1}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>سيئة جداً</span>
              <span>ممتازة</span>
            </div>
          </div>

          {/* Exterior */}
          <div>
            <Label htmlFor="exterior">الحالة الخارجية</Label>
            <Textarea
              id="exterior"
              placeholder="وصف الحالة الخارجية للسلعة..."
              value={formData.exterior}
              onChange={(e) =>
                setFormData({ ...formData, exterior: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Interior */}
          <div>
            <Label htmlFor="interior">الحالة الداخلية</Label>
            <Textarea
              id="interior"
              placeholder="وصف الحالة الداخلية للسلعة..."
              value={formData.interior}
              onChange={(e) =>
                setFormData({ ...formData, interior: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Functional */}
          <div>
            <Label htmlFor="functional">الحالة الوظيفية</Label>
            <Textarea
              id="functional"
              placeholder="اختبر جميع الوظائف واكتب ملاحظاتك..."
              value={formData.functional}
              onChange={(e) =>
                setFormData({ ...formData, functional: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Defects */}
          <div>
            <Label>العيوب المكتشفة</Label>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="أضف عيب مكتشف..."
                value={newDefect}
                onChange={(e) => setNewDefect(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    handleAddDefect();
                  }
                }}
              />
              <Button
                onClick={handleAddDefect}
                variant="outline"
                type="button"
              >
                إضافة
              </Button>
            </div>

            {formData.defects.length > 0 && (
              <div className="mt-3 space-y-2">
                {formData.defects.map((defect, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-red-50 p-2 rounded"
                  >
                    <span className="text-sm text-red-900">{defect}</span>
                    <button
                      onClick={() => handleRemoveDefect(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Media Upload */}
          <div>
            <Label>الصور والملفات الموثقة *</Label>
            <div className="mt-2 p-4 border-2 border-dashed rounded-lg text-center">
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                اسحب الصور هنا أو اضغط للاختيار
              </p>
              <Input
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                id="media-upload"
              />
              <Button
                onClick={() =>
                  document.getElementById("media-upload")?.click()
                }
                variant="outline"
                size="sm"
              >
                اختر الصور
              </Button>
            </div>

            {formData.mediaUrls.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {formData.mediaUrls.map((url, index) => (
                  <div key={index} className="relative">
                    <img
                      src={url}
                      alt={`صورة ${index + 1}`}
                      className="w-full h-24 object-cover rounded"
                    />
                    <button
                      onClick={() => {
                        setFormData({
                          ...formData,
                          mediaUrls: formData.mediaUrls.filter(
                            (_, i) => i !== index
                          ),
                        });
                      }}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Button
            onClick={() => setShowSubmit(true)}
            className="w-full bg-green-600 hover:bg-green-700"
            disabled={submitReport.isPending}
          >
            {submitReport.isPending ? "جاري الإرسال..." : "إرسال التقرير"}
          </Button>
        </div>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={showSubmit} onOpenChange={setShowSubmit}>
        <AlertDialogContent>
          <AlertDialogTitle>تأكيد إرسال التقرير</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من إرسال التقرير؟ تأكد من دقة جميع المعلومات قبل الإرسال.
          </AlertDialogDescription>
          <div className="flex gap-4">
            <AlertDialogAction
              onClick={handleSubmit}
              className="bg-green-600 hover:bg-green-700"
            >
              نعم، أرسل التقرير
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
