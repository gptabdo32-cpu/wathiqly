import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, X, CheckCircle, AlertCircle, Info, Trash2 } from "lucide-react";
import { Link } from "wouter";

interface Notification {
  id: number;
  type: "transaction" | "dispute" | "system" | "marketing";
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

interface NotificationCenterProps {
  notifications: Notification[];
  onMarkAsRead?: (id: number) => void;
  onDelete?: (id: number) => void;
}

/**
 * Notification Center Component
 * Displays real-time notifications with different types
 */
export function NotificationCenter({
  notifications,
  onMarkAsRead,
  onDelete,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "transaction":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "dispute":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "system":
        return <Info className="h-5 w-5 text-blue-600" />;
      case "marketing":
        return <Bell className="h-5 w-5 text-purple-600" />;
      default:
        return <Bell className="h-5 w-5" />;
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case "transaction":
        return "bg-green-50 border-green-200";
      case "dispute":
        return "bg-red-50 border-red-200";
      case "system":
        return "bg-blue-50 border-blue-200";
      case "marketing":
        return "bg-purple-50 border-purple-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "transaction":
        return "معاملة";
      case "dispute":
        return "نزاع";
      case "system":
        return "نظام";
      case "marketing":
        return "تسويق";
      default:
        return type;
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
  };

  return (
    <div className="relative">
      {/* Notification Bell Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 max-h-96 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-muted">
            <h3 className="font-semibold">الإشعارات</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                لا توجد إشعارات
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 rounded-lg border ${getNotificationColor(notification.type)} ${
                      !notification.isRead ? "border-l-4" : ""
                    } cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start gap-3">
                      {getNotificationIcon(notification.type)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm truncate">
                            {notification.title}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {getTypeLabel(notification.type)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onDelete) {
                            onDelete(notification.id);
                          }
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>

                    {notification.link && (
                      <Link href={notification.link}>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-2 h-auto p-0 text-xs"
                        >
                          عرض التفاصيل →
                        </Button>
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-border bg-muted">
              <Link href="/dashboard/notifications">
                <Button variant="outline" className="w-full text-sm">
                  عرض جميع الإشعارات
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format notification time
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "الآن";
  if (diffMins < 60) return `قبل ${diffMins} دقيقة`;
  if (diffHours < 24) return `قبل ${diffHours} ساعة`;
  if (diffDays < 7) return `قبل ${diffDays} يوم`;

  return date.toLocaleDateString("ar-LY");
}
