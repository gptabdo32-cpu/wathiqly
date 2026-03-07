import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import {
  Shield,
  Zap,
  Users,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Lock,
  Clock,
  DollarSign,
  Star,
} from "lucide-react";

export default function Home() {
  const { user, isAuthenticated } = useAuth();

  const features = [
    {
      icon: Shield,
      title: "وساطة آمنة 100%",
      description: "نحتفظ بأموالك حتى تتأكد من استلام المنتج بسلام",
    },
    {
      icon: Clock,
      title: "سريع وسهل",
      description: "أكمل معاملتك في دقائق معدودة بدون تعقيدات",
    },
    {
      icon: Lock,
      title: "بيانات محمية",
      description: "تشفير عالي المستوى لحماية معلوماتك الشخصية",
    },
    {
      icon: TrendingUp,
      title: "نمو أعمالك",
      description: "أدوات متقدمة لإدارة مبيعاتك وتحليل الأداء",
    },
    {
      icon: Users,
      title: "مجتمع موثوق",
      description: "آلاف المستخدمين الموثوقين على المنصة",
    },
    {
      icon: DollarSign,
      title: "عمولات منخفضة",
      description: "أقل عمولات في السوق مع شفافية كاملة",
    },
  ];

  const testimonials = [
    {
      name: "أحمد محمد",
      role: "بائع إلكتروني",
      text: "وثّقلي غيرت طريقة عملي، آمن وموثوق 100%",
      rating: 5,
    },
    {
      name: "فاطمة علي",
      role: "مشترية",
      text: "أشعر بالأمان التام عند الشراء، الوساطة فعلاً تحمي حقوقي",
      rating: 5,
    },
    {
      name: "محمود حسن",
      role: "تاجر",
      text: "الأداة الأفضل للبيع الآمن، لا أستطيع الاستغناء عنها",
      rating: 5,
    },
  ];

  const steps = [
    {
      number: "1",
      title: "اختر نوع حسابك",
      description: "مشتري أو بائع أو كليهما",
    },
    {
      number: "2",
      title: "تحقق من هويتك",
      description: "عملية سريعة وآمنة للتحقق من البيانات",
    },
    {
      number: "3",
      title: "ابدأ المعاملة",
      description: "ابحث عن المنتجات أو ضع إعلانك",
    },
    {
      number: "4",
      title: "استقبل أموالك",
      description: "تحويل آمن بعد تأكيد المشتري",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white font-arabic" dir="rtl">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">وثّقلي</h1>
          </div>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Button variant="ghost" asChild>
                  <Link href="/dashboard">لوحة التحكم</Link>
                </Button>
                <Button asChild>
                  <Link href="/products">تصفح المنتجات</Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <a href={getLoginUrl()}>دخول</a>
                </Button>
                <Button asChild>
                  <a href={getLoginUrl()}>تسجيل</a>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
                منصة وثّقلي
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-700">
                  الوساطة الآمنة
                </span>
              </h2>
              <p className="text-xl text-slate-600 mb-8">
                منصة موثوقة وآمنة للمعاملات التجارية الرقمية. نحن نحمي حقوق البائع والمشتري معاً بنظام وساطة عادل وشفاف.
              </p>
              <div className="flex gap-4">
                <Button size="lg" asChild>
                  <a href={getLoginUrl()}>ابدأ الآن</a>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/faq">اعرف أكثر</Link>
                </Button>
              </div>
              <div className="mt-8 flex gap-6 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>آمن 100%</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>بدون رسوم إضافية</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span>دعم 24/7</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-3xl"></div>
              <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-8 text-white">
                <div className="space-y-4">
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <Shield className="w-5 h-5" />
                      <span className="font-semibold">معاملة آمنة</span>
                    </div>
                    <p className="text-sm text-white/80">أموالك محمية حتى استلام المنتج</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-5 h-5" />
                      <span className="font-semibold">سريع وسهل</span>
                    </div>
                    <p className="text-sm text-white/80">أكمل معاملتك في دقائق</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-2">
                      <Lock className="w-5 h-5" />
                      <span className="font-semibold">محمي بالتشفير</span>
                    </div>
                    <p className="text-sm text-white/80">أعلى معايير الأمان</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 bg-slate-100">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 text-center">كيف تعمل وثّقلي؟</h2>
          <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            عملية بسيطة وآمنة في 4 خطوات فقط
          </p>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <div key={idx} className="relative">
                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute top-20 -right-3 w-6 h-1 bg-blue-600"></div>
                )}
                <Card className="p-6 text-center bg-white hover:shadow-lg transition-shadow">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                    {step.number}
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-slate-600">{step.description}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 text-center">المزايا الرئيسية</h2>
          <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            كل ما تحتاجه للمعاملات الآمنة والموثوقة
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <Card key={idx} className="p-8 bg-white hover:shadow-lg transition-all hover:scale-105">
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 bg-slate-100">
        <div className="container max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 text-center">آراء المستخدمين</h2>
          <p className="text-xl text-slate-600 text-center mb-16 max-w-2xl mx-auto">
            ماذا يقول مستخدمونا عن وثّقلي؟
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, idx) => (
              <Card key={idx} className="p-8 bg-white">
                <div className="flex gap-1 mb-4">
                  {Array(testimonial.rating)
                    .fill(0)
                    .map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    ))}
                </div>
                <p className="text-slate-600 mb-6 italic">"{testimonial.text}"</p>
                <div>
                  <p className="font-bold text-slate-900">{testimonial.name}</p>
                  <p className="text-sm text-slate-500">{testimonial.role}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="container max-w-6xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-6">هل أنت مستعد للبدء؟</h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto opacity-90">
            انضم إلى آلاف المستخدمين الموثوقين على وثّقلي واستمتع بمعاملات آمنة وموثوقة
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <a href={getLoginUrl()}>
                ابدأ الآن
                <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10" asChild>
              <Link href="/faq">اعرف أكثر</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12 px-4">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-6 h-6 text-blue-400" />
                <h3 className="font-bold">وثّقلي</h3>
              </div>
              <p className="text-sm text-slate-400">منصة الوساطة الآمنة للمعاملات التجارية الرقمية</p>
            </div>
            <div>
              <h4 className="font-bold mb-4">الروابط</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/">الرئيسية</Link></li>
                <li><Link href="/products">المنتجات</Link></li>
                <li><Link href="/faq">الأسئلة الشائعة</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">القانوني</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link href="/terms">الشروط والأحكام</Link></li>
                <li><a href="#">سياسة الخصوصية</a></li>
                <li><a href="#">اتصل بنا</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4">الدعم</h4>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><a href="#">مركز المساعدة</a></li>
                <li><a href="#">البلاغات</a></li>
                <li><a href="#">الشكاوى</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-sm text-slate-400">
            <p>&copy; 2026 وثّقلي - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
