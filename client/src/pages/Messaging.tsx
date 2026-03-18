import React, { useState } from "react";
import { useAuth } from "@/core/hooks/useAuth";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ChatBox from "@/components/ChatBox";
import { MessageSquare, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function Messaging() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedConversation, setSelectedConversation] = useState<number | null>(
    null
  );
  const [showNewConversation, setShowNewConversation] = useState(false);

  const { data: conversations, refetch } = trpc.chat.getConversations.useQuery();
  const createConversationMutation =
    trpc.chat.createConversation.useMutation();

  const handleCreateConversation = async () => {
    // This would typically be called from a transaction detail page
    // For now, we'll show a placeholder
    toast.info("يرجى فتح هذه الميزة من صفحة تفاصيل المعاملة");
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <p className="text-gray-600 mb-4">يرجى تسجيل الدخول أولاً</p>
          <Button onClick={() => setLocation("/")} className="bg-blue-600">
            العودة للرئيسية
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-8 h-8 text-blue-600" />
                الرسائل والدردشات
              </h1>
              <p className="text-gray-600 mt-2">
                تواصل آمن وموثق مع المشترين والبائعين
              </p>
            </div>
            <Button
              onClick={handleCreateConversation}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              محادثة جديدة
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conversations List */}
          <div className="lg:col-span-1">
            <Card className="h-[600px] overflow-y-auto">
              <div className="p-4">
                <h2 className="font-semibold text-lg mb-4">المحادثات</h2>

                {!conversations || conversations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>لا توجد محادثات حتى الآن</p>
                    <p className="text-sm mt-2">
                      ستظهر محادثاتك هنا عند إنشاء معاملة
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv: any) => (
                      <button
                        key={conv.id}
                        onClick={() => setSelectedConversation(conv.id)}
                        className={`w-full text-right p-3 rounded-lg transition-colors ${
                          selectedConversation === conv.id
                            ? "bg-blue-100 border-2 border-blue-600"
                            : "bg-gray-50 hover:bg-gray-100 border border-gray-200"
                        }`}
                      >
                        <h3 className="font-semibold text-sm">{conv.subject}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          {conv.buyerId === user.id ? "مع البائع" : "مع المشتري"}
                        </p>
                        {conv.lastMessageAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(conv.lastMessageAt).toLocaleDateString(
                              "ar-LY"
                            )}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2">
            {selectedConversation ? (
              <ChatBox
                conversationId={selectedConversation}
                otherUserName="المستخدم الآخر"
                otherUserId={0}
              />
            ) : (
              <Card className="h-[600px] flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 text-blue-400 opacity-50" />
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">
                    اختر محادثة
                  </h3>
                  <p className="text-gray-500 mb-6">
                    اختر محادثة من القائمة لبدء الدردشة
                  </p>

                  <div className="bg-white rounded-lg p-6 max-w-sm mx-auto shadow-sm border border-gray-200">
                    <h4 className="font-semibold text-gray-800 mb-3">
                      ✨ ميزات الدردشة الآمنة:
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-2 text-right">
                      <li>✓ رسائل نصية فورية</li>
                      <li>✓ مشاركة الصور والملفات</li>
                      <li>✓ رسائل صوتية مسجلة</li>
                      <li>✓ توثيق كامل للنزاعات</li>
                      <li>✓ تشفير الرسائل الحساسة</li>
                      <li>✓ سجل دائم للمحادثات</li>
                    </ul>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Info Section */}
        <Card className="mt-8 bg-blue-50 border-blue-200 p-6">
          <h3 className="font-semibold text-blue-900 mb-3">
            📋 معلومات عن نظام الدردشة الآمن
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
            <div>
              <p className="font-semibold mb-1">🔒 الأمان</p>
              <p>جميع الرسائل محفوظة وآمنة مع إمكانية التشفير للرسائل الحساسة</p>
            </div>
            <div>
              <p className="font-semibold mb-1">📸 الوسائط المتعددة</p>
              <p>
                شارك الصور والرسائل الصوتية كأدلة توثيق للنزاعات والمعاملات
              </p>
            </div>
            <div>
              <p className="font-semibold mb-1">⏱️ السجل الدائم</p>
              <p>
                احتفظ بسجل كامل لجميع المحادثات لفض النزاعات والمراجعة
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
