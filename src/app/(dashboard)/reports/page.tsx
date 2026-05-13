'use client';

import { useState } from 'react';
import { BarChart3, DollarSign, ShoppingCart, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

interface ReportData {
  startDate: string;
  endDate: string;
  salesCount: number;
  totalRevenue: number;
  topProducts: { productId: number; name: string; quantity: number; revenue: number }[];
  salesByPaymentMethod: { name: string; count: number; total: number }[];
}

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (data && typeof data.salesCount === 'number') {
        setReport(data);
      }
    } catch {
      // handle error silently
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-100">Reports</h2>
        <p className="text-sm text-slate-400 mt-1">Sales and performance analytics</p>
      </div>

      {/* Date Range */}
      <Card className="border-slate-700 bg-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-100">Date Range</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="report-start">Start Date</Label>
              <Input
                id="report-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-end">End Date</Label>
              <Input
                id="report-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={fetchReport} disabled={loading}>
              {loading ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-700 bg-slate-800">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24 bg-slate-700" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 bg-slate-700" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : report ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Total Sales</CardTitle>
                <div className="rounded-lg bg-blue-600/10 p-2">
                  <ShoppingCart className="h-4 w-4 text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-100">{report.salesCount}</div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Total Revenue</CardTitle>
                <div className="rounded-lg bg-emerald-600/10 p-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-100">
                  ${report.totalRevenue.toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Avg per Sale</CardTitle>
                <div className="rounded-lg bg-purple-600/10 p-2">
                  <TrendingUp className="h-4 w-4 text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-100">
                  ${report.salesCount > 0 ? (report.totalRevenue / report.salesCount).toFixed(2) : '0.00'}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-700 bg-slate-800">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-400">Payment Methods</CardTitle>
                <div className="rounded-lg bg-amber-600/10 p-2">
                  <BarChart3 className="h-4 w-4 text-amber-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-100">
                  {report.salesByPaymentMethod.length}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Products */}
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">Top Products</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.topProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                        No products sold in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.topProducts.map((product, idx) => (
                      <TableRow key={product.productId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-5">#{idx + 1}</span>
                            <span className="text-slate-100 font-medium">{product.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-300">{product.quantity}</TableCell>
                        <TableCell className="text-right text-slate-200">
                          ${product.revenue.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Sales by Payment Method */}
          <Card className="border-slate-700 bg-slate-800">
            <CardHeader>
              <CardTitle className="text-slate-100">Sales by Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.salesByPaymentMethod.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                        No data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.salesByPaymentMethod.map((pm) => (
                      <TableRow key={pm.name}>
                        <TableCell className="text-slate-100 font-medium">{pm.name}</TableCell>
                        <TableCell className="text-slate-300">{pm.count}</TableCell>
                        <TableCell className="text-right text-slate-200">
                          ${pm.total.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="text-center py-12">
          <BarChart3 className="mx-auto h-12 w-12 text-slate-600 mb-4" />
          <p className="text-slate-400">Select a date range and click "Generate Report"</p>
        </div>
      )}
    </div>
  );
}
