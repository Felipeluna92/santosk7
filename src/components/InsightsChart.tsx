import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { getInsightsTimeseries } from "@/lib/meta.functions";

const nf = new Intl.NumberFormat("pt-BR");

type Point = { day: string; views: number; followers: number };

function shortDay(day: string) {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

export function InsightsChart() {
  const q = useQuery({ queryKey: ["insights-timeseries"], queryFn: () => getInsightsTimeseries() });

  const points: Point[] = (q.data?.points as Point[] | undefined) ?? [];
  const available = Boolean(q.data?.available) && points.length > 1;

  return (
    <section className="panel mt-3 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Evolução</h3>
          <p className="text-[11px] text-muted-foreground">Views e seguidores dos últimos 30 dias</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary" /> Views
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-info" /> Seguidores
          </span>
        </div>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-[240px] rounded-lg" />
      ) : !available ? (
        <p className="py-16 text-center text-xs text-muted-foreground">
          Histórico indisponível para esta conta ou permissão.
        </p>
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.42} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFollowers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={shortDay}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={54}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(v: number) => nf.format(v)}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  fontSize: 12,
                  color: "var(--popover-foreground)",
                }}
                labelFormatter={(l: string) => shortDay(l)}
                formatter={(value: number, name: string) => [
                  nf.format(value),
                  name === "views" ? "Views" : "Seguidores",
                ]}
              />
              <Area
                type="monotone"
                dataKey="views"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#gViews)"
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="followers"
                stroke="var(--info)"
                strokeWidth={2}
                fill="url(#gFollowers)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
