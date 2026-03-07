import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import {
  Search,
  Filter,
  Star,
  ShoppingCart,
  Heart,
  Share2,
  ChevronDown,
  Grid3x3,
  List,
} from "lucide-react";

export default function Products() {
  const { user, isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [priceRange, setPriceRange] = useState([0, 10000]);
  const [sortBy, setSortBy] = useState("newest");

  // Fetch products
  const { data: products, isLoading } = trpc.products.searchProducts.useQuery(
    {
      query: searchQuery,
      category: selectedCategory !== "all" ? selectedCategory : undefined,
      limit: 50,
      offset: 0,
    },
    { enabled: isAuthenticated }
  );

  const categories = [
    { id: "all", name: "جميع المنتجات", count: 0 },
    { id: "digital", name: "خدمات رقمية", count: 0 },
    { id: "cards", name: "بطاقات وشحن", count: 0 },
    { id: "services", name: "خدمات", count: 0 },
    { id: "goods", name: "سلع وبضائع", count: 0 },
  ];

  return (
    <div className="min-h-screen bg-background py-8 font-arabic" dir="rtl">
      <div className="container">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">تصفح المنتجات</h1>
          <p className="text-muted-foreground">اكتشف آلاف المنتجات والخدمات الموثوقة</p>
        </div>

        {/* Search and Filters Bar */}
        <div className="mb-8 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute right-3 top-3 text-muted-foreground" size={20} />
            <Input
              placeholder="ابحث عن منتجات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10 h-12 text-right"
            />
          </div>

          {/* Filter Controls */}
          <div className="flex gap-4 flex-wrap items-center">
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">ترتيب:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-background"
              >
                <option value="newest">الأحدث</option>
                <option value="popular">الأكثر شهرة</option>
                <option value="price-low">السعر: من الأقل للأعلى</option>
                <option value="price-high">السعر: من الأعلى للأقل</option>
                <option value="rating">التقييم الأعلى</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex gap-2 mr-auto">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="gap-2"
              >
                <Grid3x3 size={16} />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="gap-2"
              >
                <List size={16} />
              </Button>
            </div>
          </div>

          {/* Price Range Filter */}
          <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
            <span className="text-sm font-medium">نطاق السعر:</span>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={priceRange[0]}
                onChange={(e) => setPriceRange([parseInt(e.target.value), priceRange[1]])}
                placeholder="من"
                className="w-24 text-right"
              />
              <span>-</span>
              <Input
                type="number"
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                placeholder="إلى"
                className="w-24 text-right"
              />
              <span className="text-sm text-muted-foreground">ل.د</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-8">
          {/* Sidebar Categories */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-8">
              <h3 className="font-bold text-lg mb-4">الفئات</h3>
              <div className="space-y-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full text-right px-4 py-2 rounded-lg transition-colors ${
                      selectedCategory === cat.id
                        ? "bg-blue-600 text-white font-bold"
                        : "bg-muted hover:bg-muted/80"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span>{cat.name}</span>
                      {cat.count > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {cat.count}
                        </Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {/* Products Grid/List */}
          <div className="lg:col-span-3">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i} className="p-4 animate-pulse">
                    <div className="w-full h-48 bg-muted rounded-lg mb-4" />
                    <div className="h-4 bg-muted rounded mb-2" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </Card>
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    : "space-y-4"
                }
              >
                {products.map((product: any) => (
                  <Card
                    key={product.id}
                    className={`overflow-hidden hover:shadow-lg transition-all ${
                      viewMode === "list" ? "flex gap-4 p-4" : "flex flex-col"
                    }`}
                  >
                    {/* Product Image */}
                    <div
                      className={`relative bg-muted flex-shrink-0 ${
                        viewMode === "list" ? "w-32 h-32" : "w-full h-48"
                      } rounded-lg overflow-hidden`}
                    >
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <ShoppingCart size={32} />
                      </div>
                      {product.badge && (
                        <Badge className="absolute top-2 right-2 bg-red-500">
                          {product.badge}
                        </Badge>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className={viewMode === "list" ? "flex-1" : "p-4"}>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex-1">
                          <h3 className="font-bold text-foreground line-clamp-2">
                            {product.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {product.seller}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-shrink-0"
                        >
                          <Heart size={16} />
                        </Button>
                      </div>

                      {/* Rating */}
                      <div className="flex items-center gap-1 mb-3">
                        <div className="flex gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              className={
                                i < Math.floor(product.rating)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground"
                              }
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ({product.reviews})
                        </span>
                      </div>

                      {/* Price and Actions */}
                      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                        <div>
                          <p className="text-lg font-bold text-blue-600">
                            {product.price} ل.د
                          </p>
                          {product.originalPrice && (
                            <p className="text-xs text-muted-foreground line-through">
                              {product.originalPrice} ل.د
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          شراء الآن
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <ShoppingCart size={48} className="mx-auto text-muted-foreground mb-4 opacity-50" />
                <p className="text-muted-foreground mb-4">لا توجد منتجات متطابقة</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("all");
                    setPriceRange([0, 10000]);
                  }}
                >
                  إعادة تعيين الفلاتر
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
