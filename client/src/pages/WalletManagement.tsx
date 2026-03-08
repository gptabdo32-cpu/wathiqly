import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { DollarSign, ArrowDownLeft, ArrowUpRight, History, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function WalletManagement() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [isLoadingDeposit, setIsLoadingDeposit] = useState(false);
  const [isLoadingWithdraw, setIsLoadingWithdraw] = useState(false);

  // التحقق من تسجيل الدخول
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">يجب تسجيل الدخول</h2>
          <p className="text-slate-600 mb-6">يجب عليك تسجيل الدخول للوصول إلى محفظتك</p>
          <Button onClick={() => setLocation("/")} className="w-full">
            العودة للرئيسية
          </Button>
        </Card>
      </div>
    );
  }

  // محاكاة الرصيد الحالي
  const currentBalance = 1500.00;
  const currency = "LYD";

  // معالجة الإيداع
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    setIsLoadingDeposit(true);
    try {
      // محاكاة عملية الإيداع
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success(`تم إضافة ${depositAmount} ${currency} إلى محفظتك بنجاح`);
      setDepositAmount("");
      
      // في الواقع، يجب استدعاء API حقيقي هنا
      // const result = await trpc.wallet.deposit.mutate({
      //   amount: parseFloat(depositAmount),
      //   paymentMethod: "card"
      // });
    } catch (error) {
      toast.error("حدث خطأ أثناء الإيداع");
    } finally {
      setIsLoadingDeposit(false);
    }
  };

  // معالجة السحب
  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error("يرجى إدخال مبلغ صحيح");
      return;
    }

    if (parseFloat(withdrawAmount) > currentBalance) {
      toast.error("الرصيد غير كافي");
      return;
    }

    if (!bankAccount) {
      toast.error("يرجى إدخال رقم الحساب البنكي");
      return;
    }

    setIsLoadingWithdraw(true);
    try {
      // محاكاة عملية السحب
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      toast.success(`تم طلب سحب ${withdrawAmount} ${currency} إلى حسابك البنكي`);
      setWithdrawAmount("");
      setBankAccount("");
      
      // في الواقع، يجب استدعاء API حقيقي هنا
      // const result = await trpc.wallet.withdraw.mutate({
      //   amount: parseFloat(withdrawAmount),
      //   bankAccount: bankAccount
      // });
    } catch (error) {
      toast.error("حدث خطأ أثناء السحب");
    } finally {
      setIsLoadingWithdraw(false);
    }
  };

  const transactions = [
    { id: 1, type: "deposit", amount: 500, date: "2026-03-07", status: "completed", description: "إيداع عبر بطاقة ائتمان" },
    { id: 2, type: "withdraw", amount: 200, date: "2026-03-06", status: "pending", description: "سحب إلى الحساب البنكي" },
    { id: 3, type: "deposit", amount: 1000, date: "2026-03-05", status: "completed", description: "إيداع عبر تحويل بنكي" },
    { id: 4, type: "withdraw", amount: 150, date: "2026-03-04", status: "completed", description: "سحب إلى الحساب البنكي" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-8">
        <div className="container max-w-6xl mx-auto px-4">
          <h1 className="text-4xl font-bold mb-2">محفظتي</h1>
          <p className="text-blue-100">إدارة رصيدك والإيداع والسحب</p>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto px-4 py-8">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 mb-2">الرصيد الحالي</p>
              <h2 className="text-5xl font-bold">{currentBalance.toFixed(2)}</h2>
              <p className="text-blue-100 mt-2">{currency}</p>
            </div>
            <DollarSign className="w-20 h-20 opacity-20" />
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="deposit" className="mb-8">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4" />
              إيداع
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4" />
              سحب
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="w-4 h-4" />
              السجل
            </TabsTrigger>
          </TabsList>

          {/* Deposit Tab */}
          <TabsContent value="deposit">
            <Card className="p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">إضافة أموال إلى محفظتك</h3>
              <form onSubmit={handleDeposit} className="space-y-6">
                <div>
                  <Label htmlFor="deposit-amount" className="text-slate-700 font-semibold mb-2 block">
                    المبلغ ({currency})
                  </Label>
                  <div className="relative">
                    <Input
                      id="deposit-amount"
                      type="number"
                      placeholder="أدخل المبلغ"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      className="pl-12"
                    />
                    <span className="absolute left-4 top-3 text-slate-500">{currency}</span>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600">
                    <strong>ملاحظة:</strong> يتم معالجة طلبات الإيداع فوراً. قد تستغرق بعض الطرق 1-2 يوم عمل.
                  </p>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-slate-900">طرق الدفع المتاحة:</h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input type="radio" name="payment" defaultChecked className="w-4 h-4" />
                      <span className="text-slate-700">بطاقة ائتمان / خصم</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input type="radio" name="payment" className="w-4 h-4" />
                      <span className="text-slate-700">تحويل بنكي</span>
                    </label>
                    <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input type="radio" name="payment" className="w-4 h-4" />
                      <span className="text-slate-700">محفظة رقمية</span>
                    </label>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full"
                  disabled={isLoadingDeposit}
                >
                  {isLoadingDeposit ? "جاري المعالجة..." : "إضافة الأموال"}
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* Withdraw Tab */}
          <TabsContent value="withdraw">
            <Card className="p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">سحب الأموال من محفظتك</h3>
              <form onSubmit={handleWithdraw} className="space-y-6">
                <div>
                  <Label htmlFor="withdraw-amount" className="text-slate-700 font-semibold mb-2 block">
                    المبلغ ({currency})
                  </Label>
                  <div className="relative">
                    <Input
                      id="withdraw-amount"
                      type="number"
                      placeholder="أدخل المبلغ"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      step="0.01"
                      min="0"
                      max={currentBalance}
                      className="pl-12"
                    />
                    <span className="absolute left-4 top-3 text-slate-500">{currency}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">الرصيد المتاح: {currentBalance.toFixed(2)} {currency}</p>
                </div>

                <div>
                  <Label htmlFor="bank-account" className="text-slate-700 font-semibold mb-2 block">
                    رقم الحساب البنكي
                  </Label>
                  <Input
                    id="bank-account"
                    type="text"
                    placeholder="أدخل رقم حسابك البنكي"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                  />
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-slate-600">
                    <strong>ملاحظة:</strong> يتم معالجة طلبات السحب خلال 1-3 أيام عمل. قد يتم تطبيق رسوم سحب حسب البنك.
                  </p>
                </div>

                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full bg-orange-600 hover:bg-orange-700"
                  disabled={isLoadingWithdraw}
                >
                  {isLoadingWithdraw ? "جاري المعالجة..." : "طلب السحب"}
                </Button>
              </form>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            <Card className="p-8">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">سجل المعاملات</h3>
              
              {transactions.length === 0 ? (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">لا توجد معاملات حتى الآن</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                          tx.type === 'deposit' ? 'bg-green-100' : 'bg-red-100'
                        }`}>
                          {tx.type === 'deposit' ? (
                            <ArrowDownLeft className={`w-6 h-6 ${tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`} />
                          ) : (
                            <ArrowUpRight className="w-6 h-6 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{tx.description}</p>
                          <p className="text-sm text-slate-500">{tx.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-lg ${tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.type === 'deposit' ? '+' : '-'}{tx.amount} {currency}
                        </p>
                        <p className={`text-sm ${
                          tx.status === 'completed' ? 'text-green-600' : 'text-yellow-600'
                        }`}>
                          {tx.status === 'completed' ? 'مكتملة' : 'قيد الانتظار'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>

        {/* Security Info */}
        <Card className="bg-blue-50 border border-blue-200 p-6">
          <h4 className="font-bold text-slate-900 mb-3">🔒 أمان محفظتك</h4>
          <ul className="space-y-2 text-sm text-slate-600">
            <li>✓ جميع المعاملات مشفرة بـ SSL/TLS</li>
            <li>✓ بيانات حسابك محمية بمعايير PCI DSS</li>
            <li>✓ توثيق ثنائي العامل متاح</li>
            <li>✓ لا نخزن بيانات بطاقتك الكاملة</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
