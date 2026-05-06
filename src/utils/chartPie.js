export function pieSlicePath(cx, cy, r, a0, a1) {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
}

export function buildPieSlices(entries) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  return entries.map((e) => {
    const frac = e.value / total;
    const a0 = angle;
    const a1 = angle + frac * 2 * Math.PI;
    angle = a1;
    return { ...e, pct: frac * 100, a0, a1 };
  });
}
