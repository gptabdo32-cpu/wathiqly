import React from 'react';
import { useBehavioralBiometrics } from '@/hooks/useBehavioralBiometrics';
import { trpc } from '@/lib/trpc';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock } from 'lucide-react';

export const BehavioralBiometricsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Initialize the data collection hook
  useBehavioralBiometrics();

  // Check if the account is locked due to behavioral mismatch
  const { data: patternStatus } = trpc.behavioral.getPatternStatus.useQuery(undefined, {
    refetchInterval: 60000, // Check every minute
  });

  if (patternStatus?.isLocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="max-w-md w-full p-6">
          <Alert variant="destructive" className="border-2">
            <Lock className="h-5 w-5" />
            <AlertTitle className="text-lg font-bold mr-2">تم قفل الحساب مؤقتاً</AlertTitle>
            <AlertDescription className="mt-2 text-base">
              تم اكتشاف نمط استخدام غير معتاد لا يتطابق مع سلوك صاحب الحساب. 
              لحماية بياناتك، تم قفل الوصول مؤقتاً. يرجى التواصل مع الدعم الفني أو إعادة التحقق عبر الهوية الوطنية.
            </AlertDescription>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => window.location.href = '/verify'}
                className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md font-medium hover:opacity-90 transition-opacity"
              >
                التحقق من الهوية الآن
              </button>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
