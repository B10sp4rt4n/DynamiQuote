import { Circle, Document, G, Line, Page, Polyline, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { fillProposalFinancialMonths, summarizeProposalFinancials } from "@/lib/domain/proposal-financial-kpis";
import type { ProposalKpiReportData } from "@/lib/reports/proposal-kpis";

const colors = { ink: "#17212f", muted: "#657182", grid: "#e2e7ed", green: "#16804a", blue: "#2864ad", red: "#b93e42" };
const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 42, fontSize: 9, color: colors.ink, fontFamily: "Helvetica", letterSpacing: 0 },
  eyebrow: { fontSize: 8, color: colors.muted, letterSpacing: 1.4, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 5 },
  meta: { fontSize: 8, color: colors.muted, marginBottom: 4 },
  header: { paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.grid, marginBottom: 15 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 11 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  tile: { width: "31.9%", padding: 11, minHeight: 65, backgroundColor: "#f4f7fa", borderRadius: 5 },
  tileLabel: { color: colors.muted, fontSize: 8, marginBottom: 8 },
  tileValue: { fontSize: 15, fontWeight: 700 },
  chart: { marginBottom: 14 },
  chartTitle: { fontSize: 10, fontWeight: 700, marginBottom: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4, marginLeft: 48 },
  legendText: { fontSize: 7, color: colors.muted },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: colors.grid, paddingVertical: 6 },
  th: { backgroundColor: "#edf2f6", fontWeight: 700 },
  cell: { flex: 1, textAlign: "right", fontSize: 8, paddingHorizontal: 5 },
  firstCell: { flex: 1, textAlign: "left", fontSize: 8, paddingHorizontal: 5 },
  empty: { padding: 20, color: colors.muted, backgroundColor: "#f7f9fb", marginBottom: 12 },
  footer: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: colors.muted, fontSize: 7 },
});

const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(n);
const pct = (n: number | null) => n === null ? "Sin revenue" : `${n.toFixed(1)}%`;
const month = (iso: string) => new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(iso));
const compact = (n: number) => new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(n);

type Series = { name: string; color: string; values: (number | null)[] };

function Chart({ title, labels, series, percent = false, line = false, average = null }: {
  title: string; labels: string[]; series: Series[]; percent?: boolean; line?: boolean; average?: number | null;
}) {
  if (!labels.length) return <View wrap={false}><Text style={styles.chartTitle}>{title}</Text><Text style={styles.empty}>Sin datos en el periodo</Text></View>;
  const values = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (average !== null) values.push(average);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const low = min < 0 ? min - span * 0.08 : 0;
  const high = max + span * 0.12;
  const left = 48, top = 9, plotW = 472, plotH = 112;
  const y = (value: number) => top + plotH - (value - low) / (high - low) * plotH;
  const bucket = plotW / labels.length;
  const x = (index: number) => left + bucket * (index + 0.5);
  const barW = Math.min(35, bucket * 0.72 / series.length);
  return (
    <View style={styles.chart} wrap={false}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Svg width={540} height={145} viewBox="0 0 540 145">
        {[0, 1, 2, 3, 4].map((i) => {
          const value = low + (high - low) * i / 4;
          return <G key={`tick-${i}`}><Line x1={left} x2={left + plotW} y1={y(value)} y2={y(value)} stroke={colors.grid} strokeWidth={0.6} /><Text x={left - 5} y={y(value) + 3} textAnchor="end" style={{ fontSize: 7 }} fill={colors.muted}>{percent ? `${value.toFixed(1)}%` : compact(value)}</Text></G>;
        })}
        <Line x1={left} x2={left + plotW} y1={y(0)} y2={y(0)} stroke="#aeb9c5" strokeWidth={0.7} />
        {series.map((s, si) => s.values.map((value, i) => {
          if (value === null) return null;
          const previous = s.values[i - 1];
          return line ? <G key={`${si}-${i}`}>
            {i > 0 && previous !== null && previous !== undefined ? <Polyline points={`${x(i - 1)},${y(previous)} ${x(i)},${y(value)}`} stroke={s.color} strokeWidth={2} fill="none" /> : null}
            <Circle cx={x(i)} cy={y(value)} r={2.8} fill="white" stroke={s.color} strokeWidth={1.5} />
          </G> : <Rect key={`${si}-${i}`} x={x(i) - barW * series.length / 2 + si * barW} y={Math.min(y(value), y(0))} width={Math.max(1, barW - 2)} height={Math.abs(y(value) - y(0))} fill={s.color} />;
        }))}
        {average !== null ? <Line x1={left} x2={left + plotW} y1={y(average)} y2={y(average)} stroke={colors.ink} strokeWidth={1.3} strokeDasharray="5 3" /> : null}
        {labels.map((label, i) => <Text key={`${label}-${i}`} x={x(i)} y={137} textAnchor="middle" style={{ fontSize: 7 }} fill={colors.muted}>{label}</Text>)}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => <Text key={s.name} style={{ ...styles.legendText, color: s.color }}>{s.name}</Text>)}
        {average !== null ? <Text style={styles.legendText}>- - Promedio ponderado: {pct(average)}</Text> : null}
      </View>
    </View>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return <View style={styles.tile}><Text style={styles.tileLabel}>{label}</Text><Text style={styles.tileValue}>{value}</Text></View>;
}
function Row({ cells, header = false }: { cells: string[]; header?: boolean }) {
  return <View wrap={false} style={header ? [styles.row, styles.th] : styles.row}>{cells.map((cell, i) => <Text key={i} style={i === 0 ? styles.firstCell : styles.cell}>{cell}</Text>)}</View>;
}

function RankingTable({ ranking }: { ranking: ProposalKpiReportData["ranking"] }) {
  return <View style={{ marginTop: 15 }}>
        <Text style={styles.chartTitle}>Vendedores por monto aprobado (historico)</Text>
        <Row header cells={["Vendedor", "Propuestas", "Aprobadas", "Monto aprobado"]} />
        {ranking.map((p) => <Row key={p.userId} cells={[p.displayName, String(p.totalCount), String(p.approvedCount), money(p.approvedAmount)]} />)}
      </View>;
}

function Frame({ title, children, scope, tenantName, period, date }: { title: string; children: ReactNode; scope: string; tenantName: string; period: string; date: string }) {
  return <Page size="LETTER" style={styles.page}>
    <View style={styles.header}>
      <Svg width={540} height={64} viewBox="0 0 540 64">
        <Text x={0} y={8} style={{ fontSize: 8 }} fill={colors.muted}>{scope.toUpperCase()} DE KPIs</Text>
        <Text x={0} y={31} style={{ fontSize: Math.max(12, Math.min(22, 540 / Math.max(1, tenantName.length * 0.6))), fontFamily: "Helvetica-Bold" }} fill={colors.ink}>{tenantName}</Text>
        <Text x={0} y={47} style={{ fontSize: 8 }} fill={colors.muted}>{`Periodo: ${period} | Emision: ${date} (Ciudad de Mexico)`}</Text>
        <Text x={0} y={61} style={{ fontSize: 8 }} fill={colors.muted}>Moneda: MXN | Importes antes de IVA</Text>
      </Svg>
    </View>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
    <View style={styles.footer} fixed>
      <Svg width={440} height={10}><Text x={0} y={7} style={{ fontSize: 7 }} fill={colors.muted}>{`${tenantName} | KPIs comerciales`}</Text></Svg>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  </Page>;
}

export function ProposalKpiPdfDocument({ report, generatedAt }: { report: ProposalKpiReportData; generatedAt: Date }) {
  const { summary, tenantName } = report;
  const timeline = fillProposalFinancialMonths(report.marginTimeline);
  const totals = summarizeProposalFinancials(timeline);
  const labels = timeline.map((p) => month(p.period));
  const marginValues = timeline.map((p) => p.wonAmount !== 0 ? p.wonMarginPct : null);
  const date = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "America/Mexico_City" }).format(generatedAt);
  const period = labels.length ? `${labels[0]} a ${labels[labels.length - 1]}` : "Sin actividad mensual";
  const ranking = [...report.ranking].sort((a, b) => b.approvedAmount - a.approvedAmount);
  const rankingPages = Array.from({ length: Math.ceil(ranking.length / 12) }, (_, index) => ranking.slice(index * 12, (index + 1) * 12));
  const scope = report.canSeeAll ? "Reporte general" : "Reporte individual";
  return <Document title={`Reporte KPIs - ${tenantName}`} author={tenantName} subject="Indicadores comerciales y rentabilidad">
    <Frame scope={scope} tenantName={tenantName} period={period} date={date} title="Resultados del periodo">
      <View style={styles.tiles}>
        <Tile label="Revenue ganado" value={money(totals.revenue)} />
        <Tile label="Utilidad de ganadas" value={money(totals.profit)} />
        <Tile label="Margen ponderado" value={pct(totals.marginPct)} />
        <Tile label="Revenue promedio mensual" value={money(totals.averageMonthlyRevenue)} />
        <Tile label="Propuestas (historico)" value={String(summary.totalCount)} />
        <Tile label="Tasa de aprobacion (historico)" value={pct(summary.conversionRatePct)} />
      </View>
      <Chart title="Revenue ganado por mes (MXN)" labels={labels} series={[{ name: "Revenue ganado", color: colors.green, values: timeline.map((p) => p.wonAmount) }]} />
      <Chart title="Utilidad de propuestas ganadas por mes (MXN)" labels={labels} series={[{ name: "Utilidad de ganadas", color: colors.blue, values: timeline.map((p) => p.wonProfit) }]} />
    </Frame>
    <Frame scope={scope} tenantName={tenantName} period={period} date={date} title="Margen y evolucion mensual">
      <Chart title="Margen de ganadas por mes (%)" labels={labels} series={[{ name: "Margen mensual", color: colors.green, values: marginValues }]} percent average={totals.marginPct} />
      <Chart title="Tendencia del margen mes a mes (%)" labels={labels} series={[{ name: "Margen mensual", color: colors.green, values: marginValues }]} percent line average={totals.marginPct} />
      <Text style={styles.chartTitle}>Detalle financiero mensual</Text>
      <Row header cells={["Mes", "Revenue ganado", "Utilidad", "Margen"]} />
      {timeline.map((p) => <Row key={p.period} cells={[month(p.period), money(p.wonAmount), money(p.wonProfit), pct(p.wonAmount !== 0 ? p.wonMarginPct : null)]} />)}
      <Row header cells={["Total del periodo", money(totals.revenue), money(totals.profit), pct(totals.marginPct)]} />
      {summary.undatedWonCount > 0 ? <Row cells={["Sin fecha", money(summary.undatedWonAmount), money(summary.undatedWonProfit), pct(summary.undatedWonAmount !== 0 ? summary.undatedWonProfit / summary.undatedWonAmount * 100 : null)]} /> : null}
    </Frame>
    <Frame scope={scope} tenantName={tenantName} period={period} date={date} title="Actividad comercial">
      <View style={styles.tiles}>
        <Tile label="Revenue ganado (historico)" value={money(summary.wonAmount)} />
        <Tile label="Monto propuesto (historico)" value={money(summary.proposedAmount)} />
        <Tile label="Monto aprobado (historico)" value={money(summary.approvedAmount)} />
      </View>
      <Chart title="Ganado y perdido por mes (MXN)" labels={report.outcomeTimeline.map((p) => month(p.period))} series={[
        { name: "Ganado", color: colors.green, values: report.outcomeTimeline.map((p) => p.wonAmount) },
        { name: "Perdido", color: colors.red, values: report.outcomeTimeline.map((p) => p.lostAmount) },
      ]} />
      <Text style={styles.chartTitle}>Propuestas por estado (historico)</Text>
      <Row header cells={["Estado", "Propuestas", "Estado", "Propuestas"]} />
      <Row cells={["Borrador", String(summary.draftCount), "Enviada", String(summary.sentCount)]} />
      <Row cells={["En revision", String(summary.inReviewCount), "Aprobada", String(summary.approvedCount)]} />
      <Row cells={["Rechazada", String(summary.rejectedCount), "Vencida", String(summary.expiredCount)]} />
      {report.canSeeAll && report.ranking.length > 0 && report.ranking.length <= 4 ? <RankingTable ranking={ranking} /> : null}
    </Frame>
    {report.canSeeAll && ranking.length > 4 ? rankingPages.map((rows, index) => <Frame key={index} scope={scope} tenantName={tenantName} period={period} date={date} title="Desempeno por vendedor">
      <RankingTable ranking={rows} />
    </Frame>) : null}
  </Document>;
}
