import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle, Upload } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface KYCUploaderProps {
  onUploadComplete?: (documentUrl: string) => void;
  onError?: (error: string) => void;
}

/**
 * KYC Document Uploader Component
 * Allows users to upload identity documents for verification
 */
export function KYCUploader({ onUploadComplete, onError }: KYCUploaderProps) {
  const [documentType, setDocumentType] = useState<"passport" | "national_id" | "driver_license">("national_id");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validTypes.includes(selectedFile.type)) {
      setError("نوع الملف غير مدعوم. يرجى استخدام صور JPEG/PNG أو ملفات PDF");
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت");
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("يرجى اختيار ملف أولاً");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Simulate file upload to S3
      const formData = new FormData();
      formData.append("file", file);
      formData.append("documentType", documentType);

      // In production, this would upload to S3 and get a signed URL
      const response = await fetch("/api/upload/identity", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("فشل تحميل الملف");
      }

      const data = await response.json();
      setUploadedUrl(data.url);
      setUploadProgress(100);

      if (onUploadComplete) {
        onUploadComplete(data.url);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "حدث خطأ أثناء التحميل";
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-6 w-full">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">تحميل مستند الهوية</h3>
          <p className="text-sm text-muted-foreground">
            يرجى تحميل صورة واضحة من مستند هويتك الرسمي للتحقق من الهوية
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {uploadedUrl && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              تم تحميل المستند بنجاح. سيتم التحقق منه خلال 24 ساعة
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="document-type">نوع المستند</Label>
          <Select
            value={documentType}
            onValueChange={(value) => setDocumentType(value as any)}
            disabled={uploading || !!uploadedUrl}
          >
            <option value="national_id">بطاقة الهوية الوطنية</option>
            <option value="passport">جواز السفر</option>
            <option value="driver_license">رخصة القيادة</option>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="file-input">اختر الملف</Label>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary transition-colors">
            <Input
              id="file-input"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={handleFileSelect}
              disabled={uploading || !!uploadedUrl}
              className="hidden"
            />
            <label htmlFor="file-input" className="cursor-pointer">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">
                {file ? file.name : "اضغط لاختيار ملف أو اسحب الملف هنا"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                JPEG, PNG أو PDF (الحد الأقصى 10 ميجابايت)
              </p>
            </label>
          </div>
        </div>

        {uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>جاري التحميل...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} />
          </div>
        )}

        <Button
          onClick={handleUpload}
          disabled={!file || uploading || !!uploadedUrl}
          className="w-full"
        >
          {uploading ? "جاري التحميل..." : "تحميل المستند"}
        </Button>
      </div>
    </Card>
  );
}
