import React, { useState, useEffect } from "react";
import { trpc } from "../lib/trpc";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Smartphone, IdCard, Camera, Loader2, AlertCircle } from "lucide-react";

const IdentityVerification = () => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [selfieImage, setSelfieImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: status, refetch: refetchStatus } = trpc.verify.getStatus.useQuery();
  const sendOtpMutation = trpc.verify.sendOtp.useMutation();
  const checkOtpMutation = trpc.verify.checkOtp.useMutation();
  const uploadIdMutation = trpc.verify.uploadId.useMutation();
  const uploadSelfieMutation = trpc.verify.uploadSelfie.useMutation();
  const faceMatchMutation = trpc.verify.faceMatch.useMutation();

  useEffect(() => {
    if (status) {
      if (status.verificationLevel === 1) setStep(2);
      else if (status.verificationLevel === 2) setStep(3);
      else if (status.verificationLevel === 3) setStep(5);
    }
  }, [status]);

  const handleSendOtp = async () => {
    try {
      await sendOtpMutation.mutateAsync({ phone });
      toast.success("تم إرسال رمز التحقق بنجاح");
    } catch (error: any) {
      toast.error(error.message || "فشل إرسال الرمز");
    }
  };

  const handleVerifyOtp = async () => {
    try {
      await checkOtpMutation.mutateAsync({ phone, otp });
      toast.success("تم التحقق من الهاتف بنجاح");
      setStep(2);
      refetchStatus();
    } catch (error: any) {
      toast.error(error.message || "رمز التحقق غير صحيح");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'id' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'id') setIdCardImage(reader.result as string);
        else setSelfieImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadId = async () => {
    if (!idCardImage) return;
    setIsProcessing(true);
    try {
      const base64 = idCardImage.split(',')[1];
      await uploadIdMutation.mutateAsync({ idCardImageBase64: base64 });
      toast.success("تم رفع الهوية بنجاح");
      setStep(3);
      refetchStatus();
    } catch (error: any) {
      toast.error(error.message || "فشل رفع الهوية");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadSelfieAndMatch = async () => {
    if (!selfieImage) return;
    setIsProcessing(true);
    try {
      const base64 = selfieImage.split(',')[1];
      await uploadSelfieMutation.mutateAsync({ selfieImageBase64: base64 });
      const result = await faceMatchMutation.mutateAsync();
      if (result.isVerified) {
        toast.success("تم التحقق من الهوية بنجاح!");
        setStep(5);
      } else {
        toast.error(`فشل التحقق: نسبة التطابق ${result.score}% أقل من المطلوب`);
        setStep(4);
      }
      refetchStatus();
    } catch (error: any) {
      toast.error(error.message || "حدث خطأ أثناء المعالجة");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto py-10 px-4 max-w-2xl">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">التحقق من الهوية</h1>
        <p className="text-muted-foreground">أكمل الخطوات التالية لتأمين حسابك وزيادة حدود المعاملات</p>
      </div>

      {/* Stepper */}
      <div className="flex justify-between mb-8 relative">
        {[1, 2, 3, 4, 5].map((s) => (
          <div key={s} className="flex flex-col items-center z-10">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
              step >= s ? "bg-primary border-primary text-primary-foreground" : "bg-background border-muted text-muted-foreground"
            }`}>
              {step > s ? <CheckCircle2 className="w-6 h-6" /> : s}
            </div>
          </div>
        ))}
        <div className="absolute top-5 left-0 w-full h-0.5 bg-muted -z-0"></div>
        <div className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-300 -z-0" style={{ width: `${(step - 1) * 25}%` }}></div>
      </div>

      <Card>
        <CardHeader>
          {step === 1 && (
            <>
              <CardTitle className="flex items-center gap-2"><Smartphone className="w-5 h-5" /> التحقق من الهاتف</CardTitle>
              <CardDescription>أدخل رقم هاتفك الليبي لتلقي رمز التحقق (OTP)</CardDescription>
            </>
          )}
          {step === 2 && (
            <>
              <CardTitle className="flex items-center gap-2"><IdCard className="w-5 h-5" /> رفع الهوية الوطنية</CardTitle>
              <CardDescription>قم برفع صورة واضحة لبطاقة الهوية الوطنية الخاصة بك</CardDescription>
            </>
          )}
          {step === 3 && (
            <>
              <CardTitle className="flex items-center gap-2"><Camera className="w-5 h-5" /> التقاط سيلفي</CardTitle>
              <CardDescription>التقط صورة سيلفي واضحة لمطابقتها مع صورة الهوية</CardDescription>
            </>
          )}
          {step === 4 && (
            <>
              <CardTitle className="flex items-center gap-2 text-destructive"><AlertCircle className="w-5 h-5" /> فشل التحقق</CardTitle>
              <CardDescription>لم نتمكن من مطابقة وجهك مع صورة الهوية. يرجى المحاولة مرة أخرى.</CardDescription>
            </>
          )}
          {step === 5 && (
            <>
              <CardTitle className="flex items-center gap-2 text-green-600"><CheckCircle2 className="w-5 h-5" /> تم التحقق بنجاح</CardTitle>
              <CardDescription>حسابك الآن موثق بالكامل ويمكنك إجراء معاملات غير محدودة.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="09XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <Button onClick={handleSendOtp} disabled={sendOtpMutation.isPending}>إرسال</Button>
              </div>
              <Input placeholder="أدخل رمز التحقق (6 أرقام)" value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} />
              <Button className="w-full" onClick={handleVerifyOtp} disabled={checkOtpMutation.isPending || otp.length !== 6}>تأكيد الرمز</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => document.getElementById('id-upload')?.click()}>
                {idCardImage ? (
                  <img src={idCardImage} alt="ID Card" className="max-h-48 mx-auto rounded" />
                ) : (
                  <div className="flex flex-col items-center">
                    <IdCard className="w-12 h-12 text-muted-foreground mb-2" />
                    <p>انقر لرفع صورة الهوية</p>
                  </div>
                )}
                <input id="id-upload" type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'id')} />
              </div>
              <Button className="w-full" onClick={handleUploadId} disabled={!idCardImage || isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                رفع ومعالجة الهوية
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => document.getElementById('selfie-upload')?.click()}>
                {selfieImage ? (
                  <img src={selfieImage} alt="Selfie" className="max-h-48 mx-auto rounded-full w-48 h-48 object-cover" />
                ) : (
                  <div className="flex flex-col items-center">
                    <Camera className="w-12 h-12 text-muted-foreground mb-2" />
                    <p>انقر لالتقاط/رفع صورة سيلفي</p>
                  </div>
                )}
                <input id="selfie-upload" type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => handleImageUpload(e, 'selfie')} />
              </div>
              <Button className="w-full" onClick={handleUploadSelfieAndMatch} disabled={!selfieImage || isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                إتمام التحقق
              </Button>
            </div>
          )}

          {step === 4 && (
            <Button className="w-full" onClick={() => setStep(2)}>إعادة المحاولة من خطوة الهوية</Button>
          )}

          {step === 5 && (
            <div className="text-center py-4">
              <div className="bg-green-100 text-green-700 p-4 rounded-lg mb-4">
                <p className="font-bold">نسبة التطابق: {status?.faceMatchScore}%</p>
              </div>
              <Button className="w-full" onClick={() => window.location.href = '/dashboard'}>الذهاب للوحة التحكم</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IdentityVerification;
