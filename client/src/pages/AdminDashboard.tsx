import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Redirect, Link } from "wouter";
import {
  ShieldAlert,
  Users,
  DollarSign,
  Gavel,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { user, isAuthenticated, loading } = useAuth();

  const { data: stats, refetch: refetchStats } = trpc.admin.getStats.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: disputes, refetch: refetchDisputes } = trpc.admin.listDisputes.useQuery({}, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: suspicious } = trpc.admin.getSuspiciousActivities.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });

  const resolveMutation = trpc.admin.resolveDispute.useMutation({
    onSuccess: () => {
      toast.success("تم حل النزاع بنجاح");
      refetchDisputes();
      refetchStats();
    },
    onError: (err) => {
      toast.error("فشل حل النزاع: " + err.message);
    }
  });

  if (loading) return <div className="p-8 text-center">جاري التحميل...</div>;
  if (!isAuthenticated || user?.role !== "admin") return <Redirect to="/" />;

  const handleResolve = (id: number, status: "completed" | "cancelled") => {
    const resolution = prompt("أدخل تفاصيل حل النزاع:");
    if (resolution) {
      resolveMutation.mutate({ escrowId: id, resolution, status });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 font-arabic" dir="rtl">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-3 mb-8">
          <ShieldAlert className="w-8 h-8 text-red-600" />
          <h1 className="text-3xl font-bold text-slate-900">لوحة التحكم الإدارية</h1>
        </div>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Link href="/admin/commissions">
            <Card className="p-6 border-r-4 border-r-blue-500 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500 mb-1">إجمالي الأموال المحجوزة</p>
                  <p className="text-2xl font-bold text-slate-900">{stats?.totalVolume || "0"} ل.د</p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-500 opacity-20" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/disputes">
            <Card className="p-6 border-r-4 border-r-red-500 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500 mb-1">نزاعات نشطة</p>
                  <p className="text-2xl font-bold text-slate-900">{stats?.activeDisputes || "0"}</p>
                </div>
                <Gavel className="w-8 h-8 text-red-500 opacity-20" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/users">
            <Card className="p-6 border-r-4 border-r-green-500 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500 mb-1">إجمالي المستخدمين</p>
                  <p className="text-2xl font-bold text-slate-900">{stats?.totalUsers || "0"}</p>
                </div>
                <Users className="w-8 h-8 text-green-500 opacity-20" />
              </div>
            </Card>
          </Link>

          <Link href="/admin/transactions">
            <Card className="p-6 border-r-4 border-r-purple-500 cursor-pointer hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm text-slate-500 mb-1">إجمالي العمليات</p>
                  <p className="text-2xl font-bold text-slate-900">{stats?.totalTransactions || "0"}</p>
                </div>
                <ShieldAlert className="w-8 h-8 text-purple-500 opacity-20" />
              </div>
            </Card>
          </Link>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Disputes Table */}
          <div className="lg:col-span-2">
            <Card className="p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Gavel className="text-red-500" size={20} />
                إدارة النزاعات المعقدة
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الصفقة</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead className="text-right">السبب</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes && disputes.length > 0 ? (
                    disputes.map((dispute) => (
                      <TableRow key={dispute.id}>
                        <TableCell className="font-medium">{dispute.title}</TableCell>
                        <TableCell>{dispute.amount} ل.د</TableCell>
                        <TableCell className="max-w-[200px] truncate text-slate-500">
                          {dispute.disputeReason}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleResolve(dispute.id, "completed")}
                            >
                              <CheckCircle size={14} className="ml-1" />
                              لصالح البائع
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleResolve(dispute.id, "cancelled")}
                            >
                              <XCircle size={14} className="ml-1" />
                              لصالح المشتري
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-slate-400">
                        لا توجد نزاعات حالية تتطلب التدخل
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>

          {/* Suspicious Activities */}
          <div>
            <Card className="p-6 border-amber-100 bg-amber-50/30">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-amber-700">
                <AlertTriangle size={20} />
                أنشطة مشبوهة
              </h2>
              <div className="space-y-4">
                {suspicious && suspicious.length > 0 ? (
                  suspicious.map((act, i) => (
                    <div key={i} className="p-4 bg-white rounded-lg border border-amber-200 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-900">مستخدم #{act.userId}</span>
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                          {act.count} طلبات/دقيقة
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {act.reason}
                      </p>
                      <Button variant="link" className="p-0 h-auto text-xs text-blue-600 mt-2">
                        عرض سجل المستخدم
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-amber-600/50">
                    <Clock className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs">لا توجد تنبيهات أمنية حالياً</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
