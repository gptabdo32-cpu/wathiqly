import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Link, Redirect } from "wouter";
import {
  BarChart3,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Plus,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();

  const { data: wallet } = trpc.wallet.getBalance.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: stats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: transactions } = trpc.wallet.getTransactionHistory.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  const { data: myTransactions } = trpc.escrow.listMyTransactions.useQuery(
    { limit: 5 },
    { enabled: isAuthenticated }
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-muted animate-pulse mx-auto mb-4"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="container">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">مرحباً، {user?.name}</h1>
          <p className="text-muted-foreground">إدارة حسابك والمعاملات الخاصة بك</p>
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {user?.userType !== "buyer" && (
            <Button asChild className="h-auto flex-col items-start p-4">
              <Link href="/create-transaction">
                <Plus className="w-5 h-5 mb-2" />
                <span>إنشاء صفقة جديدة</span>
              </Link>
            </Button>
          )}
          {user?.userType !== "seller" && (
            <Button asChild variant="outline" className="h-auto flex-col items-start p-4">
              <Link href="/products">
                <ShoppingCart className="w-5 h-5 mb-2" />
                <span>تصفح المنتجات</span>
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="h-auto flex-col items-start p-4">
            <Link href="/profile">
              <BarChart3 className="w-5 h-5 mb-2" />
              <span>الملف الشخصي</span>
            </Link>
          </Button>
        </div>

        {/* Statistics Cards */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">الرصيد الحالي</p>
                <p className="text-3xl font-bold text-foreground">{wallet?.balance || "0"}</p>
                <p className="text-xs text-muted-foreground mt-2">ل.د</p>
              </div>
              <Wallet className="w-8 h-8 text-blue-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">إجمالي الأرباح</p>
                <p className="text-3xl font-bold text-foreground">{stats?.totalEarned || "0"}</p>
                <p className="text-xs text-muted-foreground mt-2">ل.د</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">التقييم</p>
                <p className="text-3xl font-bold text-foreground">{stats?.averageRating.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground mt-2">من {stats?.totalReviews} تقييم</p>
              </div>
              <BarChart3 className="w-8 h-8 text-amber-500 opacity-20" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-2">الحالة</p>
                {stats?.isTrustedSeller ? (
                  <p className="text-sm font-semibold text-green-600">تاجر موثوق ✓</p>
                ) : (
                  <p className="text-sm font-semibold text-muted-foreground">عادي</p>
                )}
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-2 w-full"
                >
                  <Link href="/trusted-seller">
                    {stats?.isTrustedSeller ? "إدارة الاشتراك" : "ترقية"}
                  </Link>
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Transactions */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-foreground">آخر الصفقات</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/transactions">
                    عرض الكل
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
              </div>

              {myTransactions && myTransactions.length > 0 ? (
                <div className="space-y-4">
                  {myTransactions.map((transaction: any) => (
                    <div
                      key={transaction.id}
                      className="flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                          {transaction.status === "completed" ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : transaction.status === "pending" ? (
                            <Clock className="w-5 h-5 text-amber-600" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{transaction.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.createdAt).toLocaleDateString("ar-LY")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">{transaction.amount} ل.د</p>
                        <span className={`text-xs font-medium ${
                          transaction.status === "completed"
                            ? "text-green-600"
                            : transaction.status === "pending"
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}>
                          {transaction.status === "completed"
                            ? "مكتملة"
                            : transaction.status === "pending"
                              ? "قيد الانتظار"
                              : "ملغاة"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">لا توجد صفقات حتى الآن</p>
                  <Button asChild>
                    <Link href="/create-transaction">إنشاء صفقة جديدة</Link>
                  </Button>
                </div>
              )}
            </Card>
          </div>

          {/* Wallet Summary */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">ملخص المحفظة</h3>

              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">الرصيد المتاح</p>
                  <p className="text-2xl font-bold text-blue-600">{wallet?.balance || "0"} ل.د</p>
                </div>

                <div className="p-4 bg-amber-50 rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">الرصيد المعلق</p>
                  <p className="text-2xl font-bold text-amber-600">{wallet?.pendingBalance || "0"} ل.د</p>
                </div>

                <Button asChild className="w-full">
                  <Link href="/wallet">
                    <Wallet className="w-4 h-4 ml-2" />
                    إدارة المحفظة
                  </Link>
                </Button>

                <Button asChild variant="outline" className="w-full">
                  <Link href="/withdraw">
                    <TrendingUp className="w-4 h-4 ml-2" />
                    طلب سحب
                  </Link>
                </Button>
              </div>
            </Card>

            {/* Quick Links */}
            <Card className="p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">روابط سريعة</h3>

              <div className="space-y-2">
                <Button asChild variant="ghost" className="w-full justify-start">
                  <Link href="/my-products">منتجاتي الرقمية</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start">
                  <Link href="/reviews">التقييمات والمراجعات</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start">
                  <Link href="/settings">الإعدادات</Link>
                </Button>
                <Button asChild variant="ghost" className="w-full justify-start">
                  <Link href="/help">المساعدة والدعم</Link>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
