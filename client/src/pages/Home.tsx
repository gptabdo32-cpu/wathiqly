import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Shield, TrendingUp, Users, Zap, CheckCircle, Lock } from "lucide-react";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navigation Header */}
      <header className="border-b border-border sticky top-0 bg-background/95 backdrop-blur-sm z-50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground">وثّقلي</h1>
            <span className="text-xs text-muted-foreground ml-2">Wathiqly</span>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              الميزات
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              كيف يعمل
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              الأسعار
            </a>
          </nav>

          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <span className="text-sm text-foreground">مرحباً، {user?.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    logout();
                  }}
                >
                  تسجيل الخروج
                </Button>
              </>
            ) : (
              <Button size="sm" asChild>
                <a href={getLoginUrl()}>تسجيل الدخول</a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 py-20 px-4 bg-gradient-to-b from-blue-50 to-background">
        <div className="container max-w-4xl mx-auto text-center">
          <div className="mb-6">
            <h2 className="text-5xl md:text-6xl font-bold text-foreground mb-4">
              وسيطك الآمن في عالم الخدمات الرقمية
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              منصة وثّقلي توفر الحماية والثقة في كل معاملة تجارية رقمية. نحن نضمن حقوق البائع والمشتري معاً.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            {isAuthenticated ? (
              <>
                <Button size="lg" asChild>
                  <Link href="/dashboard">اذهب إلى لوحة التحكم</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/products">تصفح المنتجات</Link>
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" asChild>
                  <a href={getLoginUrl()}>ابدأ الآن مجاناً</a>
                </Button>
                <Button size="lg" variant="outline">
                  تعرف على المزيد
                </Button>
              </>
            )}
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">100%</div>
              <p className="text-sm text-muted-foreground">آمن ومحمي</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">24/7</div>
              <p className="text-sm text-muted-foreground">دعم مستمر</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-primary mb-2">0%</div>
              <p className="text-sm text-muted-foreground">رسوم إضافية</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-16 text-foreground">ميزات وثّقلي</h2>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
                <Lock className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">نظام الوساطة الآمن</h3>
              <p className="text-muted-foreground">
                نحتفظ بأموالك بأمان حتى تتأكد من استلام الخدمة أو المنتج بالكامل
              </p>
            </Card>

            {/* Feature 2 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">تأكيد الاستلام</h3>
              <p className="text-muted-foreground">
                المشتري يؤكد استلام الخدمة، وفوراً يتم تحويل المال للبائع بعد خصم العمولة
              </p>
            </Card>

            {/* Feature 3 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">عمليات فورية</h3>
              <p className="text-muted-foreground">
                من إنشاء الصفقة إلى استلام المال، كل شيء يتم بسرعة وكفاءة عالية
              </p>
            </Card>

            {/* Feature 4 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">متجر المنتجات الرقمية</h3>
              <p className="text-muted-foreground">
                بيع وشراء المنتجات الرقمية (بطاقات شحن، أكواد ألعاب، خدمات) بسهولة
              </p>
            </Card>

            {/* Feature 5 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">التقييمات والمراجعات</h3>
              <p className="text-muted-foreground">
                نظام تقييم شفاف يساعد في بناء سمعة جيدة وثقة بين المستخدمين
              </p>
            </Card>

            {/* Feature 6 */}
            <Card className="p-6 hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-foreground">شارة التاجر الموثوق</h3>
              <p className="text-muted-foreground">
                احصل على شارة موثوق مع ميزات إضافية واشتراك شهري مدفوع
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 bg-card border-t border-border">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-16 text-foreground">كيف يعمل النظام</h2>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-8">
              {/* Step 1 */}
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">البائع والمشتري يتفقان</h3>
                  <p className="text-muted-foreground">
                    يتفق البائع والمشتري على تفاصيل الصفقة والسعر عبر منصة وثّقلي
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">المشتري يودع المبلغ</h3>
                  <p className="text-muted-foreground">
                    المشتري يودع المبلغ عبر وسائل الدفع المحلية (سداد، تداول، إدفع لي، تحويل بنكي)
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">وثّقلي تحجز المال</h3>
                  <p className="text-muted-foreground">
                    نحتفظ بالمال بأمان وإرسال إشعار للبائع بأن المال عندنا
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  4
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">البائع يسلم الخدمة</h3>
                  <p className="text-muted-foreground">
                    البائع يسلم الخدمة أو المنتج للمشتري (رقمياً أو فعلياً)
                  </p>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex gap-6">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 font-bold">
                  5
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">المشتري يؤكد الاستلام</h3>
                  <p className="text-muted-foreground">
                    المشتري يؤكد استلام الخدمة، وفوراً يتم تحويل المال للبائع
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4">
        <div className="container">
          <h2 className="text-4xl font-bold text-center mb-16 text-foreground">نموذج الأسعار</h2>

          <div className="max-w-3xl mx-auto grid md:grid-cols-2 gap-8">
            {/* Commission */}
            <Card className="p-8 border-2 border-border">
              <h3 className="text-2xl font-bold mb-4 text-foreground">عمولة الصفقات</h3>
              <p className="text-4xl font-bold text-primary mb-2">2-5%</p>
              <p className="text-muted-foreground mb-6">من كل صفقة تتم عبر المنصة</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>عمولة منخفضة وشفافة</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>بدون رسوم إضافية</span>
                </li>
              </ul>
            </Card>

            {/* Trusted Seller */}
            <Card className="p-8 border-2 border-primary">
              <h3 className="text-2xl font-bold mb-4 text-foreground">التاجر الموثوق</h3>
              <p className="text-4xl font-bold text-primary mb-2">99 ل.د</p>
              <p className="text-muted-foreground mb-6">اشتراك شهري مدفوع</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>شارة موثوق مميزة</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>أولوية في النتائج</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span>دعم أولوي</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-4xl font-bold mb-6">هل أنت مستعد للبدء؟</h2>
          <p className="text-lg mb-8 opacity-90">
            انضم إلى آلاف المستخدمين الذين يثقون بوثّقلي في معاملاتهم التجارية
          </p>
          {!isAuthenticated && (
            <Button size="lg" variant="secondary" asChild>
              <a href={getLoginUrl()}>سجل الآن مجاناً</a>
            </Button>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-4 bg-card">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <h4 className="font-semibold mb-4 text-foreground">وثّقلي</h4>
              <p className="text-sm text-muted-foreground">
                وسيطك الآمن في عالم الخدمات الرقمية الليبية
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">الروابط</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">الرئيسية</a></li>
                <li><a href="#" className="hover:text-foreground">الميزات</a></li>
                <li><a href="#" className="hover:text-foreground">الأسعار</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">القانوني</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-foreground">الشروط</a></li>
                <li><a href="#" className="hover:text-foreground">الخصوصية</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-foreground">التواصل</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>البريد: info@wathiqly.ly</li>
                <li>الهاتف: +218 XXX XXX XXX</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2026 وثّقلي. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
