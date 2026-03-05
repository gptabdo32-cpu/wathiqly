import { useAuth } from '@/_core/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useState } from 'react';
import { toast } from 'sonner';
import { Redirect } from 'wouter';
import { AlertCircle, Shield } from 'lucide-react';

export default function CreateTransaction() {
  const { user, isAuthenticated, loading } = useAuth();
  const [formData, setFormData] = useState({
    sellerId: '',
    title: '',
    description: '',
    amount: '',
    paymentMethod: 'sadad' as const,
    commissionPercentage: '2.5',
  });

  const createTransactionMutation = trpc.escrow.createTransaction.useMutation({
    onSuccess: (data) => {
      toast.success('تم إنشاء الصفقة بنجاح');
    },
    onError: (error) => {
      toast.error(error.message || 'حدث خطأ في إنشاء الصفقة');
    },
  });

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center'>
        <div className='text-center'>
          <div className='w-12 h-12 rounded-full bg-muted animate-pulse mx-auto mb-4'></div>
          <p className='text-muted-foreground'>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to='/' />;
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sellerId) {
      toast.error('يرجى إدخال معرف البائع');
      return;
    }

    if (!formData.title) {
      toast.error('يرجى إدخال عنوان الصفقة');
      return;
    }

    if (!formData.amount) {
      toast.error('يرجى إدخال المبلغ');
      return;
    }

    createTransactionMutation.mutate({
      sellerId: parseInt(formData.sellerId),
      title: formData.title,
      description: formData.description,
      amount: formData.amount,
      paymentMethod: formData.paymentMethod,
      commissionPercentage: formData.commissionPercentage,
    });
  };

  const calculatedAmount = parseFloat(formData.amount) || 0;
  const commission = (calculatedAmount * parseFloat(formData.commissionPercentage)) / 100;
  const totalAmount = calculatedAmount + commission;

  return (
    <div className='min-h-screen bg-background py-8'>
      <div className='container max-w-2xl'>
        <div className='mb-8'>
          <h1 className='text-4xl font-bold text-foreground mb-2'>إنشاء صفقة جديدة</h1>
          <p className='text-muted-foreground'>ابدأ صفقة آمنة مع بائع موثوق</p>
        </div>

        <Card className='p-8'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3'>
              <Shield className='w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5' />
              <div className='text-sm text-blue-800'>
                <p className='font-semibold mb-1'>كيف يعمل نظام الوساطة الآمن</p>
                <p>سيتم حجز المبلغ بأمان لدينا حتى تتأكد من استلام الخدمة أو المنتج بالكامل</p>
              </div>
            </div>

            <div className='form-group'>
              <Label htmlFor='sellerId'>معرف البائع</Label>
              <Input
                id='sellerId'
                name='sellerId'
                type='number'
                value={formData.sellerId}
                onChange={handleInputChange}
                placeholder='أدخل معرف البائع'
                className='form-input'
              />
            </div>

            <div className='form-group'>
              <Label htmlFor='title'>عنوان الصفقة</Label>
              <Input
                id='title'
                name='title'
                value={formData.title}
                onChange={handleInputChange}
                placeholder='مثال: شراء بطاقات شحن'
                className='form-input'
              />
            </div>

            <div className='form-group'>
              <Label htmlFor='description'>الوصف التفصيلي</Label>
              <Textarea
                id='description'
                name='description'
                value={formData.description}
                onChange={handleInputChange}
                placeholder='أدخل تفاصيل الصفقة (اختياري)'
                className='form-textarea'
                rows={4}
              />
            </div>

            <div className='form-group'>
              <Label htmlFor='amount'>المبلغ (ل.د)</Label>
              <Input
                id='amount'
                name='amount'
                type='number'
                step='0.01'
                min='0'
                value={formData.amount}
                onChange={handleInputChange}
                placeholder='0.00'
                className='form-input'
              />
            </div>

            <div className='form-group'>
              <Label htmlFor='paymentMethod'>طريقة الدفع</Label>
              <Select
                value={formData.paymentMethod}
                onValueChange={(value) => handleSelectChange('paymentMethod', value)}
              >
                <SelectTrigger className='form-input'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='sadad'>سداد</SelectItem>
                  <SelectItem value='tadawul'>تداول</SelectItem>
                  <SelectItem value='edfaali'>إدفع لي</SelectItem>
                  <SelectItem value='bank_transfer'>تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className='p-4 bg-card border border-border rounded-lg'>
              <h3 className='font-semibold text-foreground mb-4'>ملخص الرسوم</h3>
              <div className='space-y-2 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>المبلغ الأساسي:</span>
                  <span className='font-medium text-foreground'>{calculatedAmount.toFixed(2)} ل.د</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>عمولة النظام ({formData.commissionPercentage}%):</span>
                  <span className='font-medium text-amber-600'>{commission.toFixed(2)} ل.د</span>
                </div>
                <div className='border-t border-border pt-2 flex justify-between'>
                  <span className='font-semibold text-foreground'>المبلغ الإجمالي:</span>
                  <span className='font-bold text-primary'>{totalAmount.toFixed(2)} ل.د</span>
                </div>
              </div>
            </div>

            <div className='flex gap-4 pt-4'>
              <Button
                type='submit'
                disabled={createTransactionMutation.isPending || !formData.sellerId || !formData.title || !formData.amount}
                className='flex-1'
              >
                {createTransactionMutation.isPending ? 'جاري الإنشاء...' : 'إنشاء الصفقة'}
              </Button>
              <Button type='button' variant='outline' className='flex-1'>
                إلغاء
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
